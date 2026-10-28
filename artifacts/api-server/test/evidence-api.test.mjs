import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "node:http";
import app, { db, pool, workflowEvidenceTable } from "../dist/app.mjs";
import { and, eq, inArray } from "drizzle-orm";
import { setupTestDatabase } from "./setup.mjs";
import { cleanupTestUser, uniqueTestUser } from "./test-helpers.mjs";

await setupTestDatabase();

let server;
let baseUrl = "";
const createdUsers = [];

function newUser() {
  const u = uniqueTestUser("evidence");
  createdUsers.push(u);
  return u;
}

const DEADLINE = new Date(Date.now() + 14 * 86400000).toISOString();
const BASE_TIME = Date.now() - 10 * 60 * 1000;

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

async function createCompetitionWithPlan(userId) {
  const created = await call("/api/competitions", {
    method: "POST",
    userId,
    body: {
      name: "Evidence Test Hackathon",
      deadline: DEADLINE,
      mandatoryDeliverables: ["Working demo"],
    },
  });
  assert.equal(created.status, 201);
  const competitionId = created.json.id;

  const plan = await call(`/api/competitions/${competitionId}/plans`, {
    method: "POST",
    userId,
    body: { trigger: "manual" },
  });
  assert.equal(plan.status, 201);
  const planId = plan.json.id;
  const implementationTaskId = plan.json.tasks.find((t) => t.phase === "implementation").id;
  const testingTaskId = plan.json.tasks.find((t) => t.phase === "testing").id;

  return { competitionId, planId, implementationTaskId, testingTaskId };
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

test("evidence routes require authentication", async () => {
  const userId = newUser();
  const { competitionId, planId, implementationTaskId, testingTaskId } = await createCompetitionWithPlan(userId);

  const list = await call(`/api/competitions/${competitionId}/evidence`);
  assert.equal(list.status, 401);
  const create = await call(
    `/api/competitions/${competitionId}/tasks/${implementationTaskId}/evidence`,
    { method: "POST", body: { type: "TEST_RESULT", summary: "x", result: "passed" } },
  );
  assert.equal(create.status, 401);
});

test("a task with no evidence is DONE but not VERIFIED", async () => {
  const userId = newUser();
  const { competitionId, planId, implementationTaskId } = await createCompetitionWithPlan(userId);

  const fresh = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId,
  });
  const freshTask = fresh.json.tasks.find((t) => t.id === implementationTaskId);
  assert.equal(freshTask.verification.state, "not_started");
  assert.equal(freshTask.verification.verified, false);
  assert.equal(freshTask.verification.evidenceCount, 0);

  const marked = await call(`/api/competitions/${competitionId}/tasks/${implementationTaskId}`, {
    method: "PATCH",
    userId,
    body: { status: "done" },
  });
  assert.equal(marked.status, 200);
  assert.equal(marked.json.verification.state, "done");
  assert.equal(marked.json.verification.verified, false);
  assert.equal(marked.json.verification.evidenceCount, 0);
  assert.ok(marked.json.verification.reason.length > 0);
});

test("valid evidence is recorded and linked to the correct task", async () => {
  const userId = newUser();
  const { competitionId, planId, testingTaskId } = await createCompetitionWithPlan(userId);

  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "Ran the test suite; all checks passed.",
        result: "passed",
        commandName: "pnpm test",
        observedAt: new Date(BASE_TIME).toISOString(),
      },
    },
  );
  assert.equal(res.status, 201);
  assert.equal(res.json.type, "TEST_RESULT");
  assert.equal(res.json.result, "passed");
  assert.equal(res.json.taskKey, "test-product");
  assert.equal(res.json.taskId, testingTaskId);
  assert.equal(res.json.source, "manual");
  assert.equal(res.json.phaseSnapshot, "testing");
  assert.ok(res.json.verificationMethodSnapshot.length > 0);
});

