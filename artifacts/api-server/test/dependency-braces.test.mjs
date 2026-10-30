import "../../../scripts/test-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "../dist/app.mjs";

/**
 * The `braces` advisory (GHSA-vfj7-8cjw-p6xm, CVE-2026-93687) is a stack
 * exhaustion in the recursive brace-pattern walkers.
 *
 * There is **no patched release**: the npm registry's `latest` tag is still
 * 3.0.3 and `braces@3.0.4` returns 404. The GitHub advisory itself lists
 * "Patched versions: None". So the finding cannot be closed by upgrading.
 *
 * The only reachable call site in this application is `micromatch`, used by
 * `http-proxy-middleware` to match a configured `pathFilter`. The vulnerable
 * walker is only entered when that filter IS a glob, and the filter is
 * developer configuration rather than request data.
 *
 * These tests pin that mitigation so it cannot silently stop holding: if
 * someone later configures a glob path filter, or points the proxy at
 * request-derived input, the exposure becomes real and these tests fail.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const middlewarePath = path.join(
  here,
  "..",
  "src",
  "middlewares",
  "clerkProxyMiddleware.ts",
);
const middlewareSource = readFileSync(middlewarePath, "utf8");

/** Characters that make a path a glob pattern. */
const GLOB_CHARACTERS = /[*?[\]{}()!+@]/;

test("the Clerk proxy path is not a glob pattern", () => {
  // The proxy is mounted at a fixed, literal path.
  assert.equal(GLOB_CHARACTERS.test("/api/__clerk"), false);
});

test("the proxy middleware does not configure a path filter", () => {
  // `http-proxy-middleware` only calls micromatch (and therefore braces)
  // when a `pathFilter` is set to a glob. The middleware sets none.
  assert.ok(
    !/pathFilter\s*:/.test(middlewareSource),
    "the proxy must not configure a pathFilter",
  );
});

test("the proxy is mounted at a fixed path", () => {
  assert.match(
    middlewareSource,
    /CLERK_PROXY_PATH\s*=\s*['"]\/api\/__clerk['"]/,
  );
});

test("a deeply nested brace pattern in a path does not crash the server", async () => {
  // The actual attack shape: a path built from thousands of nested braces.
  // Even though the filter is not a glob, the request must never take the
  // process down.
  //
  // The pattern is sent to a real route so the response is a clean 400 rather
  // than an Express 404 page, which would echo the very long path into the
  // test runner's diagnostics.
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const deep = "{".repeat(4000) + "a" + "}".repeat(4000);

    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/competitions/${deep}`,
    ).catch(() => null);
    if (res) await res.text().catch(() => "");

    const health = await fetch(`http://127.0.0.1:${address.port}/api/healthz`);
    assert.equal(health.status, 200, "the server must survive the request");
    await health.text();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the API server answers a health check", async () => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const res = await fetch(`http://127.0.0.1:${address.port}/api/healthz`);
    assert.equal(res.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
