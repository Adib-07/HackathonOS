import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "node:http";
import app, {
  db,
  pool,
  buildBriefsTable,
  competitionAnalysesTable,
  competitionsTable,
  ideaCandidatesTable,
  ideaEvaluationsTable,
  ideaRubricsTable,
  researchFindingsTable,
  researchGapsTable,
} from "../dist/app.mjs";
import { eq } from "drizzle-orm";
import { setupTestDatabase } from "./setup.mjs";
import { cleanupTestUser, uniqueTestUser } from "./test-helpers.mjs";

await setupTestDatabase();

let server;
let baseUrl = "";
const createdUsers = [];

function newUser() {
  const u = uniqueTestUser("intel");
  createdUsers.push(u);
  return u;
}

const DEADLINE = new Date(Date.now() + 14 * 86400000).toISOString();

async function call(path, { method = "GET", body, userId } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (userId) headers["x-test-user-id"] = userId;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function createCompetition(userId, overrides = {}) {
  const created = await call("/api/competitions", {
    method: "POST",
    userId,
    body: {
      name: "Intel Test Hackathon",
      organizer: "Verification Lab",
      competitionType: "hybrid",
      deadline: DEADLINE,
      teamSize: 3,
      teamSkills: ["TypeScript", "PostgreSQL"],
      mandatoryDeliverables: ["Working demo", "Repository"],
      problemStatement:
        "Neighbourhoods cannot tell which solar installers actually deliver.",
      officialUrl: "https://example.com/event",
      rulesUrl: "https://example.com/rules",
      ...overrides,
    },
  });
  assert.equal(created.status, 201);
  return created.json.id;
}

before(async () => {
  process.env.NODE_ENV = "test";
  await new Promise((resolve) => {
    server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  for (const u of createdUsers) {
    await cleanupTestUser(u);
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
});

// --- authentication and ownership ---------------------------------------

test("every intel route requires authentication", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const calls = [
    ["POST", `/api/competitions/${competitionId}/analysis`],
    ["GET", `/api/competitions/${competitionId}/analysis`],
    ["POST", `/api/competitions/${competitionId}/research`],
    ["GET", `/api/competitions/${competitionId}/research`],
    ["POST", `/api/competitions/${competitionId}/gaps`],
    ["GET", `/api/competitions/${competitionId}/gaps`],
    ["POST", `/api/competitions/${competitionId}/ideas`],
    ["GET", `/api/competitions/${competitionId}/ideas`],
    ["GET", `/api/competitions/${competitionId}/briefs`],
  ];
  for (const [method, path] of calls) {
    const res = await call(path, { method });
    assert.equal(res.status, 401, `${method} ${path} should require auth`);
  }
});

test("another owner cannot reach the intel routes", async () => {
  const userA = newUser();
  const userB = newUser();
  const competitionId = await createCompetition(userA);

  const res = await call(`/api/competitions/${competitionId}/analysis`, {
    method: "POST",
    userId: userB,
  });
  assert.equal(res.status, 404);
});

test("another owner cannot read the research findings", async () => {
  const userA = newUser();
  const userB = newUser();
  const competitionId = await createCompetition(userA);

  const res = await call(`/api/competitions/${competitionId}/research`, {
    userId: userB,
  });
  assert.equal(res.status, 404);
});

test("another owner cannot read the ideas", async () => {
  const userA = newUser();
  const userB = newUser();
  const competitionId = await createCompetition(userA);

  const res = await call(`/api/competitions/${competitionId}/ideas`, {
    userId: userB,
  });
  assert.equal(res.status, 404);
});

test("another owner cannot delete a finding", async () => {
  const userA = newUser();
  const userB = newUser();
  const competitionId = await createCompetition(userA);

  const res = await call(`/api/competitions/${competitionId}/research`, {
    method: "POST",
    userId: userA,
    body: {
      manual: true,
      title: "A manual note",
      summary: "Something the team observed.",
      sourceUrl: "https://example.com/source",
    },
  });
  assert.equal(res.status, 201);
  const findingId = res.json.finding.id;

  const other = await call(
    `/api/competitions/${competitionId}/research/${findingId}`,
    { method: "DELETE", userId: userB },
  );
  assert.equal(other.status, 404);

  const still = await call(`/api/competitions/${competitionId}/research`, {
    userId: userA,
  });
  assert.ok(still.json.findings.some((item) => item.id === findingId));
});

// --- problem analysis ---------------------------------------------------

test("problem analysis runs without an AI provider and uses the stored record", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const res = await call(`/api/competitions/${competitionId}/analysis`, {
    method: "POST",
    userId,
  });
  assert.equal(res.status, 201);
  assert.ok(res.json.analysis);
  assert.equal(res.json.analysis.method, "DETERMINISTIC");
  assert.ok(res.json.note, "the user must be told the AI part did not run");

  const requirements = res.json.requirements;
  const core = requirements.find(
    (item) => item.category === "CORE_PROBLEM",
  );
  assert.ok(core, "the recorded problem statement must be extracted");
  assert.equal(
    core.text,
    "Neighbourhoods cannot tell which solar installers actually deliver.",
  );
  assert.equal(core.claimKind, "VERIFIED_FACT");
  assert.equal(core.source, "COMPETITION_BRIEF");

  const deliverables = requirements.filter(
    (item) => item.category === "MANDATORY_DELIVERABLES",
  );
  assert.equal(deliverables.length, 2);
});

test("problem analysis names the fields that are missing", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const res = await call(`/api/competitions/${competitionId}/analysis`, {
    method: "POST",
    userId,
  });
  const missing = res.json.analysis.missingFields;
  assert.ok(missing.includes("Judging criteria"));
  assert.ok(missing.includes("Exclusions and prohibited approaches"));
  assert.ok(res.json.analysis.unansweredQuestions.length > 0);
});

test("the analysis can be read back", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  await call(`/api/competitions/${competitionId}/analysis`, {
    method: "POST",
    userId,
  });

  const res = await call(`/api/competitions/${competitionId}/analysis`, {
    userId,
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.analysis);
  assert.equal(res.json.analysis.method, "DETERMINISTIC");
});

test("a requirement can be edited and marked reviewed", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  await call(`/api/competitions/${competitionId}/analysis`, {
    method: "POST",
    userId,
  });

  const listed = await call(`/api/competitions/${competitionId}/analysis`, {
    userId,
  });
  const requirement = listed.json.requirements[0];

  const res = await call(
    `/api/competitions/${competitionId}/analysis/requirements/${requirement.id}`,
    { method: "PATCH", userId, body: { reviewed: true } },
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.reviewed, true);

  const res2 = await call(
    `/api/competitions/${competitionId}/analysis/requirements/${requirement.id}`,
    { method: "PATCH", userId, body: { text: "Updated requirement text." } },
  );
  assert.equal(res2.status, 200);
  assert.equal(res2.json.text, "Updated requirement text.");
});

