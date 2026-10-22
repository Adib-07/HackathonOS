import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAIM_KINDS,
  isEstablished,
  normaliseClaimKind,
  normaliseRequirementCategory,
  normaliseRequirementSource,
  supportLevelFor,
} from "../src/lib/intel/claims.ts";
import {
  extractDeterministicRequirements,
  groupRequirements,
  mergeAiRequirements,
} from "../src/lib/intel/problem-analysis.ts";
import {
  DEFAULT_IDEA_WEIGHTS,
  IDEA_DIMENSIONS,
  clampScore,
  compareIdeas,
  computeSensitivity,
  computeWeightedTotal,
  dedupeIdeas,
  evaluateIdea,
  normaliseWeights,
  parseModelIdeas,
  parseModelScores,
} from "../src/lib/intel/ideas.ts";
import {
  buildDeterministicGaps,
  buildBriefFromIdea,
  mergeAiGaps,
  parseModelBuildBrief,
} from "../src/lib/intel/gaps.ts";
import {
  parseJsonObject,
  describeMissingConfiguration,
} from "../src/lib/intel/openai-provider.ts";
import { AiError } from "../src/lib/intel/ai-types.ts";

const DEADLINE = new Date(Date.now() + 6 * 86400000).toISOString();

function makeBrief(overrides = {}) {
  return {
    id: "comp-1",
    name: "CityLab Build Weekend",
    organizer: "CityLab",
    competitionType: "hybrid",
    deadline: DEADLINE,
    startAt: null,
    teamSize: 3,
    teamSkills: ["TypeScript", "PostgreSQL"],
    mandatoryDeliverables: ["Working demo", "Repository"],
    currentTrack: "Civic Tech",
    trackMode: "choose",
    problemStatement: "Communities cannot adopt solar because the process is opaque.",
    officialUrl: "https://example.com/event",
    rulesUrl: "https://example.com/rules",
    ideaComplexity: 3,
    status: "preparing",
    ...overrides,
  };
}

// --- claim kinds -------------------------------------------------------

test("an unrecognised claim kind is downgraded to an inference", () => {
  assert.equal(normaliseClaimKind("VERIFIED_FACT"), "VERIFIED_FACT");
  assert.equal(normaliseClaimKind("verified fact"), "VERIFIED_FACT");
  assert.equal(normaliseClaimKind("source-supported"), "SOURCE_SUPPORTED");
  assert.equal(normaliseClaimKind("totally made up"), "INFERENCE");
  assert.equal(normaliseClaimKind(undefined), "INFERENCE");
  assert.equal(normaliseClaimKind(42), "INFERENCE");
});

test("only verified and source-supported claims count as established", () => {
  assert.ok(isEstablished("VERIFIED_FACT"));
  assert.ok(isEstablished("SOURCE_SUPPORTED"));
  assert.ok(!isEstablished("INFERENCE"));
  assert.ok(!isEstablished("HYPOTHESIS"));
  assert.ok(!isEstablished("UNKNOWN"));
});

test("support level follows the claim kind", () => {
  assert.equal(supportLevelFor("VERIFIED_FACT"), "STRONG");
  assert.equal(supportLevelFor("SOURCE_SUPPORTED"), "MODERATE");
  assert.equal(supportLevelFor("INFERENCE"), "WEAK");
  assert.equal(supportLevelFor("UNKNOWN"), "NONE");
});

test("an unrecognised requirement category falls back safely", () => {
  assert.equal(normaliseRequirementCategory("CORE_PROBLEM"), "CORE_PROBLEM");
  assert.equal(normaliseRequirementCategory("nonsense"), "CORE_PROBLEM");
  assert.equal(normaliseRequirementSource("USER_INPUT"), "USER_INPUT");
  assert.equal(normaliseRequirementSource("nonsense"), "AI_INFERENCE");
});

test("every claim kind has a label and a description", () => {
  for (const kind of CLAIM_KINDS) {
    assert.ok(kind.length > 0);
  }
});

// --- problem analysis ---------------------------------------------------

