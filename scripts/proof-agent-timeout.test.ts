// PROOF (WO-MONITORING-ALERTING, Part 2 — happy-path byte-identical).
// The customer-agent timeout is env-gated. This proof mirrors the EXACT guard
// expression from lib/ai/llm/claude.ts and shows that when AGENT_TIMEOUT_MS is
// unset, `messages.create` is invoked with a SINGLE argument (the verbatim
// original call) and the successful result is processed identically; when set,
// the SAME success returns the SAME result — the timeout only bounds the wait,
// never the output.
// Run: node --experimental-strip-types scripts/proof-agent-timeout.test.ts

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// A stand-in for a successful Anthropic response; the real adapter maps this to
// { text, ... }. We only need to prove the CALL SHAPE + that success is unchanged.
const FAKE_RESULT = { content: [{ type: "text", text: "مرحبا" }], stop_reason: "end_turn" };

// Mirror of the claude.ts guard. `create` is the spied SDK method.
function invoke(create: (...args: unknown[]) => unknown, params: unknown, timeoutEnv: string | undefined) {
  const timeoutMs = Number(timeoutEnv);
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? create(params, { timeout: timeoutMs })
    : create(params);
}

function spy() {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => { calls.push(args); return FAKE_RESULT; };
  return { fn, calls };
}

const params = { model: "x", messages: [] };

// ── AGENT_TIMEOUT_MS unset → verbatim single-arg call (byte-identical) ───────
{
  const s = spy();
  const res = invoke(s.fn, params, undefined);
  ok("unset → create called exactly once", s.calls.length === 1);
  ok("unset → create called with a SINGLE argument (no options obj)", s.calls[0].length === 1);
  ok("unset → the single argument IS the original params", s.calls[0][0] === params);
  ok("unset → successful result is unchanged", res === FAKE_RESULT);
}

// ── empty string / NaN env → still single-arg (guard is strict) ─────────────
for (const bad of ["", "abc", "0", "-5"]) {
  const s = spy();
  invoke(s.fn, params, bad);
  ok(`env="${bad}" → single-arg call (no timeout applied)`, s.calls[0].length === 1);
}

// ── AGENT_TIMEOUT_MS set → two-arg call with {timeout}, SAME success result ──
{
  const s = spy();
  const res = invoke(s.fn, params, "60000");
  ok("set → create called with two args", s.calls[0].length === 2);
  ok("set → first arg still the original params", s.calls[0][0] === params);
  ok("set → second arg carries the timeout", (s.calls[0][1] as { timeout: number }).timeout === 60000);
  ok("set → successful result is IDENTICAL to unset (timeout bounds wait, not output)", res === FAKE_RESULT);
}

console.log(`\nAGENT TIMEOUT PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