test("a client cannot supply its own provenance", async () => {
  const userId = newUser();
  const { competitionId, testingTaskId } = await createCompetitionWithPlan(userId);

  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "Trying to look machine generated.",
        result: "passed",
        commandName: "pnpm test",
        observedAt: new Date(BASE_TIME - 2000).toISOString(),
        source: "machine",
      },
    },
  );
  if (res.status === 201) {
    assert.equal(res.json.source, "manual");
  } else {
    assert.equal(res.status, 400);
  }
});

test("evidence missing required fields is rejected", async () => {
  const userId = newUser();
  const { competitionId, testingTaskId } = await createCompetitionWithPlan(userId);

  const noSummary = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    { method: "POST", userId, body: { type: "TEST_RESULT", result: "passed" } },
  );
  assert.equal(noSummary.status, 400);

  const noResult = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    { method: "POST", userId, body: { type: "TEST_RESULT", summary: "x" } },
  );
  assert.equal(noResult.status, 400);

  const badType = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    { method: "POST", userId, body: { type: "INVALID_TYPE", summary: "x", result: "passed" } },
  );
  assert.equal(badType.status, 400);
});

test("evidence that looks like a credential is rejected", async () => {
  const userId = newUser();
  const { competitionId, testingTaskId } = await createCompetitionWithPlan(userId);

  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "API_KEY=sk_live_abc123",
        result: "passed",
        observedAt: new Date(BASE_TIME - 4000).toISOString(),
      },
    },
  );
  assert.equal(res.status, 400);
});

test("evidence for another owner's task is rejected", async () => {
  const userA = newUser();
  const userB = newUser();

  const { competitionId: compAId, testingTaskId: taskAId } = await createCompetitionWithPlan(userA);
  const { competitionId: compBId, testingTaskId: taskBId } = await createCompetitionWithPlan(userB);

  const res = await call(
    `/api/competitions/${compBId}/tasks/${taskBId}/evidence`,
    {
      method: "POST",
      userId: userA,
      body: { type: "TEST_RESULT", summary: "x", result: "passed" },
    },
  );
  assert.equal(res.status, 404);
});

test("another owner cannot list the evidence", async () => {
  const userA = newUser();
  const userB = newUser();

  const { competitionId: compBId } = await createCompetitionWithPlan(userB);

  const res = await call(`/api/competitions/${compBId}/evidence`, {
    userId: userA,
  });
  assert.equal(res.status, 404);
});

test("the owner can list the evidence they recorded", async () => {
  const userId = newUser();
  const { competitionId, testingTaskId } = await createCompetitionWithPlan(userId);

  await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "Owner's evidence",
        result: "passed",
        observedAt: new Date(BASE_TIME - 6000).toISOString(),
      },
    },
  );

  const list = await call(`/api/competitions/${competitionId}/evidence`, {
    userId,
  });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.json));
  assert.ok(list.json.length >= 1);
  assert.ok(list.json.some((e) => e.summary === "Owner's evidence"));
});

test("a passing required test verifies a testing task", async () => {
  const userId = newUser();
  const { competitionId, planId, testingTaskId } = await createCompetitionWithPlan(userId);

  await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "All tests pass",
        result: "passed",
        observedAt: new Date(BASE_TIME - 8000).toISOString(),
      },
    },
  );

  const plan = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId,
  });
  const task = plan.json.tasks.find((t) => t.id === testingTaskId);
  assert.equal(task.verification.state, "verified");
  assert.equal(task.verification.verified, true);
  assert.ok(task.verification.evidenceCount >= 1);
});

test("a task with a failed required check is not verified", async () => {
  const userId = newUser();
  const { competitionId, planId, testingTaskId } = await createCompetitionWithPlan(userId);

  await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "Tests failed",
        result: "failed",
        observedAt: new Date(BASE_TIME - 10000).toISOString(),
      },
    },
  );

  const plan = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId,
  });
  const task = plan.json.tasks.find((t) => t.id === testingTaskId);
  assert.equal(task.verification.verified, false);
});