test("deterministic extraction reads the stored record", () => {
  const result = extractDeterministicRequirements(makeBrief());
  const byCategory = new Map();
  for (const item of result.requirements) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }

  const core = byCategory.get("CORE_PROBLEM");
  assert.equal(core.length, 1);
  assert.equal(
    core[0].text,
    "Communities cannot adopt solar because the process is opaque.",
  );
  assert.equal(core[0].claimKind, "VERIFIED_FACT");
  assert.equal(core[0].source, "COMPETITION_BRIEF");

  const deliverables = byCategory.get("MANDATORY_DELIVERABLES");
  assert.deepEqual(
    deliverables.map((item) => item.text).sort(),
    ["Repository", "Working demo"],
  );
  assert.ok(deliverables.every((item) => item.claimKind === "VERIFIED_FACT"));

  assert.deepEqual(
    byCategory.get("TEAM_SKILLS").map((item) => item.text).sort(),
    ["PostgreSQL", "TypeScript"],
  );
});

test("missing fields are identified rather than invented", () => {
  const result = extractDeterministicRequirements(
    makeBrief({
      problemStatement: null,
      teamSkills: [],
      mandatoryDeliverables: [],
    }),
  );

  assert.ok(result.missingFields.includes("Problem statement"));
  assert.ok(result.missingFields.includes("Team skills"));
  assert.ok(result.missingFields.includes("Mandatory deliverables"));
  assert.ok(result.missingFields.includes("Judging criteria"));
  assert.ok(result.missingFields.includes("Exclusions and prohibited approaches"));

  // Nothing was invented to fill the gaps.
  const core = result.requirements.find((item) => item.category === "CORE_PROBLEM");
  assert.equal(core, undefined);
});

test("the core problem says so plainly when it is not recorded", () => {
  const result = extractDeterministicRequirements(
    makeBrief({ problemStatement: null }),
  );
  assert.match(result.coreProblem, /no problem statement/i);
});

test("judging criteria are never fabricated", () => {
  const result = extractDeterministicRequirements(makeBrief());
  const judging = result.requirements.filter(
    (item) => item.category === "JUDGING_CRITERIA",
  );
  assert.equal(judging.length, 0);
  assert.ok(result.missingFields.includes("Judging criteria"));
});

test("only direct readings of the record are verified facts", () => {
  const result = extractDeterministicRequirements(makeBrief());
  // Every verified fact must name the stored field it came from.
  for (const requirement of result.requirements) {
    if (requirement.claimKind !== "VERIFIED_FACT") continue;
    assert.ok(
      requirement.origin,
      `verified fact "${requirement.text}" must name its source field`,
    );
    assert.equal(requirement.source, "COMPETITION_BRIEF");
  }
});

test("an inference is never presented as a verified fact", () => {
  const result = extractDeterministicRequirements(makeBrief());
  // The target users are only assumed to be in the problem statement.
  const targetUsers = result.requirements.find(
    (item) => item.category === "TARGET_USERS",
  );
  assert.ok(targetUsers);
  assert.notEqual(targetUsers.claimKind, "VERIFIED_FACT");
  assert.equal(targetUsers.claimKind, "INFERENCE");
});

test("a stored deadline is a fact but its remaining time is labelled as computed", () => {
  const result = extractDeterministicRequirements(makeBrief());
  const time = result.requirements.find(
    (item) => item.category === "TIME_CONSTRAINTS",
  );
  assert.ok(time);
  assert.equal(time.claimKind, "VERIFIED_FACT");
  assert.match(time.text, /at the time of this analysis/i);
});

test("a model can never promote its own output to a verified fact", () => {
  const deterministic = extractDeterministicRequirements(makeBrief());
  const merged = mergeAiRequirements(deterministic.requirements, [
    {
      category: "JUDGING_CRITERIA",
      text: "Impact scores double",
      claimKind: "VERIFIED_FACT",
      source: "COMPETITION_BRIEF",
    },
  ]);

  const added = merged.find((item) => item.text === "Impact scores double");
  assert.ok(added);
  assert.notEqual(added.claimKind, "VERIFIED_FACT");
  assert.equal(added.claimKind, "INFERENCE");
});

test("model requirements that repeat a verified one are dropped", () => {
  const deterministic = extractDeterministicRequirements(makeBrief());
  const merged = mergeAiRequirements(deterministic.requirements, [
    { category: "CORE_PROBLEM", text: "Communities cannot adopt solar because the process is opaque." },
    { category: "PAIN_POINTS", text: "Paperwork is confusing." },
  ]);
  assert.equal(
    merged.filter((item) => item.text.startsWith("Communities cannot adopt")).length,
    1,
  );
  assert.equal(merged.length, deterministic.requirements.length + 1);
});

test("malformed model requirement output is ignored", () => {
  const deterministic = extractDeterministicRequirements(makeBrief());
  const merged = mergeAiRequirements(deterministic.requirements, [
    null,
    "a string",
    { text: "" },
    { text: "Valid one" },
  ]);
  assert.equal(merged.length, deterministic.requirements.length + 1);
});

