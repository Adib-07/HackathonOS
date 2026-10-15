import assert from "node:assert/strict";
import test from "node:test";
import { createPlanDraft } from "../src/lib/planner.ts";

const now = new Date("2026-10-15T08:00:00.000Z");

function makeCompetition(overrides = {}) {
  return {
    id: "9ec4434e-0c2a-4f42-8ab1-c31de95c9ed1",
    ownerId: "test-owner",
    name: "Test build weekend",
    organizer: "Example organizer",
    competitionType: "online",
    startAt: null,
    deadline: new Date(now.getTime() + 12 * 60 * 60_000),
    teamSize: 1,
    trackMode: "choose",
    currentTrack: null,
    problemStatement: "Build a useful tool for local communities.",
    officialUrl: "https://example.com/event",
    rulesUrl: "https://example.com/rules",
    mandatoryDeliverables: ["Working demo", "Project repository"],
    teamSkills: ["engineering"],
    ideaComplexity: 3,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("full plan allocates a bounded schedule and keeps task dependencies ordered", () => {
  const competition = makeCompetition();
  const result = createPlanDraft({
    competition,
    now,
    availableMinutes: 12 * 60,
    previousTasks: [],
  });
  const indexByTaskKey = new Map(
    result.tasks.map((task, index) => [task.taskKey, index]),
  );
  const allocatedMinutes = result.tasks.reduce(
    (sum, task) => sum + task.estimatedMinutes,
    0,
  );

  assert.equal(result.status, "feasible");
  assert.equal(allocatedMinutes + result.bufferMinutes, 12 * 60);
  assert.ok(result.tasks.length >= 10);
  assert.ok(result.tasks.every((task) => task.estimatedMinutes > 0));
  assert.ok(
    result.tasks.every((task) => task.plannedEndAt <= competition.deadline),
  );

  for (const [index, task] of result.tasks.entries()) {
    for (const dependency of task.dependencies) {
      assert.ok(indexByTaskKey.has(dependency), `${dependency} is in the plan`);
      assert.ok(
        indexByTaskKey.get(dependency) < index,
        `${dependency} precedes ${task.taskKey}`,
      );
    }
  }
});

test("plan never schedules work beyond the competition deadline", () => {
  const competition = makeCompetition({
    deadline: new Date(now.getTime() + 60 * 60_000),
  });
  const result = createPlanDraft({
    competition,
    now,
    availableMinutes: 1000,
    previousTasks: [],
  });
  const lastTask = result.tasks.at(-1);

  assert.ok(lastTask);
  assert.ok(lastTask.plannedEndAt <= competition.deadline);
  assert.equal(result.bufferMinutes, 12);
  assert.ok(result.warnings.some((warning) => warning.includes("two hours")));
});

test("very short windows are explicitly marked infeasible", () => {
  const competition = makeCompetition({
    deadline: new Date(now.getTime() + 10 * 60_000),
  });
  const result = createPlanDraft({
    competition,
    now,
    availableMinutes: 10,
    previousTasks: [],
  });

  assert.equal(result.status, "infeasible");
  assert.ok(result.warnings.some((warning) => warning.includes("cannot fit")));
  assert.ok(
    result.tasks.some((task) =>
      task.acceptanceCriteria.some((criterion) =>
        criterion.includes("Working demo"),
      ),
    ),
  );
});

test("recalculation preserves progress for tasks that remain in the plan", () => {
  const result = createPlanDraft({
    competition: makeCompetition(),
    now,
    availableMinutes: 12 * 60,
    previousTasks: [
      { taskKey: "build-product", status: "done" },
      { taskKey: "review-security", status: "blocked" },
      { taskKey: "removed-task", status: "done" },
    ],
  });
  const statusByKey = new Map(
    result.tasks.map((task) => [task.taskKey, task.status]),
  );

  assert.equal(statusByKey.get("build-product"), "done");
  assert.equal(statusByKey.get("review-security"), "blocked");
  assert.equal(statusByKey.has("removed-task"), false);
  assert.ok(result.warnings.some((warning) => warning.includes("blocked")));
});
