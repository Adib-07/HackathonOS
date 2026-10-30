import "../../scripts/test-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  initialCompetitionFormState,
  validateCompetitionForm,
} from "../src/lib/competition-form-validation.ts";

function makeForm(overrides = {}) {
  return { ...initialCompetitionFormState, ...overrides };
}

test("empty form reports the required fields", () => {
  const errors = validateCompetitionForm(makeForm());
  assert.ok(errors.name, "name is required");
  assert.ok(errors.deadline, "deadline is required");
  assert.equal(errors.officialUrl, undefined);
  assert.equal(errors.rulesUrl, undefined);
});

test("whitespace-only name is rejected", () => {
  const errors = validateCompetitionForm(makeForm({ name: "   " }));
  assert.ok(errors.name);
});

test("name longer than 160 characters is rejected", () => {
  const errors = validateCompetitionForm(makeForm({ name: "A".repeat(161) }));
  assert.ok(errors.name);
});

test("name at exactly 160 characters is accepted", () => {
  const errors = validateCompetitionForm(
    makeForm({ name: "A".repeat(160), deadline: "2027-10-27T14:20" }),
  );
  assert.equal(errors.name, undefined);
  assert.equal(errors.deadline, undefined);
});

test("missing or invalid deadline is rejected", () => {
  assert.ok(validateCompetitionForm(makeForm({ deadline: "" })).deadline);
  assert.ok(validateCompetitionForm(makeForm({ deadline: "not-a-date" })).deadline);
});

test("valid deadline is accepted", () => {
  const errors = validateCompetitionForm(makeForm({ deadline: "2027-10-27T14:20" }));
  assert.equal(errors.deadline, undefined);
});

test("non-http official and rules URLs are rejected", () => {
  const errors = validateCompetitionForm(
    makeForm({
      deadline: "2027-10-27T14:20",
      officialUrl: "ftp://example.com",
      rulesUrl: "not-a-url",
    }),
  );
  assert.ok(errors.officialUrl);
  assert.ok(errors.rulesUrl);
});

test("http and https official and rules URLs are accepted", () => {
  const errors = validateCompetitionForm(
    makeForm({
      deadline: "2027-10-27T14:20",
      officialUrl: "https://example.com/event",
      rulesUrl: "http://example.com/rules",
    }),
  );
  assert.equal(errors.officialUrl, undefined);
  assert.equal(errors.rulesUrl, undefined);
});

test("team size below 1 and above 100 are rejected", () => {
  assert.ok(
    validateCompetitionForm(
      makeForm({ deadline: "2027-10-27T14:20", teamSize: 0 }),
    ).teamSize,
  );
  assert.ok(
    validateCompetitionForm(
      makeForm({ deadline: "2027-10-27T14:20", teamSize: 101 }),
    ).teamSize,
  );
});

test("team size of 1 and 100 are accepted", () => {
  assert.equal(
    validateCompetitionForm(
      makeForm({ deadline: "2027-10-27T14:20", teamSize: 1 }),
    ).teamSize,
    undefined,
  );
  assert.equal(
    validateCompetitionForm(
      makeForm({ deadline: "2027-10-27T14:20", teamSize: 100 }),
    ).teamSize,
    undefined,
  );
});

test("problem statement longer than 5000 characters is rejected", () => {
  const errors = validateCompetitionForm(
    makeForm({ deadline: "2027-10-27T14:20", problemStatement: "x".repeat(5001) }),
  );
  assert.ok(errors.problemStatement);
});

test("a fully valid form produces no errors", () => {
  const errors = validateCompetitionForm(
    makeForm({
      name: "CityLab Build Weekend",
      organizer: "CityLab",
      competitionType: "hybrid",
      deadline: "2027-10-27T14:20",
      teamSize: 4,
      trackMode: "choose",
      currentTrack: "Civic Tech",
      problemStatement: "Build something useful.",
      officialUrl: "https://example.com/event",
      rulesUrl: "https://example.com/rules",
      status: "preparing",
    }),
  );
  assert.deepEqual(errors, {});
});