test("a newer passing record supersedes an older failure", async () => {
  const userId = newUser();
  const { competitionId, planId, testingTaskId } = await createCompetitionWithPlan(userId);

  await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "Old failure",
        result: "failed",
        observedAt: new Date(BASE_TIME - 12000).toISOString(),
      },
    },
  );

  await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "New pass",
        result: "passed",
        observedAt: new Date(BASE_TIME - 2000).toISOString(),
      },
    },
  );

  const plan = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId,
  });
  const task = plan.json.tasks.find((t) => t.id === testingTaskId);
  assert.equal(task.verification.verified, true);
});

test("a deployment URL alone does not verify a deployment task", async () => {
  const userId = newUser();
  const { competitionId, planId } = await createCompetitionWithPlan(userId);

  const plan = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId,
  });
  const deployTask = plan.json.tasks.find((t) => t.phase === "deployment");
  assert.ok(deployTask, "expected a deployment task");

  const res = await call(
    `/api/competitions/${competitionId}/tasks/${deployTask.id}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "DEPLOYMENT",
        summary: "Deployed to production",
        result: "passed",
        deploymentUrl: "https://example.com",
        observedAt: new Date(BASE_TIME - 14000).toISOString(),
      },
    },
  );
  assert.equal(res.status, 201);

  const updatedPlan = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId,
  });
  const updatedTask = updatedPlan.json.tasks.find((t) => t.id === deployTask.id);
  assert.equal(updatedTask.verification.verified, false);
});

test("evidence cannot be observed in the future", async () => {
  const userId = newUser();
  const { competitionId, testingTaskId } = await createCompetitionWithPlan(userId);

  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "Future evidence",
        result: "passed",
        observedAt: new Date(Date.now() + 86400000).toISOString(),
      },
    },
  );
  assert.equal(res.status, 400);
});

test("another owner cannot delete evidence", async () => {
  const userA = newUser();
  const userB = newUser();

  const { competitionId: compAId, testingTaskId: taskAId } = await createCompetitionWithPlan(userA);
  const { competitionId: compBId } = await createCompetitionWithPlan(userB);

  const createRes = await call(
    `/api/competitions/${compAId}/tasks/${taskAId}/evidence`,
    {
      method: "POST",
      userId: userA,
      body: {
        type: "TEST_RESULT",
        summary: "Evidence to delete",
        result: "passed",
        observedAt: new Date(BASE_TIME - 16000).toISOString(),
      },
    },
  );
  assert.equal(createRes.status, 201);
  const evidenceId = createRes.json.id;

  const delRes = await call(
    `/api/competitions/${compBId}/evidence/${evidenceId}`,
    { method: "DELETE", userId: userB },
  );
  assert.equal(delRes.status, 404);
});

test("the owner can delete their own evidence", async () => {
  const userId = newUser();
  const { competitionId, testingTaskId } = await createCompetitionWithPlan(userId);

  const createRes = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "Evidence to delete",
        result: "passed",
        observedAt: new Date(BASE_TIME - 18000).toISOString(),
      },
    },
  );
  assert.equal(createRes.status, 201);
  const evidenceId = createRes.json.id;

  const delRes = await call(
    `/api/competitions/${competitionId}/evidence/${evidenceId}`,
    { method: "DELETE", userId },
  );
  assert.equal(delRes.status, 200);

  const list = await call(`/api/competitions/${competitionId}/evidence`, {
    userId,
  });
  assert.equal(list.json.find((e) => e.id === evidenceId), undefined);
});

test("evidence persists and survives a plan read", async () => {
  const userId = newUser();
  const { competitionId, planId, testingTaskId } = await createCompetitionWithPlan(userId);

  await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId,
      body: {
        type: "TEST_RESULT",
        summary: "Persistent evidence",
        result: "passed",
        observedAt: new Date(BASE_TIME - 20000).toISOString(),
      },
    },
  );

  const plan = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId,
  });
  const task = plan.json.tasks.find((t) => t.id === testingTaskId);
  assert.equal(task.verification.evidenceCount >= 1, true);
});
