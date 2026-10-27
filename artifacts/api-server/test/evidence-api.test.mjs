import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "node:http";
import app, { db, pool, competitionsTable, workflowEvidenceTable } from "../dist/app.mjs";
import { and, eq } from "drizzle-orm";
import { setupTestDatabase } from "./setup.mjs";

await setupTestDatabase();

let server;
let baseUrl = "";
const ownerA = "evidence-owner-a";
const ownerB = "evidence-owner-b";
const thirdParty = "evidence-owner-c";

const DEADLINE = new Date(Date.now() + 14 * 86400000).toISOString();

// Evidence observation times are anchored in the past so the "newest record
// wins" ordering is deterministic and the future-timestamp guard is not
// accidentally triggered.
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

let competitionId = "";
let planId = "";
let taskId = "";
let implementationTaskId = "";
let testingTaskId = "";

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

  // Create a competition, a plan, and tasks through the real API.
  const created = await call("/api/competitions", {
    method: "POST",
    userId: ownerA,
    body: {
      name: "Evidence Test Hackathon",
      deadline: DEADLINE,
      mandatoryDeliverables: ["Working demo"],
    },
  });
  assert.equal(created.status, 201);
  competitionId = created.json.id;

  const plan = await call(`/api/competitions/${competitionId}/plans`, {
    method: "POST",
    userId: ownerA,
    body: { trigger: "manual" },
  });
  assert.equal(plan.status, 201);
  planId = plan.json.id;

  const implementation = plan.json.tasks.find((t) => t.phase === "implementation");
  const testing = plan.json.tasks.find((t) => t.phase === "testing");
  assert.ok(implementation, "expected an implementation task");
  assert.ok(testing, "expected a testing task");
  implementationTaskId = implementation.id;
  testingTaskId = testing.id;
  taskId = implementation.id;
});

after(async () => {
  try {
    await db
      .delete(workflowEvidenceTable)
      .where(eq(workflowEvidenceTable.competitionId, competitionId));
    await db
      .delete(competitionsTable)
      .where(eq(competitionsTable.id, competitionId));
  } catch (err) {
    console.warn("Cleanup warning:", err.message);
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
});

test("evidence routes require authentication", async () => {
  const list = await call(`/api/competitions/${competitionId}/evidence`);
  assert.equal(list.status, 401);
  const create = await call(
    `/api/competitions/${competitionId}/tasks/${taskId}/evidence`,
    { method: "POST", body: { type: "TEST_RESULT", summary: "x", result: "passed" } },
  );
  assert.equal(create.status, 401);
});

test("a task with no evidence is DONE but not VERIFIED", async () => {
  // A fresh task has not been started, so it is not_started.
  const fresh = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId: ownerA,
  });
  const freshTask = fresh.json.tasks.find((t) => t.id === taskId);
  assert.equal(freshTask.verification.state, "not_started");
  assert.equal(freshTask.verification.verified, false);
  assert.equal(freshTask.verification.evidenceCount, 0);

  // Marking it done is not the same as verifying it.
  const marked = await call(`/api/competitions/${competitionId}/tasks/${taskId}`, {
    method: "PATCH",
    userId: ownerA,
    body: { status: "done" },
  });
  assert.equal(marked.status, 200);
  assert.equal(marked.json.verification.state, "done");
  assert.equal(marked.json.verification.verified, false);
  assert.equal(marked.json.verification.evidenceCount, 0);
  assert.ok(marked.json.verification.reason.length > 0);
});

test("valid evidence is recorded and linked to the correct task", async () => {
  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerA,
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
  // Provenance is always manual. A client cannot claim a machine ran it.
  assert.equal(res.json.source, "manual");
  assert.equal(res.json.phaseSnapshot, "testing");
  assert.ok(res.json.verificationMethodSnapshot.length > 0);
});

test("a client cannot supply its own provenance", async () => {
  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerA,
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
  // Either rejected outright or stored as manual. Never stored as machine.
  if (res.status === 201) {
    assert.equal(res.json.source, "manual");
  } else {
    assert.equal(res.status, 400);
  }
});

test("evidence missing required fields is rejected", async () => {
  const noSummary = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    { method: "POST", userId: ownerA, body: { type: "TEST_RESULT", result: "passed" } },
  );
  assert.equal(noSummary.status, 400);

  const noResult = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    { method: "POST", userId: ownerA, body: { type: "TEST_RESULT", summary: "x" } },
  );
  assert.equal(noResult.status, 400);

  const badType = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerA,
      body: { type: "NOT_A_TYPE", summary: "x", result: "passed" },
    },
  );
  assert.equal(badType.status, 400);

  const badResult = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerA,
      body: { type: "TEST_RESULT", summary: "x", result: "maybe" },
    },
  );
  assert.equal(badResult.status, 400);
});

test("evidence that looks like a credential is rejected", async () => {
  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerA,
      body: {
        type: "TEST_RESULT",
        summary: "Used key sk_live_abcdefghijklmnop1234 to run it",
        result: "passed",
      },
    },
  );
  assert.equal(res.status, 400);
  assert.ok(res.json.error.toLowerCase().includes("credential"));
});

test("evidence for another owner's task is rejected", async () => {
  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerB,
      body: {
        type: "TEST_RESULT",
        summary: "Trying to attach evidence to someone else's task.",
        result: "passed",
      },
    },
  );
  // 404, not 403: another owner's records must not be discoverable.
  assert.equal(res.status, 404);
});

test("another owner cannot list the evidence", async () => {
  const res = await call(`/api/competitions/${competitionId}/evidence`, {
    userId: ownerB,
  });
  assert.equal(res.status, 404);
});