test("another owner cannot edit a requirement", async () => {
  const userA = newUser();
  const userB = newUser();
  const competitionId = await createCompetition(userA);

  await call(`/api/competitions/${competitionId}/analysis`, {
    method: "POST",
    userId: userA,
  });

  const listed = await call(`/api/competitions/${competitionId}/analysis`, {
    userId: userA,
  });
  const requirement = listed.json.requirements[0];

  const res = await call(
    `/api/competitions/${competitionId}/analysis/requirements/${requirement.id}`,
    { method: "PATCH", userId: userB, body: { reviewed: true } },
  );
  assert.equal(res.status, 404);
});

test("an empty requirement is rejected", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  await call(`/api/competitions/${competitionId}/analysis`, {
    method: "POST",
    userId,
  });

  const listed = await call(`/api/competitions/${competitionId}/analysis`, {
    userId,
  });
  const requirement = listed.json.requirements[0];

  const res = await call(
    `/api/competitions/${competitionId}/analysis/requirements/${requirement.id}`,
    { method: "PATCH", userId, body: { text: "   " } },
  );
  assert.equal(res.status, 400);
});

// --- research -----------------------------------------------------------

test("a manual research finding is stored and labelled as a source", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const res = await call(`/api/competitions/${competitionId}/research`, {
    method: "POST",
    userId,
    body: {
      manual: true,
      title: "Installer comparison site",
      summary: "Compares installers by installation count.",
      sourceUrl: "https://example.com/compare",
      sourceType: "EXISTING_PRODUCT",
      supports: "Shows that comparison data is collected.",
      limitations: "Does not record delivery quality.",
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.finding.provider, "manual");
  assert.equal(res.json.finding.claimKind, "SOURCE_SUPPORTED");
  assert.equal(res.json.finding.manual, true);
  assert.equal(res.json.finding.sourceUrl, "https://example.com/compare");
});

test("a manual finding needs a title and a summary", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const res = await call(`/api/competitions/${competitionId}/research`, {
    method: "POST",
    userId,
    body: { manual: true, title: "Only a title" },
  });
  assert.equal(res.status, 400);
});

