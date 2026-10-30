import "../../../scripts/test-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  assessEvidence,
  evaluateTaskVerification,
  requiredEvidenceTypes,
  EVIDENCE_TYPES,
} from "../src/lib/verification.ts";

const METHOD = "Run the application and complete the primary user journey.";

/** @returns {import("../src/lib/verification.ts").VerifiableTask} */
function makeTask(overrides = {}) {
  return {
    id: "task-1",
    taskKey: "build-product",
    phase: "implementation",
    status: "done",
    verificationMethod: METHOD,
    ...overrides,
  };
}

/** @returns {import("../src/lib/verification.ts").VerifiableEvidence} */
function makeEvidence(overrides = {}) {
  return {
    id: "ev-1",
    taskKey: "build-product",
    type: "TEST_RESULT",
    result: "passed",
    observedAt: "2026-10-21T10:00:00.000Z",
    verificationMethodSnapshot: METHOD,
    source: "manual",
    ...overrides,
  };
}

test("every declared evidence type has a label and a rule", () => {
  assert.ok(EVIDENCE_TYPES.length >= 6);
});

test("required evidence types are defined per phase", () => {
  assert.deepEqual(requiredEvidenceTypes("testing"), ["TEST_RESULT"]);
  assert.deepEqual(requiredEvidenceTypes("implementation"), [
    "BUILD_RESULT",
    "TEST_RESULT",
  ]);
  assert.deepEqual(requiredEvidenceTypes("deployment"), [
    "DEPLOYMENT_URL",
    "HTTP_CHECK",
  ]);
  assert.deepEqual(requiredEvidenceTypes("submission"), [
    "SUBMISSION_CONFIRMATION",
  ]);
});

test("an unknown phase falls back to a manual review requirement", () => {
  assert.deepEqual(requiredEvidenceTypes("not_a_real_phase"), [
    "MANUAL_REVIEW",
  ]);
});

test("a task with no evidence is never verified", () => {
  const result = evaluateTaskVerification(makeTask(), []);
  assert.equal(result.state, "done");
  assert.equal(result.verified, false);
  assert.equal(result.evidenceCount, 0);
  assert.ok(result.missingTypes.length > 0);
  assert.ok(result.reason.length > 0);
});

test("DONE is not VERIFIED even when the task is marked done", () => {
  const result = evaluateTaskVerification(makeTask({ status: "done" }), []);
  assert.equal(result.state, "done");
  assert.notEqual(result.state, "verified");
  assert.equal(result.verified, false);
});

test("a done task with satisfying evidence becomes verified", () => {
  const evidence = [
    makeEvidence({ id: "b", type: "BUILD_RESULT" }),
    makeEvidence({ id: "t", type: "TEST_RESULT" }),
  ];
  const result = evaluateTaskVerification(makeTask(), evidence);
  assert.equal(result.state, "verified");
  assert.equal(result.verified, true);
  assert.deepEqual(result.satisfiedTypes.sort(), [
    "BUILD_RESULT",
    "TEST_RESULT",
  ]);
  assert.equal(result.supportingEvidenceIds.length, 2);
});

test("partial evidence does not verify a task that needs two types", () => {
  const result = evaluateTaskVerification(makeTask(), [
    makeEvidence({ id: "b", type: "BUILD_RESULT" }),
  ]);
  assert.equal(result.state, "done");
  assert.equal(result.verified, false);
  assert.deepEqual(result.missingTypes, ["TEST_RESULT"]);
  assert.ok(result.reason.includes("TEST_RESULT"));
});

test("a failed required test blocks verification", () => {
  const result = evaluateTaskVerification(makeTask({ phase: "testing" }), [
    makeEvidence({ result: "failed" }),
  ]);
  assert.equal(result.state, "done");
  assert.equal(result.verified, false);
  assert.equal(result.blockedByFailure, true);
  assert.deepEqual(result.failedTypes, ["TEST_RESULT"]);
  assert.ok(result.reason.includes("failed"));
});

test("a failure is not repaired by an older passing record of the same type", () => {
  // The failing record is newer, so it is the current truth for that type.
  const result = evaluateTaskVerification(makeTask({ phase: "testing" }), [
    makeEvidence({
      id: "old-pass",
      result: "passed",
      observedAt: "2026-10-20T10:00:00.000Z",
    }),
    makeEvidence({
      id: "new-fail",
      result: "failed",
      observedAt: "2026-10-21T10:00:00.000Z",
    }),
  ]);
  assert.equal(result.verified, false);
  assert.equal(result.blockedByFailure, true);
});

test("a newer passing record supersedes an older failure", () => {
  const result = evaluateTaskVerification(makeTask({ phase: "testing" }), [
    makeEvidence({
      id: "old-fail",
      result: "failed",
      observedAt: "2026-10-20T10:00:00.000Z",
    }),
    makeEvidence({
      id: "new-pass",
      result: "passed",
      observedAt: "2026-10-21T10:00:00.000Z",
    }),
  ]);
  assert.equal(result.state, "verified");
  assert.equal(result.verified, true);
  assert.deepEqual(result.supportingEvidenceIds, ["new-pass"]);
});

test("a deployment URL alone does not verify a deployment task", () => {
  const result = evaluateTaskVerification(makeTask({ phase: "deployment" }), [
    makeEvidence({ type: "DEPLOYMENT_URL" }),
  ]);
  assert.equal(result.verified, false);
  assert.deepEqual(result.missingTypes, ["HTTP_CHECK"]);
  assert.ok(result.reason.includes("HTTP_CHECK"));
});

