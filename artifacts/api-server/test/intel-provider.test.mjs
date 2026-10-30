import "../../scripts/test-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  OpenAiProvider,
  createAiProviderFromEnv,
  describeMissingConfiguration,
  parseJsonObject,
} from "../src/lib/intel/openai-provider.ts";
import { AiError } from "../src/lib/intel/ai-types.ts";

/** Replace global fetch for the duration of a test. */
function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return run();
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("no provider is created without an API key", () => {
  assert.equal(createAiProviderFromEnv({}), null);
  assert.equal(createAiProviderFromEnv({ OPENAI_API_KEY: "  " }), null);
});

test("a provider is created when the key is present", () => {
  const provider = createAiProviderFromEnv({
    OPENAI_API_KEY: "sk-test-value",
    OPENAI_MODEL: "custom-model",
  });
  assert.ok(provider);
  assert.equal(provider.id, "openai");
  assert.equal(provider.model, "custom-model");
  assert.equal(provider.available, true);
});

test("the missing configuration is reported by name only", () => {
  const missing = describeMissingConfiguration({});
  assert.deepEqual(missing, ["OPENAI_API_KEY"]);
  // The value must never appear in a report.
  assert.ok(!missing.join(",").includes("sk-"));
});

test("a successful completion returns parsed JSON", async () => {
  const provider = new OpenAiProvider({ apiKey: "sk-test-value" });

  const result = await withFetch(
    async () =>
      jsonResponse(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      ),
    () =>
      provider.completeJson({
        system: "s",
        user: "u",
        purpose: "test",
      }),
  );

  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.provider, "openai");
});

test("the API key is sent in the header and never in the body", async () => {
  const provider = new OpenAiProvider({ apiKey: "sk-test-value" });
  let seenUrl = "";
  let seenBody = "";
  let seenAuth = "";

  await withFetch(
    async (_url, init) => {
      seenUrl = String(_url);
      seenBody = String(init?.body ?? "");
      seenAuth = String(
        (init?.headers ?? {})["authorization"] ?? "",
      );
      return jsonResponse(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
      );
    },
    () =>
      provider.completeJson({ system: "s", user: "u", purpose: "test" }),
  );

  assert.equal(seenAuth, "Bearer sk-test-value");
  assert.ok(!seenBody.includes("sk-test-value"));
  assert.ok(seenUrl.endsWith("/chat/completions"));
});

test("a timeout is reported as a timeout, not a generic failure", async () => {
  const provider = new OpenAiProvider({ apiKey: "sk-test-value" });

  await assert.rejects(
    withFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
      () =>
        provider.completeJson({
          system: "s",
          user: "u",
          purpose: "test",
          timeoutMs: 10,
        }),
    ),
    (error) => error instanceof AiError && error.kind === "TIMEOUT",
  );
});

test("rate limiting is reported as rate limiting", async () => {
  const provider = new OpenAiProvider({ apiKey: "sk-test-value" });

  await assert.rejects(
    withFetch(
      async () => jsonResponse("{}", 429),
      () =>
        provider.completeJson({ system: "s", user: "u", purpose: "test" }),
    ),
    (error) => error instanceof AiError && error.kind === "RATE_LIMITED",
  );
});

test("a malformed response is reported as malformed output", async () => {
  const provider = new OpenAiProvider({ apiKey: "sk-test-value" });

  await assert.rejects(
    withFetch(
      async () => jsonResponse("not json at all"),
      () =>
        provider.completeJson({ system: "s", user: "u", purpose: "test" }),
    ),
    (error) => error instanceof AiError && error.kind === "MALFORMED_OUTPUT",
  );
});

test("an upstream error never leaks a credential", async () => {
  const provider = new OpenAiProvider({ apiKey: "sk-test-value" });

  const error = await withFetch(
    async () =>
      jsonResponse(
        JSON.stringify({
          error: {
            message:
              "Invalid api key sk-live-supersecret123456 provided. Bearer sk-live-supersecret123456",
          },
        }),
        401,
      ),
    () =>
      provider
        .completeJson({ system: "s", user: "u", purpose: "test" })
        .catch((caught) => caught),
  );

  assert.ok(error instanceof AiError);
  assert.equal(error.kind, "UPSTREAM_ERROR");
  assert.ok(!error.detail.includes("sk-live-supersecret123456"));
  assert.match(error.detail, /\[redacted\]/);
});

test("a network failure is reported without leaking internals", async () => {
  const provider = new OpenAiProvider({ apiKey: "sk-test-value" });

  await assert.rejects(
    withFetch(
      async () => {
        throw new Error("ECONNREFUSED 10.0.0.1:443");
      },
      () =>
        provider.completeJson({ system: "s", user: "u", purpose: "test" }),
    ),
    (error) =>
      error instanceof AiError &&
      error.kind === "UPSTREAM_ERROR" &&
      !error.detail.includes("10.0.0.1"),
  );
});

test("a JSON array is not accepted as a completion", () => {
  assert.throws(
    () => parseJsonObject("[1,2,3]"),
    (error) => error instanceof AiError && error.kind === "MALFORMED_OUTPUT",
  );
});