test("the owner can list the evidence they recorded", async () => {
  const res = await call(`/api/competitions/${competitionId}/evidence`, {
    userId: ownerA,
  });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json));
  assert.ok(res.json.length >= 1);
  assert.ok(res.json.every((item) => item.source === "manual"));
});

test("a passing required test verifies a testing task", async () => {
  // The testing task already has a passing TEST_RESULT from an earlier test.
  const res = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId: ownerA,
  });
  const task = res.json.tasks.find((t) => t.id === testingTaskId);
  // Mark the task done first: evidence alone does not finish the work.
  await call(`/api/competitions/${competitionId}/tasks/${testingTaskId}`, {
    method: "PATCH",
    userId: ownerA,
    body: { status: "done" },
  });

  const after = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId: ownerA,
  });
  const updated = after.json.tasks.find((t) => t.id === testingTaskId);
  assert.equal(updated.verification.state, "verified");
  assert.equal(updated.verification.verified, true);
  assert.deepEqual(updated.verification.satisfiedTypes, ["TEST_RESULT"]);
});

test("a task with a failed required check is not verified", async () => {
  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerA,
      body: {
        type: "TEST_RESULT",
        summary: "Re-ran the suite; a check now fails.",
        result: "failed",
        commandName: "pnpm test",
        observedAt: new Date(BASE_TIME + 1000).toISOString(),
      },
    },
  );
  assert.equal(res.status, 201);

  const plan = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId: ownerA,
  });
  const task = plan.json.tasks.find((t) => t.id === testingTaskId);
  assert.equal(task.verification.verified, false);
  assert.equal(task.verification.blockedByFailure, true);
  assert.deepEqual(task.verification.failedTypes, ["TEST_RESULT"]);
});

test("a newer passing record supersedes an older failure", async () => {
  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerA,
      body: {
        type: "TEST_RESULT",
        summary: "Fixed the failing check and re-ran it.",
        result: "passed",
        commandName: "pnpm test",
        observedAt: new Date(BASE_TIME + 2000).toISOString(),
      },
    },
  );
  assert.equal(res.status, 201);

  const plan = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId: ownerA,
  });
  const task = plan.json.tasks.find((t) => t.id === testingTaskId);
  assert.equal(task.verification.state, "verified");
  assert.equal(task.verification.verified, true);
});

test("a deployment URL alone does not verify a deployment task", async () => {
  const plan = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId: ownerA,
  });
  const deploymentTask = plan.json.tasks.find((t) => t.phase === "deployment");
  assert.ok(deploymentTask, "expected a deployment task");
  await call(`/api/competitions/${competitionId}/tasks/${deploymentTask.id}`, {
    method: "PATCH",
    userId: ownerA,
    body: { status: "done" },
  });

  const urlOnly = await call(
    `/api/competitions/${competitionId}/tasks/${deploymentTask.id}/evidence`,
    {
      method: "POST",
      userId: ownerA,
      body: {
        type: "DEPLOYMENT_URL",
        summary: "Published at example.test",
        result: "passed",
        sourceUrl: "https://example.test",
      },
    },
  );
  assert.equal(urlOnly.status, 201);

  const after = await call(`/api/competitions/${competitionId}/plans/${planId}`, {
    userId: ownerA,
  });
  const task = after.json.tasks.find((t) => t.id === deploymentTask.id);
  assert.equal(task.verification.verified, false);
  assert.ok(task.verification.missingTypes.includes("HTTP_CHECK"));
});

test("evidence cannot be observed in the future", async () => {
  const res = await call(
    `/api/competitions/${competitionId}/tasks/${testingTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerA,
      body: {
        type: "TEST_RESULT",
        summary: "From the future",
        result: "passed",
        observedAt: new Date(Date.now() + 86400000).toISOString(),
      },
    },
  );
  assert.equal(res.status, 400);
});

test("another owner cannot delete evidence", async () => {
  const list = await call(`/api/competitions/${competitionId}/evidence`, {
    userId: ownerA,
  });
  const target = list.json[0];
  const res = await call(
    `/api/competitions/${competitionId}/evidence/${target.id}`,
    { method: "DELETE", userId: ownerB },
  );
  assert.equal(res.status, 404);

  // The record must still be there.
  const after = await call(`/api/competitions/${competitionId}/evidence`, {
    userId: ownerA,
  });
  assert.ok(after.json.some((item) => item.id === target.id));
});

test("the owner can delete their own evidence", async () => {
  const list = await call(`/api/competitions/${competitionId}/evidence`, {
    userId: ownerA,
  });
  const target = list.json[0];
  const res = await call(
    `/api/competitions/${competitionId}/evidence/${target.id}`,
    { method: "DELETE", userId: ownerA },
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.deleted, true);

  const after = await call(`/api/competitions/${competitionId}/evidence`, {
    userId: ownerA,
  });
  assert.ok(!after.json.some((item) => item.id === target.id));
});

test("evidence persists and survives a plan read", async () => {
  const created = await call(
    `/api/competitions/${competitionId}/tasks/${implementationTaskId}/evidence`,
    {
      method: "POST",
      userId: ownerA,
      body: {
        type: "BUILD_RESULT",
        summary: "Build completed with no errors.",
        result: "passed",
        commandName: "pnpm build",
        observedAt: new Date(BASE_TIME - 3000).toISOString(),
      },
    },
  );
  assert.equal(created.status, 201);
  const evidenceId = created.json.id;

  // Read it back from the list endpoint.
  const list = await call(`/api/competitions/${competitionId}/evidence`, {
    userId: ownerA,
  });
  const found = list.json.find((item) => item.id === evidenceId);
  assert.ok(found, "evidence must be retrievable");
  assert.equal(found.commandName, "pnpm build");
  assert.equal(found.result, "passed");
  assert.equal(found.taskKey, "build-product");
});
