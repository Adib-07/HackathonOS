import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "node:http";
import app, { db, pool, competitionsTable } from "../dist/app.mjs";
import { eq } from "drizzle-orm";
import { setupTestDatabase } from "./setup.mjs";
import { cleanupTestUser, uniqueTestUser, createTestCompetition } from "./test-helpers.mjs";

await setupTestDatabase();

let server;
let baseUrl = "";
const createdUsers = [];

function newUser() {
  const u = uniqueTestUser("comp");
  createdUsers.push(u);
  return u;
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
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (pool) {
    await pool.end();
  }
});

test("GET /api/competitions returns 401 when request is unauthenticated", async () => {
  const res = await fetch(`${baseUrl}/api/competitions`);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, "Unauthorized");
});

test("POST /api/competitions returns 401 when request is unauthenticated", async () => {
  const res = await fetch(`${baseUrl}/api/competitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Unauthenticated Hackathon", deadline: new Date().toISOString() }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/competitions returns 400 when name is empty whitespace", async () => {
  const userId = newUser();
  const res = await fetch(`${baseUrl}/api/competitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": userId,
    },
    body: JSON.stringify({
      name: "    ",
      deadline: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/competitions returns 400 when deadline is missing or invalid", async () => {
  const userId = newUser();
  const res = await fetch(`${baseUrl}/api/competitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": userId,
    },
    body: JSON.stringify({
      name: "Invalid Deadline Event",
      deadline: "invalid-date-string",
    }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/competitions creates and persists competition in PostgreSQL", async () => {
  const userId = newUser();
  const deadlineStr = new Date(Date.now() + 14 * 86400000).toISOString();
  const payload = {
    name: "MIT Climate Hackathon 2026",
    organizer: "MIT Energy Initiative",
    competitionType: "hybrid",
    deadline: deadlineStr,
    teamSize: 4,
    trackMode: "choose",
    currentTrack: "Clean Energy Tech",
    problemStatement: "Design software solutions that accelerate community solar adoption.",
    officialUrl: "https://climate.mit.edu/hackathon",
    rulesUrl: "https://climate.mit.edu/hackathon/rules",
    mandatoryDeliverables: ["Working Prototype", "Slide Deck", "Repository"],
    teamSkills: ["React", "PostgreSQL", "Python"],
    status: "preparing",
  };

  const res = await fetch(`${baseUrl}/api/competitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": userId,
    },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 201);
  const created = await res.json();
  assert.ok(created.id, "Expected created competition to have an id");
  assert.equal(created.name, "MIT Climate Hackathon 2026");
  assert.equal(created.organizer, "MIT Energy Initiative");
  assert.equal(created.competitionType, "hybrid");
  assert.equal(created.teamSize, 4);
  assert.deepEqual(created.mandatoryDeliverables, ["Working Prototype", "Slide Deck", "Repository"]);
  assert.deepEqual(created.teamSkills, ["React", "PostgreSQL", "Python"]);

  const [dbRecord] = await db
    .select()
    .from(competitionsTable)
    .where(eq(competitionsTable.id, created.id));

  assert.ok(dbRecord, "Record must exist in persistent database");
  assert.equal(dbRecord.name, "MIT Climate Hackathon 2026");
  assert.equal(dbRecord.ownerId, userId);
});

test("GET /api/competitions retrieves saved competitions for authenticated owner", async () => {
  const userId = newUser();
  const createRes = await fetch(`${baseUrl}/api/competitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": userId,
    },
    body: JSON.stringify({
      name: "List Test Competition",
      deadline: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  assert.equal(createRes.status, 201);

  const res = await fetch(`${baseUrl}/api/competitions`, {
    headers: { "x-test-user-id": userId },
  });
  assert.equal(res.status, 200);
  const items = await res.json();
  assert.ok(Array.isArray(items));
  assert.ok(items.length >= 1);
  const found = items.find((c) => c.name === "List Test Competition");
  assert.ok(found, "Saved competition must be returned in competition list");
});

test("GET /api/competitions/:id retrieves exact competition by ID", async () => {
  const userId = newUser();
  const createRes = await fetch(`${baseUrl}/api/competitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": userId,
    },
    body: JSON.stringify({
      name: "Detail Test Competition",
      deadline: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();

  const detailRes = await fetch(`${baseUrl}/api/competitions/${created.id}`, {
    headers: { "x-test-user-id": userId },
  });
  assert.equal(detailRes.status, 200);
  const detail = await detailRes.json();
  assert.equal(detail.id, created.id);
  assert.equal(detail.name, created.name);
});

test("Member isolation: User B cannot access User A competitions", async () => {
  const userA = newUser();
  const userB = newUser();

  const createRes = await fetch(`${baseUrl}/api/competitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": userA,
    },
    body: JSON.stringify({
      name: "User A Private Competition",
      deadline: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  assert.equal(createRes.status, 201);

  const resB = await fetch(`${baseUrl}/api/competitions`, {
    headers: { "x-test-user-id": userB },
  });
  assert.equal(resB.status, 200);
  const itemsB = await resB.json();
  const leaked = itemsB.find((c) => c.name === "User A Private Competition");
  assert.equal(leaked, undefined, "User B must not see User A records");
});

test("GET /api/overview displays saved competition in overview dashboard", async () => {
  const userId = newUser();
  const createRes = await fetch(`${baseUrl}/api/competitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": userId,
    },
    body: JSON.stringify({
      name: "Overview Test Competition",
      deadline: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  assert.equal(createRes.status, 201);

  const res = await fetch(`${baseUrl}/api/overview`, {
    headers: { "x-test-user-id": userId },
  });
  assert.equal(res.status, 200);
  const overview = await res.json();
  assert.ok(overview.competitionCount >= 1);
  assert.ok(overview.currentCompetition);
  assert.equal(overview.currentCompetition.name, "Overview Test Competition");
});
