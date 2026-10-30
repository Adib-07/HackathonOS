import "../../../scripts/test-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// This test imports the BUILT bundle (dist/app.mjs) with NO env vars set
// and asserts /api/healthz returns 200 {"status":"ok"}
// This proves the function boots without FUNCTION_INVOCATION_FAILED

test("smoke: built bundle imports and /api/healthz returns 200 without env", async () => {
  // Ensure no env vars that would trigger validation
  delete process.env.DATABASE_URL;
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.CLERK_PUBLISHABLE_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.NODE_ENV = "test";

  // Import the built bundle (not source)
  const bundlePath = resolve(__dirname, "../dist/app.mjs");
  const { default: app } = await import(bundlePath);

  await new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      fetch(`http://127.0.0.1:${port}/api/healthz`)
        .then((res) => {
          assert.equal(res.status, 200, "healthz should return 200");
          return res.json();
        })
        .then((json) => {
          assert.deepEqual(json, { status: "ok" }, "healthz should return {status:'ok'}");
          server.close(() => resolve());
        })
        .catch(reject);
    });
    server.on("error", reject);
  });
});