test("a manual finding rejects a non-http source URL", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const res = await call(`/api/competitions/${competitionId}/research`, {
    method: "POST",
    userId,
    body: {
      manual: true,
      title: "Bad url",
      summary: "Summary",
      sourceUrl: "javascript:alert(1)",
    },
  });
  assert.equal(res.status, 400);
});

test("a research query that is too short is rejected", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const res = await call(`/api/competitions/${competitionId}/research`, {
    method: "POST",
    userId,
    body: { query: "ab" },
  });
  assert.equal(res.status, 400);
});

test("research findings are readable and deletable by the owner", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  await call(`/api/competitions/${competitionId}/research`, {
    method: "POST",
    userId,
    body: {
      manual: true,
      title: "Findable finding",
      summary: "Can be listed and deleted.",
      sourceUrl: "https://example.com/findable",
    },
  });

  const listed = await call(`/api/competitions/${competitionId}/research`, {
    userId,
  });
  assert.equal(listed.status, 200);
  assert.ok(listed.json.findings.length >= 1);

  const target = listed.json.findings[0];
  const removed = await call(
    `/api/competitions/${competitionId}/research/${target.id}`,
    { method: "DELETE", userId },
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.json.deleted, true);
});

// --- gap analysis -------------------------------------------------------

test("gap analysis reports where the evidence runs out", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const res = await call(`/api/competitions/${competitionId}/gaps`, {
    method: "POST",
    userId,
  });
  assert.equal(res.status, 201);
  assert.ok(res.json.evidenceGaps.length > 0);
  assert.ok(res.json.nextInvestigations.length > 0);
  assert.ok(res.json.gaps.length >= 1);

  for (const gap of res.json.gaps) {
    assert.notEqual(gap.claimKind, "VERIFIED_FACT");
  }
});

test("gap analysis refuses to claim a competitor does not exist", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const res = await call(`/api/competitions/${competitionId}/gaps`, {
    method: "POST",
    userId,
  });
  const all = res.json.evidenceGaps.join(" ");
  assert.match(all, /no claim is made about which competitors exist/i);
});

// --- ideas --------------------------------------------------------------

test("idea generation reports a clear configuration error without a provider", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId, { teamSize: 3 });

  const res = await call(`/api/competitions/${competitionId}/ideas`, {
    method: "POST",
    userId,
  });
  assert.equal(res.status, 503);
  assert.equal(res.json.code, "AI_NOT_CONFIGURED");
  assert.ok(res.json.missing.includes("OPENAI_API_KEY"));
  assert.ok(res.json.context.hoursRemaining > 0);
  assert.equal(res.json.context.teamSize, 3);
  assert.ok(!res.text.includes("sk-"));
});

test("an idea can be scored by hand and the total is computed", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const [idea] = await db
    .insert(ideaCandidatesTable)
    .values({
      competitionId,
      name: "Installer Trust Board",
      pitch: "Shows which installers actually delivered.",
      targetUser: "Homeowners",
      problemSolved: "Solar delivery is unverified.",
      proposedSolution: "A public delivery record.",
      differentiator: "Delivery outcomes, not install counts.",
      coreUserJourney: "Search, compare, verify.",
      mvpFeatures: ["Search", "Delivery record"],
      excludedFeatures: ["Payments", "Install scheduling"],
      architectureSuggestion: "One service and one database.",
      dataAndIntegrations: "Installer records.",
      feasibilityNote: "Fits in the time available.",
      risks: ["Data access"],
      demoStrategy: "Show three records.",
      supportingEvidence: [],
      unverifiedAssumptions: ["Installers will share data"],
      claimKind: "INFERENCE",
    })
    .returning();

  const res = await call(
    `/api/competitions/${competitionId}/ideas/${idea.id}/evaluate`,
    {
      method: "POST",
      userId,
      body: {
        scores: [
          {
            dimension: "PROBLEM_RELEVANCE",
            score: 5,
            rationale: "Directly addresses the recorded problem.",
            confidence: "HIGH",
          },
          {
            dimension: "JUDGING_ALIGNMENT",
            score: 3,
            rationale: "Judging criteria are not recorded yet.",
            uncertainties: ["Judging criteria unknown"],
            confidence: "LOW",
          },
          {
            dimension: "USER_VALUE",
            score: 4,
            rationale: "Homeowners would use it before installing.",
            confidence: "MEDIUM",
          },
        ],
      },
    },
  );
  assert.equal(res.status, 200);
  assert.ok(res.json.evaluation.total > 0);
  assert.equal(res.json.evaluation.scores.length, 3);
  assert.ok(res.json.evaluation.uncertainDimensions.includes("JUDGING_ALIGNMENT"));
});

