import "../../../scripts/test-guard.mjs";
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createServer } from "node:http";

let app;
let server;
let baseUrl = "";

async function call(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
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
  return { status: res.status, json, text, headers: res.headers };
}

before(async () => {
  // Run in production mode to test security headers
  process.env.NODE_ENV = "production";
  process.env.TEST_ALLOW_PRODUCTION_ENV = "true";
  // Use valid Clerk key formats (base64-encoded frontend API for pk_test_)
  process.env.CLERK_SECRET_KEY = "sk_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  process.env.CLERK_PUBLISHABLE_KEY =
    "pk_test_Y2xlcmsudGVzdC5hY2NvdW50cy5kZXYk";
  process.env.DATABASE_URL =
    "postgresql://test:test@localhost:5432/hackathon_os_test";

  // Dynamic import after env vars are set
  const mod = await import("../dist/app.mjs");
  app = mod.default;

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
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("health endpoint returns 200 with security headers", async () => {
  const res = await call("/api/healthz");
  assert.equal(res.status, 200);
  assert.equal(res.json?.status, "ok");

  // Check security headers
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(
    res.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(res.headers.get("x-powered-by"), null);
  assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
  // CSP should be present
  const csp = res.headers.get("content-security-policy");
  assert.ok(csp, "Content-Security-Policy header should be present");
  assert.ok(
    csp.includes("default-src 'none'"),
    "CSP should have default-src 'none'",
  );
  assert.ok(
    csp.includes("frame-ancestors 'none'"),
    "CSP should have frame-ancestors 'none'",
  );
  assert.ok(
    csp.includes("connect-src 'self'"),
    "CSP should allow connect-src 'self'",
  );
});

test("unauthenticated API endpoints return 401", async () => {
  const res = await call("/api/competitions");
  assert.equal(res.status, 401);
  assert.equal(res.json?.error, "Unauthorized");
});

test("Clerk proxy endpoint is accessible", async () => {
  const res = await call("/api/__clerk/v1/environment");
  // In production with dummy keys, this will proxy to Clerk and likely fail
  // but should not crash the server
  assert.ok(res.status === 200 || res.status === 401 || res.status === 502);
});