test("requirements group by category in a stable order", () => {
  const result = extractDeterministicRequirements(makeBrief());
  const groups = groupRequirements(result.requirements);
  assert.ok(groups.length > 0);
  for (const group of groups) {
    assert.ok(group.items.length > 0);
  }
});

// --- idea scoring ------------------------------------------------------

function scores(overrides = {}) {
  const base = {};
  for (const dimension of IDEA_DIMENSIONS) {
    base[dimension] = {
      dimension,
      score: 3,
      rationale: "Because.",
      evidenceRefs: [],
      uncertainties: [],
      confidence: "MEDIUM",
    };
  }
  return { ...base, ...overrides };
}

test("weights are normalised to sum to one", () => {
  const weights = normaliseWeights({
    PROBLEM_RELEVANCE: 2,
    JUDGING_ALIGNMENT: 2,
    USER_VALUE: 1,
  });
  const total = IDEA_DIMENSIONS.reduce((sum, d) => sum + weights[d], 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights summed to ${total}`);
});

test("all-zero weights fall back to the defaults", () => {
  const zeroed = Object.fromEntries(
    IDEA_DIMENSIONS.map((d) => [d, 0]),
  );
  const weights = normaliseWeights(zeroed);
  assert.deepEqual(weights, DEFAULT_IDEA_WEIGHTS);
});

test("negative and non-numeric weights are ignored", () => {
  const weights = normaliseWeights({
    PROBLEM_RELEVANCE: -5,
    JUDGING_ALIGNMENT: Number.NaN,
  });
  assert.ok(weights.PROBLEM_RELEVANCE > 0);
  assert.ok(weights.JUDGING_ALIGNMENT > 0);
  const total = IDEA_DIMENSIONS.reduce((sum, d) => sum + weights[d], 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test("scores are clamped to the allowed range", () => {
  assert.equal(clampScore(0), 1);
  assert.equal(clampScore(3), 3);
  assert.equal(clampScore(99), 5);
  assert.equal(clampScore("nope"), 1);
});

test("a uniform 3 scores 50 out of 100", () => {
  const total = computeWeightedTotal(Object.values(scores()), normaliseWeights());
  assert.equal(total, 50);
});

test("a uniform 5 scores 100 and a uniform 1 scores 0", () => {
  const best = {};
  const worst = {};
  for (const dimension of IDEA_DIMENSIONS) {
    best[dimension] = { ...scores()[dimension], score: 5 };
    worst[dimension] = { ...scores()[dimension], score: 1 };
  }
  assert.equal(computeWeightedTotal(Object.values(best), normaliseWeights()), 100);
  assert.equal(computeWeightedTotal(Object.values(worst), normaliseWeights()), 0);
});

test("a higher weighted dimension moves the total more", () => {
  const all = scores();
  const highOnRelevance = {
    ...all,
    PROBLEM_RELEVANCE: { ...all.PROBLEM_RELEVANCE, score: 5 },
  };
  const highOnImpact = {
    ...all,
    POTENTIAL_IMPACT: { ...all.POTENTIAL_IMPACT, score: 5 },
  };
  const weights = normaliseWeights();
  const relevanceTotal = computeWeightedTotal(
    Object.values(highOnRelevance),
    weights,
  );
  const impactTotal = computeWeightedTotal(Object.values(highOnImpact), weights);
  assert.ok(
    relevanceTotal > impactTotal,
    "a heavier dimension should dominate the total",
  );
});

test("sensitivity widens when a heavy dimension is weak", () => {
  const tight = Object.values(scores());
  const wide = Object.values(
    scores({ PROBLEM_RELEVANCE: { ...scores().PROBLEM_RELEVANCE, score: 1 } }),
  );
  const tightRange = computeSensitivity(tight, normaliseWeights());
  const wideRange = computeSensitivity(wide, normaliseWeights());

  // A weak heavy dimension drags the total down further.
  assert.ok(wideRange.min < tightRange.min);
  // And the possible range around it is wider.
  assert.ok(
    wideRange.max - wideRange.min > tightRange.max - tightRange.min,
  );
});

test("sensitivity only moves the dimension being tested", () => {
  // One dimension at 1, the rest at 3.
  const scoresList = Object.values(
    scores({ PROBLEM_RELEVANCE: { ...scores().PROBLEM_RELEVANCE, score: 1 } }),
  );
  const range = computeSensitivity(scoresList, normaliseWeights());
  const base = computeWeightedTotal(scoresList, normaliseWeights());

  // The weak dimension can recover, so the ceiling is above the current total.
  assert.ok(range.max > base);
  // Another dimension can also fall, so the floor is below the current total.
  assert.ok(range.min < base);
  // The ceiling is the total with the weak dimension at its best.
  const recovered = computeWeightedTotal(
    scoresList.map((item) =>
      item.dimension === "PROBLEM_RELEVANCE"
        ? { ...item, score: 5 }
        : item,
    ),
    normaliseWeights(),
  );
  assert.equal(range.max, recovered);
});

test("evaluation reports strong, weak and uncertain dimensions", () => {
  const evaluated = evaluateIdea(
    "idea-1",
    Object.values(
      scores({
        PROBLEM_RELEVANCE: {
          ...scores().PROBLEM_RELEVANCE,
          score: 5,
        },
        POTENTIAL_IMPACT: {
          ...scores().POTENTIAL_IMPACT,
          score: 1,
          confidence: "LOW",
          uncertainties: ["No user data yet"],
        },
      }),
    ),
  );

  assert.equal(evaluated.ideaId, "idea-1");
  assert.ok(evaluated.strongestDimensions.includes("PROBLEM_RELEVANCE"));
  assert.ok(evaluated.weakestDimensions.includes("POTENTIAL_IMPACT"));
  assert.ok(evaluated.uncertainDimensions.includes("POTENTIAL_IMPACT"));
  assert.ok(evaluated.total > 0 && evaluated.total < 100);
});

test("comparison ranks by total and finds the divisive dimension", () => {
  const ideaA = {
    ideaId: "a",
    name: "Idea A",
    evaluation: evaluateIdea("a", Object.values(scores({ PROBLEM_RELEVANCE: { ...scores().PROBLEM_RELEVANCE, score: 5 } }))),
  };
  const ideaB = {
    ideaId: "b",
    name: "Idea B",
    evaluation: evaluateIdea("b", Object.values(scores({ PROBLEM_RELEVANCE: { ...scores().PROBLEM_RELEVANCE, score: 1 } }))),
  };

  const comparison = compareIdeas([ideaB, ideaA]);
  assert.equal(comparison.ranked[0].ideaId, "a");
  assert.equal(comparison.mostDivisiveDimension, "PROBLEM_RELEVANCE");
});

test("malformed model scores are dropped, not defaulted", () => {
  const parsed = parseModelScores([
    { dimension: "PROBLEM_RELEVANCE", score: 4, rationale: "Good fit" },
    { dimension: "NOT_A_DIMENSION", score: 5 },
    { dimension: "USER_VALUE", score: "high" },
    null,
    "nope",
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].dimension, "PROBLEM_RELEVANCE");
  assert.equal(parsed[0].score, 4);
});

test("a score with no rationale gets an explicit placeholder", () => {
  const parsed = parseModelScores([{ dimension: "USER_VALUE", score: 3 }]);
  assert.match(parsed[0].rationale, /no rationale/i);
});

test("model ideas are parsed and can never claim to be verified facts", () => {
  const parsed = parseModelIdeas([
    {
      name: "Solar Dashboard",
      pitch: "Shows adoption progress.",
      mvpFeatures: ["Chart", "Export"],
      claimKind: "VERIFIED_FACT",
    },
    { name: "", pitch: "missing name" },
    null,
  ]);
  assert.equal(parsed.length, 1);
  assert.notEqual(parsed[0].claimKind, "VERIFIED_FACT");
  assert.deepEqual(parsed[0].mvpFeatures, ["Chart", "Export"]);
});

test("near-duplicate ideas are collapsed", () => {
  const deduped = dedupeIdeas([
    { name: "Solar Dashboard", pitch: "Shows solar adoption progress for households." },
    { name: "Solar Dashboard", pitch: "Shows solar adoption progress for households." },
    { name: "Water Flow Monitor", pitch: "Tracks municipal water flow across a city." },
  ]);
  assert.equal(deduped.length, 2);
});

test("genuinely different ideas are kept", () => {
  const deduped = dedupeIdeas([
    { name: "Solar Dashboard", pitch: "Shows solar adoption progress for households." },
    { name: "Water Flow Monitor", pitch: "Tracks municipal water flow across a city." },
  ]);
  assert.equal(deduped.length, 2);
});

// --- gap analysis ------------------------------------------------------

test("no research means no gap is claimed", () => {
  const analysis = buildDeterministicGaps({
    findings: [],
    requirements: [],
    brief: makeBrief(),
  });
  assert.equal(analysis.gaps.length, 0);
  assert.equal(analysis.evidenceGaps.length > 0, true);
  assert.equal(analysis.nextInvestigations.length > 0, true);
});

test("gaps built from findings are never stronger than their evidence", () => {
  const analysis = buildDeterministicGaps({
    findings: [
      {
        id: "f1",
        title: "SomeExistingTool",
        url: "https://example.com/tool",
        claimKind: "SOURCE_SUPPORTED",
        supports: "Describes an existing tool.",
      },
    ],
    requirements: [],
    brief: makeBrief(),
  });
  assert.equal(analysis.gaps.length, 1);
  assert.equal(analysis.gaps[0].claimKind, "SOURCE_SUPPORTED");
  assert.match(analysis.evidenceGaps.join(" "), /no claim is made about which competitors exist/i);
});

test("a model gap with no supporting finding is a hypothesis", () => {
  const merged = mergeAiGaps([], [
    {
      need: "Nobody tracks this",
      claimKind: "VERIFIED_FACT",
      supportingFindingIds: [],
    },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].claimKind, "HYPOTHESIS");
});

test("a model gap with a supporting finding is at best source-supported", () => {
  const merged = mergeAiGaps([], [
    {
      need: "Some gap",
      claimKind: "VERIFIED_FACT",
      supportingFindingIds: ["f1"],
    },
  ]);
  assert.equal(merged[0].claimKind, "SOURCE_SUPPORTED");
});

// --- build brief --------------------------------------------------------

test("a build brief from an idea alone reports the missing sections", () => {
  const idea = parseModelIdeas([
    {
      name: "Solar Dashboard",
      pitch: "Shows adoption.",
      targetUser: "Households",
      problemSolved: "Opaque process",
      mvpFeatures: ["Chart"],
      excludedFeatures: ["Payments"],
    },
  ])[0];
  assert.ok(idea);

  const { brief, missingSections } = buildBriefFromIdea(idea);
  assert.equal(brief.ideaName, "Solar Dashboard");
  assert.equal(brief.problemStatement, "Opaque process");
  assert.deepEqual(brief.mvpScope, ["Chart"]);
  assert.deepEqual(brief.nonGoals, ["Payments"]);
  assert.ok(missingSections.includes("Security requirements"));
  assert.ok(missingSections.includes("Testing plan"));
  assert.ok(missingSections.includes("Judging-criteria alignment"));
});

test("a complete build brief reports no missing sections", () => {
  const idea = parseModelIdeas([
    { name: "A", pitch: "B" },
  ])[0];
  const { brief, missingSections } = parseModelBuildBrief(
    {
      problemStatement: "p",
      targetUsers: "u",
      valueProposition: "v",
      judgingCriteriaAlignment: "j",
      mvpScope: ["a"],
      nonGoals: ["b"],
      primaryUserJourney: "j",
      featureAcceptanceCriteria: ["c"],
      architectureSuggestion: "arch",
      dataModelOutline: "model",
      securityRequirements: ["s"],
      testingPlan: ["t"],
      deploymentPlan: "d",
      demoScriptOutline: ["demo"],
      keyRisks: ["r"],
      openQuestions: ["q"],
      milestones: ["m"],
    },
    idea,
  );
  assert.equal(brief.ideaName, "A");
  assert.deepEqual(missingSections, []);
});

// --- provider plumbing --------------------------------------------------

test("a fenced JSON response is recovered", () => {
  const parsed = parseJsonObject('```json\n{"a":1}\n```');
  assert.deepEqual(parsed, { a: 1 });
});

test("JSON wrapped in prose is recovered", () => {
  const parsed = parseJsonObject('Here you go: {"a":1} hope that helps');
  assert.deepEqual(parsed, { a: 1 });
});

test("a response with no JSON raises a malformed output error", () => {
  assert.throws(
    () => parseJsonObject("I am afraid I cannot do that"),
    (error) => error instanceof AiError && error.kind === "MALFORMED_OUTPUT",
  );
});

test("a JSON array is not accepted as an object", () => {
  assert.throws(
    () => parseJsonObject("[1,2,3]"),
    (error) => error instanceof AiError && error.kind === "MALFORMED_OUTPUT",
  );
});

test("a missing API key is reported by name, never by value", () => {
  const missing = describeMissingConfiguration({});
  assert.deepEqual(missing, ["OPENAI_API_KEY"]);
  assert.ok(!missing.some((name) => name.includes("sk-")));
});