test("an invalid score is rejected", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const [idea] = await db
    .insert(ideaCandidatesTable)
    .values({
      competitionId,
      name: "Bad Score Idea",
      pitch: "p",
      targetUser: "u",
      problemSolved: "ps",
      proposedSolution: "s",
      differentiator: "d",
      coreUserJourney: "j",
      mvpFeatures: [],
      excludedFeatures: [],
      architectureSuggestion: "a",
      dataAndIntegrations: "d",
      feasibilityNote: "f",
      risks: [],
      demoStrategy: "demo",
      supportingEvidence: [],
      unverifiedAssumptions: [],
    })
    .returning();

  const res = await call(
    `/api/competitions/${competitionId}/ideas/${idea.id}/evaluate`,
    {
      method: "POST",
      userId,
      body: { scores: [{ dimension: "PROBLEM_RELEVANCE", score: "high" }] },
    },
  );
  assert.equal(res.status, 400);
  assert.equal(res.json.code, "NO_SCORES");
});

test("another owner cannot score an idea", async () => {
  const userA = newUser();
  const userB = newUser();
  const competitionId = await createCompetition(userA);

  const [idea] = await db
    .insert(ideaCandidatesTable)
    .values({
      competitionId,
      name: "Owned Idea",
      pitch: "p",
      targetUser: "u",
      problemSolved: "ps",
      proposedSolution: "s",
      differentiator: "d",
      coreUserJourney: "j",
      mvpFeatures: [],
      excludedFeatures: [],
      architectureSuggestion: "a",
      dataAndIntegrations: "d",
      feasibilityNote: "f",
      risks: [],
      demoStrategy: "demo",
      supportingEvidence: [],
      unverifiedAssumptions: [],
    })
    .returning();

  const res = await call(
    `/api/competitions/${competitionId}/ideas/${idea.id}/evaluate`,
    { method: "POST", userId: userB, body: { scores: [] } },
  );
  assert.equal(res.status, 404);
});

test("a rubric can be saved and is normalised", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const res = await call(`/api/competitions/${competitionId}/rubric`, {
    method: "PUT",
    userId,
    body: {
      weights: {
        PROBLEM_RELEVANCE: 30,
        JUDGING_ALIGNMENT: 30,
        USER_VALUE: 10,
        DIFFERENTIATION: 10,
        TECHNICAL_FEASIBILITY: 10,
        DEMONSTRABILITY: 5,
        IMPLEMENTATION_TIME: 2,
        RELIABILITY_RISK: 1,
        DATA_AVAILABILITY: 1,
        POTENTIAL_IMPACT: 1,
      },
    },
  });
  assert.equal(res.status, 200);
  const total = Object.values(res.json.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-6, `weights summed to ${total}`);
});

test("ideas are listed with their comparison", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  await db
    .insert(ideaCandidatesTable)
    .values({
      competitionId,
      name: "Listed Idea",
      pitch: "p",
      targetUser: "u",
      problemSolved: "ps",
      proposedSolution: "s",
      differentiator: "d",
      coreUserJourney: "j",
      mvpFeatures: [],
      excludedFeatures: [],
      architectureSuggestion: "a",
      dataAndIntegrations: "d",
      feasibilityNote: "f",
      risks: [],
      demoStrategy: "demo",
      supportingEvidence: [],
      unverifiedAssumptions: [],
      claimKind: "INFERENCE",
    });

  const res = await call(`/api/competitions/${competitionId}/ideas`, {
    userId,
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.ideas.length >= 1);
  assert.ok(res.json.comparison);
  assert.ok(res.json.weights);
});

