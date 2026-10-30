import "../../../scripts/test-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  LIFECYCLE_STAGES,
  STAGE_STATE_LABELS,
  buildStageSummaries,
  computeRemaining,
  deriveStageState,
  formatDuration,
  phaseLabel,
  stageIdForPhase,
  summarisePlan,
} from "../src/lib/workflow.ts";

/**
 * @param {Partial<import("../src/lib/workflow.ts").StageTask>} [overrides]
 * @returns {import("../src/lib/workflow.ts").StageTask}
 */
function makeTask(overrides = {}) {
  return {
    id: "task-1",
    taskKey: "task-1",
    title: "Task",
    description: "Description",
    phase: "implementation",
    priority: "medium",
    estimatedMinutes: 30,
    plannedStartAt: "2026-10-21T09:00:00.000Z",
    plannedEndAt: "2026-10-21T09:30:00.000Z",
    dependencies: [],
    owner: null,
    status: "todo",
    acceptanceCriteria: [],
    expectedArtifact: null,
    verificationMethod: "Check it",
    riskIfSkipped: "Risk",
    mandatory: false,
    ...overrides,
  };
}

test("every stage id is unique", () => {
  const ids = LIFECYCLE_STAGES.map((stage) => stage.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("no two backed stages share a plan phase", () => {
  const seen = new Set();
  for (const stage of LIFECYCLE_STAGES) {
    for (const phase of stage.phases) {
      assert.ok(!seen.has(phase), `phase ${phase} is claimed twice`);
      seen.add(phase);
    }
  }
});

test("every planner phase is owned by exactly one stage", () => {
  // Guards against a phase silently having no stage, which would make its
  // tasks invisible in the workflow view.
  const plannerPhases = [
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
    "retrospective_what_worked",
    "retrospective_what_failed",
    "retrospective_lessons_learned",
    "retrospective_next_steps",
  ];

  const owned = new Set();
  for (const stage of LIFECYCLE_STAGES) {
    for (const phase of stage.phases) owned.add(phase);
  }

  for (const phase of plannerPhases) {
    assert.ok(owned.has(phase), `phase ${phase} has no stage`);
  }

  // Nothing may claim a phase the planner does not produce.
  for (const stage of LIFECYCLE_STAGES) {
    for (const phase of stage.phases) {
      assert.ok(
        plannerPhases.includes(phase),
        `stage ${stage.id} claims unknown phase ${phase}`,
      );
    }
  }
});

test("a task in any planner phase is visible in some stage", () => {
  const plannerPhases = [
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
    "retrospective_what_worked",
    "retrospective_what_failed",
    "retrospective_lessons_learned",
    "retrospective_next_steps",
  ];

  // For retrospective phases, we need to unlock the retrospective stage
  // by providing a completed submission task and a future deadline
  const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const submissionTask = makeTask({ phase: "submission", status: "done" });

  for (const phase of plannerPhases) {
    const tasks = phase.startsWith("retrospective_")
      ? [submissionTask, makeTask({ phase, status: "blocked" })]
      : [makeTask({ phase, status: "blocked" })];
    const summaries = buildStageSummaries(tasks, futureDeadline);
    // Find the stage that owns this phase
    const targetStage = summaries.find((s) =>
      s.definition.phases.includes(phase),
    );
    assert.ok(targetStage, `phase ${phase} has no owning stage`);
    assert.equal(targetStage.total, 1, `phase ${phase} should have 1 task`);
    assert.equal(targetStage.state, "blocked", `phase ${phase} should surface its blocker`);
  }
});

test("planned stages never claim a phase", () => {
  for (const stage of LIFECYCLE_STAGES.filter((s) => s.planned)) {
    assert.deepEqual(stage.phases, [], `${stage.id} must not claim phases`);
  }
});

test("a stage with no tasks is not started", () => {
  const result = deriveStageState([]);
  assert.equal(result.state, "not_started");
  assert.equal(result.total ?? 0, 0);
  assert.equal(result.nextTask, null);
  assert.equal(result.completion, 0);
});

test("all tasks done means the stage is complete", () => {
  const result = deriveStageState([
    makeTask({ status: "done" }),
    makeTask({ status: "done" }),
  ]);
  assert.equal(result.state, "complete");
  assert.equal(result.done, 2);
  assert.equal(result.completion, 100);
});

test("a blocked task makes the stage blocked and is reported as a blocker", () => {
  const blocker = makeTask({ id: "b1", status: "blocked", title: "Blocked thing" });
  const result = deriveStageState([makeTask({ status: "done" }), blocker]);
  assert.equal(result.state, "blocked");
  assert.equal(result.blocked, 1);
  assert.equal(result.blockers.length, 1);
  assert.equal(result.blockers[0].title, "Blocked thing");
});

test("blocked outranks done: a stage with a blocker is never complete", () => {
  const result = deriveStageState([
    makeTask({ status: "done" }),
    makeTask({ status: "blocked" }),
  ]);
  assert.equal(result.state, "blocked");
});

test("an in-progress task makes the stage active", () => {
  const result = deriveStageState([
    makeTask({ status: "done" }),
    makeTask({ id: "t2", status: "in_progress" }),
  ]);
  assert.equal(result.state, "active");
  assert.equal(result.inProgress, 1);
});

test("a stage with only todo tasks is scheduled, not in progress", () => {
  const result = deriveStageState([
    makeTask({ status: "todo" }),
    makeTask({ id: "t2", status: "todo" }),
  ]);
  assert.equal(result.state, "scheduled");
  assert.equal(result.todo, 2);
});

test("a stage with only deferred tasks is scheduled", () => {
  const result = deriveStageState([makeTask({ status: "deferred" })]);
  assert.equal(result.state, "scheduled");
});

test("a stage whose tasks are all done is complete", () => {
  const result = deriveStageState([
    makeTask({ status: "done" }),
    makeTask({ id: "t2", status: "done" }),
  ]);
  assert.equal(result.state, "complete");
  assert.equal(result.verified, 0);
});

test("a stage whose tasks are all verified is verified", () => {
  const result = deriveStageState([
    makeTask({ status: "done", verified: true }),
    makeTask({ id: "t2", status: "done", verified: true }),
  ]);
  assert.equal(result.state, "verified");
  assert.equal(result.verified, 2);
});

test("a done but unverified stage is complete, not verified", () => {
  const result = deriveStageState([
    makeTask({ status: "done", verified: false }),
    makeTask({ id: "t2", status: "done", verified: false }),
  ]);
  assert.equal(result.state, "complete");
  assert.equal(result.verified, 0);
});

test("a partially verified stage is not verified", () => {
  const result = deriveStageState([
    makeTask({ status: "done", verified: true }),
    makeTask({ id: "t2", status: "done", verified: false }),
  ]);
  assert.notEqual(result.state, "verified");
  assert.equal(result.verified, 1);
});

test("next task prefers in-progress, then blocked, then todo", () => {
  const inProgress = makeTask({ id: "ip", status: "in_progress" });
  const blocked = makeTask({ id: "bl", status: "blocked" });
  const todo = makeTask({ id: "td", status: "todo" });

  assert.equal(
    deriveStageState([todo, blocked, inProgress]).nextTask?.id,
    "ip",
  );
  assert.equal(deriveStageState([todo, blocked]).nextTask?.id, "bl");
  assert.equal(deriveStageState([todo]).nextTask?.id, "td");
  assert.equal(deriveStageState([]).nextTask, null);
});

test("deferred tasks are not offered as the next action", () => {
  const result = deriveStageState([makeTask({ status: "deferred" })]);
  assert.equal(result.nextTask, null);
  assert.equal(result.deferred, 1);
});

test("stage summaries group tasks by their plan phase", () => {
  const summaries = buildStageSummaries([
    makeTask({ id: "r1", phase: "research", status: "done" }),
    makeTask({ id: "i1", phase: "implementation", status: "todo" }),
    makeTask({ id: "i2", phase: "implementation", status: "done" }),
    makeTask({ id: "s1", phase: "security", status: "blocked" }),
  ]);

  const research = summaries.find((s) => s.definition.id === "research");
  const build = summaries.find((s) => s.definition.id === "build");
  const quality = summaries.find((s) => s.definition.id === "quality");
  const retrospective = summaries.find((s) => s.definition.id === "retrospective");

  assert.equal(research?.total, 1);
  assert.equal(research?.done, 1);
  assert.equal(research?.state, "complete");
  assert.equal(build?.total, 2);
  assert.equal(build?.done, 1);
  assert.equal(build?.completion, 50);
  assert.equal(quality?.total, 1);
  assert.equal(quality?.state, "blocked");
  // Retrospective is locked (planned) when no submission tasks are done and deadline is future
  assert.equal(retrospective?.state, "planned");
  assert.equal(retrospective?.total, 0);
});

test("a stage with no tasks in the plan is not started, not complete", () => {
  const summaries = buildStageSummaries([]);
  for (const summary of summaries) {
    if (summary.definition.id === "retrospective") {
      // Retrospective is locked (planned) when no submission tasks are done and deadline is future
      assert.equal(summary.state, "planned");
    } else if (summary.definition.planned) {
      assert.equal(summary.state, "planned");
    } else {
      assert.equal(summary.state, "not_started");
    }
  }
});

test("stage state labels cover every state", () => {
  for (const state of [
    "complete",
    "active",
    "blocked",
    "scheduled",
    "not_started",
    "planned",
    "verified",
  ]) {
    assert.ok(STAGE_STATE_LABELS[state], `missing label for ${state}`);
  }
});

test("plan progress summarises counts and remaining effort", () => {
  const progress = summarisePlan([
    makeTask({ status: "done", estimatedMinutes: 30 }),
    makeTask({ id: "t2", status: "todo", estimatedMinutes: 45 }),
    makeTask({ id: "t3", status: "blocked", estimatedMinutes: 15 }),
    makeTask({ id: "t4", status: "deferred", estimatedMinutes: 60 }),
  ]);

  assert.equal(progress.total, 4);
  assert.equal(progress.done, 1);
  assert.equal(progress.todo, 1);
  assert.equal(progress.blocked, 1);
  assert.equal(progress.deferred, 1);
  assert.equal(progress.completion, 25);
  assert.equal(progress.estimatedMinutes, 150);
  // Deferred work is not counted as remaining effort.
  assert.equal(progress.remainingMinutes, 60);
});

test("plan progress on an empty plan is zeroed, not NaN", () => {
  const progress = summarisePlan([]);
  assert.equal(progress.total, 0);
  assert.equal(progress.completion, 0);
  assert.equal(progress.remainingMinutes, 0);
});

test("duration formatting is human readable", () => {
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(105), "1h 45m");
  assert.equal(formatDuration(-10), "0m");
});

test("remaining time reports days, hours and urgency", () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  const twoDays = computeRemaining("2026-10-23T12:00:00.000Z", now);
  assert.equal(twoDays.isPast, false);
  assert.equal(twoDays.isUrgent, false);
  assert.equal(twoDays.label, "2d");

  const oneHour = computeRemaining("2026-10-21T13:00:00.000Z", now);
  assert.equal(oneHour.isUrgent, true);
  assert.equal(oneHour.isCritical, true);
  assert.equal(oneHour.label, "1h");

  const past = computeRemaining("2026-10-20T12:00:00.000Z", now);
  assert.equal(past.isPast, true);
  assert.equal(past.isUrgent, false);
  assert.ok(past.longLabel.includes("overdue"));
});

test("remaining time long label reads as a sentence", () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  const remaining = computeRemaining("2026-10-22T14:00:00.000Z", now);
  assert.equal(remaining.longLabel, "1 day 2 hours remaining");
});

test("phases map to exactly one stage", () => {
  assert.equal(stageIdForPhase("research"), "research");
  assert.equal(stageIdForPhase("implementation"), "build");
  assert.equal(stageIdForPhase("security"), "quality");
  assert.equal(stageIdForPhase("track_selection"), "ideas");
});

test("phase labels are readable", () => {
  assert.equal(phaseLabel("idea_selection"), "Idea selection");
  assert.equal(phaseLabel("deployment"), "Deployment");
  assert.equal(phaseLabel("unknown_phase"), "Unknown phase");
});
