import "../../../scripts/test-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { CreateCompetitionBody } from "../../../lib/api-zod/src/generated/api.ts";

const validBase = {
  name: "Global AI Hackathon 2026",
  organizer: "Tech Foundation",
  competitionType: "online",
  deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  teamSize: 3,
  trackMode: "choose",
  currentTrack: "AI for Safety",
  problemStatement: "Build safe and reliable tools for critical applications.",
  officialUrl: "https://hackathon.example.com",
  rulesUrl: "https://hackathon.example.com/rules",
  mandatoryDeliverables: ["Live demo", "GitHub repository", "Video pitch"],
  teamSkills: ["TypeScript", "React", "PostgreSQL"],
  status: "preparing",
};

test("CreateCompetitionBody parses valid complete competition input", () => {
  const result = CreateCompetitionBody.safeParse(validBase);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Global AI Hackathon 2026");
    assert.equal(result.data.teamSize, 3);
    assert.equal(result.data.mandatoryDeliverables?.length, 3);
  }
});

test("CreateCompetitionBody parses minimal valid competition input", () => {
  const minimal = {
    name: "Minimal Hackathon",
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  const result = CreateCompetitionBody.safeParse(minimal);
  assert.equal(result.success, true);
});

test("CreateCompetitionBody rejects empty or missing name", () => {
  const missingName = { ...validBase, name: "" };
  const result = CreateCompetitionBody.safeParse(missingName);
  assert.equal(result.success, false);
});

test("CreateCompetitionBody rejects name exceeding 160 characters", () => {
  const longName = { ...validBase, name: "A".repeat(161) };
  const result = CreateCompetitionBody.safeParse(longName);
  assert.equal(result.success, false);
});

test("CreateCompetitionBody rejects missing or invalid deadline", () => {
  const noDeadline = { ...validBase, deadline: "" };
  const result1 = CreateCompetitionBody.safeParse(noDeadline);
  assert.equal(result1.success, false);

  const invalidDeadline = { ...validBase, deadline: "not-a-real-date" };
  const result2 = CreateCompetitionBody.safeParse(invalidDeadline);
  assert.equal(result2.success, false);
});

test("CreateCompetitionBody rejects invalid officialUrl and rulesUrl", () => {
  const badOfficialUrl = { ...validBase, officialUrl: "not-a-valid-url" };
  const result1 = CreateCompetitionBody.safeParse(badOfficialUrl);
  assert.equal(result1.success, false);

  const badRulesUrl = { ...validBase, rulesUrl: "ftp-or-bad" };
  const result2 = CreateCompetitionBody.safeParse(badRulesUrl);
  assert.equal(result2.success, false);
});

test("CreateCompetitionBody rejects teamSize less than 1 or exceeding 100", () => {
  const zeroSize = { ...validBase, teamSize: 0 };
  const result1 = CreateCompetitionBody.safeParse(zeroSize);
  assert.equal(result1.success, false);

  const giantSize = { ...validBase, teamSize: 101 };
  const result2 = CreateCompetitionBody.safeParse(giantSize);
  assert.equal(result2.success, false);
});

test("CreateCompetitionBody allows valid format types", () => {
  for (const competitionType of ["online", "in_person", "hybrid", "unknown"]) {
    const result = CreateCompetitionBody.safeParse({
      ...validBase,
      competitionType,
    });
    assert.equal(result.success, true);
  }
});