test("a decision needs a rationale", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const [idea] = await db
    .insert(ideaCandidatesTable)
    .values({
      competitionId,
      name: "Decision Idea",
      pitch: "p",
      targetUser: "u",
      problemSolved: "ps",
      proposedSolution: "s",
      differentiator: "d",
      coreUserJourney: "j",
      mvpFeatures: [],
      excludedFeatures: [],
      architectureSuggestion: "a",
      dataAndIntegrations: "d",
      feasibilityNote: "f",
      risks: [],
      demoStrategy: "demo",
      supportingEvidence: [],
      unverifiedAssumptions: [],
      claimKind: "INFERENCE",
    })
    .returning();

  const noReason = await call(
    `/api/competitions/${competitionId}/ideas/${idea.id}/decision`,
    { method: "POST", userId, body: { status: "selected" } },
  );
  assert.equal(noReason.status, 400);

  const res = await call(
    `/api/competitions/${competitionId}/ideas/${idea.id}/decision`,
    {
      method: "POST",
      userId,
      body: { status: "selected", rationale: "Best fit for the recorded problem." },
    },
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.idea.status, "selected");
  assert.equal(
    res.json.idea.decisionRationale,
    "Best fit for the recorded problem.",
  );
});

// --- build brief --------------------------------------------------------

test("a build brief is saved against the right competition", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId);

  const [idea] = await db
    .insert(ideaCandidatesTable)
    .values({
      competitionId,
      name: "Selected Idea",
      pitch: "p",
      targetUser: "u",
      problemSolved: "ps",
      proposedSolution: "s",
      differentiator: "d",
      coreUserJourney: "j",
      mvpFeatures: [],
      excludedFeatures: [],
      architectureSuggestion: "a",
      dataAndIntegrations: "d",
      feasibilityNote: "f",
      risks: [],
      demoStrategy: "demo",
      supportingEvidence: [],
      unverifiedAssumptions: [],
      claimKind: "INFERENCE",
      status: "selected",
    })
    .returning();

  const res = await call(
    `/api/competitions/${competitionId}/ideas/${idea.id}/brief`,
    { method: "POST", userId },
  );
  assert.equal(res.status, 201);
  assert.equal(res.json.brief.competitionId, competitionId);
  assert.equal(res.json.brief.ideaId, idea.id);
  assert.equal(res.json.brief.ideaName, idea.name);
  assert.ok(res.json.brief.content.problemStatement);
  assert.ok(Array.isArray(res.json.missingSections));
});

test("briefs are readable and are scoped to the competition", async () => {
  const userA = newUser();
  const userB = newUser();
  const competitionId = await createCompetition(userA);

  const [idea] = await db
    .insert(ideaCandidatesTable)
    .values({
      competitionId,
      name: "Brief Idea",
      pitch: "p",
      targetUser: "u",
      problemSolved: "ps",
      proposedSolution: "s",
      differentiator: "d",
      coreUserJourney: "j",
      mvpFeatures: [],
      excludedFeatures: [],
      architectureSuggestion: "a",
      dataAndIntegrations: "d",
      feasibilityNote: "f",
      risks: [],
      demoStrategy: "demo",
      supportingEvidence: [],
      unverifiedAssumptions: [],
      claimKind: "INFERENCE",
      status: "selected",
    })
    .returning();

  await call(
    `/api/competitions/${competitionId}/ideas/${idea.id}/brief`,
    { method: "POST", userId: userA },
  );

  const res = await call(`/api/competitions/${competitionId}/briefs`, {
    userId: userA,
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.briefs.length >= 1);
  assert.equal(res.json.briefs[0].competitionId, competitionId);

  const other = await call(`/api/competitions/${competitionId}/briefs`, {
    userId: userB,
  });
  assert.equal(other.status, 404);
});

test("a brief cannot be written for another owner's competition", async () => {
  const res = await call(`/api/competitions/00000000-0000-0000-0000-000000000000/ideas/x/brief`, {
    method: "POST",
    userId: newUser(),
  });
  assert.equal(res.status, 404);
});

test("no intel artefact leaks another competition's data", async () => {
  const userId = newUser();
  const competitionId = await createCompetition(userId, { name: "First Competition" });
  const competitionId2 = await createCompetition(userId, { name: "Second Competition" });

  await call(`/api/competitions/${competitionId2}/analysis`, {
    method: "POST",
    userId,
  });

  const first = await call(`/api/competitions/${competitionId}/analysis`, {
    userId,
  });
  const second = await call(`/api/competitions/${competitionId2}/analysis`, {
    userId,
  });

  assert.notEqual(
    first.json.analysis.id,
    second.json.analysis.id,
    "each competition keeps its own analysis",
  );

  const firstIds = new Set(first.json.requirements.map((item) => item.id));
  const shared = second.json.requirements.filter((item) => firstIds.has(item.id));
  assert.equal(shared.length, 0, "requirements must not be shared across competitions");

  assert.notEqual(
    first.json.requirements.length,
    second.json.requirements.length,
  );
});
