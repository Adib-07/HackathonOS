import "../../../scripts/test-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createWindowLimiter } from "../src/lib/intel/rate-limit.ts";

test("a limiter allows calls up to its limit and then refuses", () => {
  const limiter = createWindowLimiter(3, 60_000, () => 1000);
  assert.equal(limiter.allow(), true);
  assert.equal(limiter.allow(), true);
  assert.equal(limiter.allow(), true);
  assert.equal(limiter.allow(), false, "the fourth call must be refused");
  assert.equal(limiter.size(), 3);
});

test("calls inside the window age out", () => {
  let clock = 1000;
  const limiter = createWindowLimiter(2, 1000, () => clock);

  assert.equal(limiter.allow(), true);
  assert.equal(limiter.allow(), true);
  assert.equal(limiter.allow(), false, "the limit applies inside the window");

  // Move past the window: the previous calls no longer count.
  clock = 2100;
  assert.equal(limiter.allow(), true, "the window must reopen");
  assert.equal(
    limiter.allow(),
    true,
    "the reopened window allows the limit again",
  );
  assert.equal(limiter.allow(), false, "and then refuses again");
});

test("a limiter with no calls reports no wait", () => {
  const limiter = createWindowLimiter(5, 60_000, () => 1000);
  assert.equal(limiter.size(), 0);
  assert.equal(limiter.retryAfterMs(), 0);
});

test("the retry hint shrinks as the window ages", () => {
  let clock = 1000;
  const limiter = createWindowLimiter(5, 60_000, () => clock);
  limiter.allow();
  assert.equal(limiter.retryAfterMs(), 60_000);

  clock = 31_000;
  assert.equal(limiter.retryAfterMs(), 30_000);
});

test("the research and AI limits are the documented ones", () => {
  // The limits themselves are asserted in the route module, so a change to
  // either has to be deliberate.
  const research = createWindowLimiter(8, 60_000, () => 1000);
  for (let index = 0; index < 8; index += 1) {
    assert.equal(research.allow(), true, `call ${index + 1} must be allowed`);
  }
  assert.equal(
    research.allow(),
    false,
    "the ninth research call must be refused",
  );

  const ai = createWindowLimiter(12, 60_000, () => 1000);
  for (let index = 0; index < 12; index += 1) {
    assert.equal(ai.allow(), true, `call ${index + 1} must be allowed`);
  }
  assert.equal(ai.allow(), false, "the thirteenth AI call must be refused");
});