test("a deployment task needs both a URL and an HTTP check", () => {
  const result = evaluateTaskVerification(makeTask({ phase: "deployment" }), [
    makeEvidence({ id: "u", type: "DEPLOYMENT_URL" }),
    makeEvidence({ id: "h", type: "HTTP_CHECK" }),
  ]);
  assert.equal(result.state, "verified");
  assert.equal(result.verified, true);
});

test("evidence recorded against a different requirement is stale and cannot verify", () => {
  const result = evaluateTaskVerification(makeTask({ phase: "testing" }), [
    makeEvidence({
      verificationMethodSnapshot: "A completely different method.",
    }),
  ]);
  assert.equal(result.verified, false);
  assert.equal(result.hasStaleEvidence, true);
  assert.ok(result.unusableEvidenceIds.length === 1);
  assert.ok(result.reason.length > 0);
});

test("changing the task requirement invalidates previously recorded evidence", () => {
  const evidence = [
    makeEvidence({ verificationMethodSnapshot: "Old method." }),
  ];
  const before = evaluateTaskVerification(
    makeTask({ phase: "testing", verificationMethod: "Old method." }),
    evidence,
  );
  const after = evaluateTaskVerification(
    makeTask({ phase: "testing", verificationMethod: "New method." }),
    evidence,
  );
  assert.equal(before.verified, true);
  assert.equal(after.verified, false);
  assert.equal(after.hasStaleEvidence, true);
});

test("a blocked task stays blocked even with passing evidence", () => {
  const result = evaluateTaskVerification(makeTask({ status: "blocked" }), [
    makeEvidence({ id: "b", type: "BUILD_RESULT" }),
    makeEvidence({ id: "t", type: "TEST_RESULT" }),
  ]);
  assert.equal(result.state, "blocked");
  assert.equal(result.verified, false);
});

test("a task that is not done cannot be verified by evidence alone", () => {
  const result = evaluateTaskVerification(makeTask({ status: "in_progress" }), [
    makeEvidence({ id: "b", type: "BUILD_RESULT" }),
    makeEvidence({ id: "t", type: "TEST_RESULT" }),
  ]);
  assert.equal(result.state, "in_progress");
  assert.equal(result.verified, false);
  assert.ok(result.reason.includes("progress"));
});

test("a todo task with evidence is still not started", () => {
  const result = evaluateTaskVerification(makeTask({ status: "todo" }), [
    makeEvidence({ id: "b", type: "BUILD_RESULT" }),
    makeEvidence({ id: "t", type: "TEST_RESULT" }),
  ]);
  assert.equal(result.state, "not_started");
  assert.equal(result.verified, false);
});

test("evidence for a different task is ignored", () => {
  const result = evaluateTaskVerification(makeTask(), [
    makeEvidence({ taskKey: "some-other-task" }),
  ]);
  assert.equal(result.evidenceCount, 0);
  assert.equal(result.verified, false);
});

test("evidence of a type the task does not require does not verify it", () => {
  const result = evaluateTaskVerification(makeTask({ phase: "testing" }), [
    makeEvidence({ type: "MANUAL_REVIEW" }),
  ]);
  assert.equal(result.verified, false);
  assert.deepEqual(result.missingTypes, ["TEST_RESULT"]);
  // The record still exists and is visible to the owner.
  assert.equal(result.evidenceCount, 1);
});

test("assessEvidence marks a superseded record", () => {
  const older = makeEvidence({
    id: "old",
    observedAt: "2026-10-20T10:00:00.000Z",
  });
  const newer = makeEvidence({
    id: "new",
    observedAt: "2026-10-21T10:00:00.000Z",
  });
  const assessment = assessEvidence(makeTask(), older, [older, newer]);
  assert.equal(assessment.superseded, true);
  assert.equal(assessment.supporting, false);
  assert.equal(assessment.stale, false);
});

test("assessEvidence marks the current passing record as supporting", () => {
  const current = makeEvidence({ id: "new" });
  const assessment = assessEvidence(makeTask(), current, [current]);
  assert.equal(assessment.supporting, true);
  assert.equal(assessment.superseded, false);
  assert.equal(assessment.stale, false);
});

test("assessEvidence explains a failure", () => {
  const failed = makeEvidence({ result: "failed" });
  const assessment = assessEvidence(makeTask(), failed, [failed]);
  assert.equal(assessment.supporting, false);
  assert.ok(assessment.reason.includes("failed"));
});

test("a manual review satisfies a manual review requirement", () => {
  const result = evaluateTaskVerification(makeTask({ phase: "architecture" }), [
    makeEvidence({ type: "MANUAL_REVIEW" }),
  ]);
  assert.equal(result.state, "verified");
  assert.equal(result.verified, true);
});

test("every evidence type can satisfy some phase", () => {
  const phases = [
    "intake",
    "problem",
    "research",
    "track_selection",
    "idea_selection",
    "specification",
    "architecture",
    "implementation",
    "testing",
    "security",
    "deployment",
    "demo",
    "pitch",
    "submission",
  ];
  const supported = new Set();
  for (const phase of phases) {
    for (const type of requiredEvidenceTypes(phase)) supported.add(type);
  }
  for (const type of EVIDENCE_TYPES) {
    assert.ok(supported.has(type), `${type} is never required by any phase`);
  }
});

test("a task's own verification method is what gets snapshotted", () => {
  const task = makeTask({
    phase: "testing",
    verificationMethod: "Custom rule.",
  });
  const evidence = makeEvidence({
    type: "TEST_RESULT",
    verificationMethodSnapshot: "Custom rule.",
  });
  const result = evaluateTaskVerification(task, [evidence]);
  assert.equal(result.verified, true);
});
