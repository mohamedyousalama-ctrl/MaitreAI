// ============================================================================
// MaitreAI — retry-policy unit tests (Bug #2)
// Run: node --experimental-strip-types --test lib/messaging/retry-policy.test.ts
// Pure (no server/IO deps), so it runs without the Next bundler.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { shouldRetry, retrySend } from "./retry-policy.ts";
import type { SendResult } from "./types.ts";

const fail = (error: string, errorCode?: number): SendResult => ({
  ok: false, channel: "whatsapp", to: "x", status: "failed", error, errorCode,
});
const ok = (): SendResult => ({ ok: true, channel: "whatsapp", to: "x", status: "sent", externalMessageId: "wamid.1" });
const noSleep = async () => {};

test("shouldRetry — TRANSIENT (retryable)", () => {
  assert.equal(shouldRetry(fail("WhatsApp API 429")), true, "429 rate limit");
  assert.equal(shouldRetry(fail("WhatsApp API 500")), true, "500 upstream");
  assert.equal(shouldRetry(fail("WhatsApp API 503")), true, "503 upstream");
  assert.equal(shouldRetry(fail("WhatsApp API 408")), true, "408 timeout");
  assert.equal(shouldRetry(fail("network error")), true, "thrown network error");
  // transient Meta codes even on a 4xx:
  assert.equal(shouldRetry(fail("WhatsApp API 400 (#130429): rate limit", 130429)), true, "130429 throughput");
  assert.equal(shouldRetry(fail("WhatsApp API 400 (#131056): pair rate limit", 131056)), true, "131056 pair rate limit");
  assert.equal(shouldRetry(fail("WhatsApp API 500 (#131000)", 131000)), true, "131000 transient");
});

test("shouldRetry — STRUCTURAL (NOT retryable)", () => {
  assert.equal(shouldRetry(fail("WhatsApp API 400 (#100): Invalid parameter", 100)), false, "400 invalid payload");
  assert.equal(shouldRetry(fail("WhatsApp API 401 (#190): access token expired", 190)), false, "401 token expired");
  assert.equal(shouldRetry(fail("WhatsApp API 403 (#200)", 200)), false, "403 permission");
  assert.equal(shouldRetry(fail("WhatsApp API 400 (#131047): re-engagement / 24h window", 131047)), false, "24h re-engagement window");
  assert.equal(shouldRetry(ok()), false, "a success never retries");
});

test("retrySend — transient failure RETRIES then SUCCEEDS (bounded)", async () => {
  let calls = 0;
  const { result, attempts } = await retrySend(async () => {
    calls++;
    return calls < 3 ? fail("WhatsApp API 500") : ok();
  }, 2, noSleep);
  assert.equal(result.ok, true, "eventually delivered");
  assert.equal(calls, 3, "two retries then success");
  assert.equal(attempts, 3);
});

test("retrySend — structural 400 does NOT spin (one attempt, honest fail)", async () => {
  let calls = 0;
  const { result, attempts } = await retrySend(async () => {
    calls++;
    return fail("WhatsApp API 400 (#100): Invalid parameter", 100);
  }, 2, noSleep);
  assert.equal(result.ok, false, "stays failed (honest)");
  assert.equal(calls, 1, "no retry spin on a structural 400");
  assert.equal(attempts, 1);
});

test("retrySend — transient that never recovers is BOUNDED (no infinite loop)", async () => {
  let calls = 0;
  const { result, attempts } = await retrySend(async () => {
    calls++;
    return fail("WhatsApp API 503");
  }, 2, noSleep);
  assert.equal(result.ok, false);
  assert.equal(calls, 3, "exactly retries+1 attempts, then stops");
  assert.equal(attempts, 3);
});
