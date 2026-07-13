// ============================================================================
// WO-REALTIME-AUTH-REFRESH — red-first proof. The console's Supabase realtime socket
// dies ~20–40 min in because (1) a refreshed JWT is never pushed to the socket and
// (2) a dropped channel only console.warns — it never actively rebuilds. This proof
// drives the two fixes through their PURE, injectable orchestrators so the exact
// status/timing sequences are deterministic:
//   PART 1  shouldPropagateAuth() names the auth events that must call realtime.setAuth.
//   PART 2  createReloadingSubscription() rebuilds a dropped channel with exponential
//           backoff (cap 30s) and reconnect-reloads on (re)SUBSCRIBED.
//   BINDING (Refinement 2) the closedByUs guard DISCRIMINATES: our own teardown's CLOSED
//           schedules ZERO rebuild (no zombie reconnects on unmount), a GENUINE CLOSED
//           schedules one — proven both ways, same status, opposite outcome.
//   CONTROL the OLD warn-only model never reschedules → the socket stays dead (the bug).
// Run: node --experimental-strip-types scripts/proof-realtime-auth-refresh.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  shouldPropagateAuth, backoffDelay, isTerminalStatus, isRealtimeResubscribeEnabled,
  createReloadingSubscription, subscribeWithReload,
  type ChannelStatus, type ReloadingDeps,
} from "../lib/realtime/resubscribe.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// --- PART 1: shouldPropagateAuth — only events that carry a fresh token ----------------
check("PART1: TOKEN_REFRESHED propagates (the event that fixes the live bug)", shouldPropagateAuth("TOKEN_REFRESHED") === true);
check("PART1: SIGNED_IN propagates (authed from first paint)", shouldPropagateAuth("SIGNED_IN") === true);
check("PART1: INITIAL_SESSION propagates", shouldPropagateAuth("INITIAL_SESSION") === true);
check("PART1: SIGNED_OUT does NOT propagate (no token)", shouldPropagateAuth("SIGNED_OUT") === false);
check("PART1: USER_UPDATED does NOT propagate", shouldPropagateAuth("USER_UPDATED") === false);
check("PART1: PASSWORD_RECOVERY does NOT propagate", shouldPropagateAuth("PASSWORD_RECOVERY") === false);

// --- PART 2: backoffDelay — 1s,2s,4s… capped at 30s -----------------------------------
check("backoff attempt 0 = 1000ms", backoffDelay(0) === 1000);
check("backoff attempt 1 = 2000ms", backoffDelay(1) === 2000);
check("backoff attempt 2 = 4000ms", backoffDelay(2) === 4000);
check("backoff attempt 5 = 30000ms (32000 capped)", backoffDelay(5) === 30000);
check("backoff attempt 10 stays capped at 30000ms", backoffDelay(10) === 30000);
check("backoff clamps negative attempt to the base", backoffDelay(-3) === 1000);
check("isTerminalStatus: CLOSED/ERROR/TIMED_OUT terminal, SUBSCRIBED not",
  isTerminalStatus("CLOSED") && isTerminalStatus("CHANNEL_ERROR") && isTerminalStatus("TIMED_OUT") && !isTerminalStatus("SUBSCRIBED"));

// --- PART 2 orchestrator harness: injectable channel + timer, no jitter ---------------
function makeHarness() {
  let onStatus: ((s: ChannelStatus) => void) | null = null;
  let openCount = 0, onChangeCount = 0;
  const scheduled: Array<{ ms: number; fn: () => void }> = [];
  const deps: ReloadingDeps = {
    open: (cb) => {
      openCount++;
      onStatus = cb;
      // A real removeChannel makes supabase-js emit CLOSED — model that here so the
      // closedByUs guard is exercised exactly as in production.
      return () => { cb("CLOSED"); };
    },
    onChange: () => { onChangeCount++; },
    schedule: (ms, fn) => {
      const entry = { ms, fn };
      scheduled.push(entry);
      return () => { const i = scheduled.indexOf(entry); if (i >= 0) scheduled.splice(i, 1); };
    },
    jitter: () => 0, // deterministic
  };
  return {
    deps, scheduled,
    emit: (s: ChannelStatus) => onStatus?.(s),
    openCount: () => openCount,
    onChangeCount: () => onChangeCount,
    runNext: () => { const e = scheduled.shift(); e?.fn(); },
  };
}

// (re)SUBSCRIBED reconnect-reloads and resets the backoff ladder ------------------------
{
  const h = makeHarness();
  const dispose = createReloadingSubscription(h.deps);
  check("orchestrator connects once on start", h.openCount() === 1);
  h.emit("SUBSCRIBED");
  check("SUBSCRIBED fires onChange (reconnect-reload guardrail)", h.onChangeCount() === 1);
  check("SUBSCRIBED schedules NO rebuild", h.scheduled.length === 0);
  dispose();
}

// A terminal drop schedules a rebuild at backoffDelay(0), and the backoff GROWS --------
{
  const h = makeHarness();
  const dispose = createReloadingSubscription(h.deps);
  h.emit("CHANNEL_ERROR");
  check("a genuine drop schedules a rebuild", h.scheduled.length === 1);
  check("first rebuild waits backoffDelay(0)=1000ms (jitter 0)", h.scheduled[0].ms === 1000);
  h.runNext();
  check("running the scheduled rebuild reconnects (opens a fresh channel)", h.openCount() === 2);
  h.emit("TIMED_OUT");
  check("second consecutive drop backs off to 2000ms (ladder advanced)", h.scheduled[0].ms === 2000);
  dispose();
}

// SUBSCRIBED between drops RESETS the ladder back to 1000ms -----------------------------
{
  const h = makeHarness();
  const dispose = createReloadingSubscription(h.deps);
  h.emit("CHANNEL_ERROR");        // attempt 0 → 1000, ladder→1
  h.runNext();                    // reconnect
  h.emit("SUBSCRIBED");           // recovered → reset ladder to 0
  h.emit("CHANNEL_ERROR");        // attempt 0 again → 1000
  check("a recovery (SUBSCRIBED) resets the backoff ladder to 1000ms", h.scheduled[0].ms === 1000);
  dispose();
}

// --- BINDING (Refinement 2): the closedByUs guard discriminates ------------------------
// (a) cleanup/unmount → our teardown emits CLOSED → ZERO rebuild (no zombie reconnect).
{
  const h = makeHarness();
  const dispose = createReloadingSubscription(h.deps);
  h.emit("SUBSCRIBED");
  check("(2a) pre-dispose: no rebuild pending", h.scheduled.length === 0);
  dispose(); // sets closedByUs, cancels pending, tears down → fake emits CLOSED
  check("(2a) unmount's own CLOSED schedules ZERO rebuild (no zombie reconnect)", h.scheduled.length === 0);
  h.emit("CLOSED"); // any late CLOSED after unmount is still ignored
  check("(2a) a late CLOSED after unmount is still ignored", h.scheduled.length === 0);
}
// (b) a GENUINE CLOSED (channel still mounted) → a rebuild IS scheduled.
{
  const h = makeHarness();
  const dispose = createReloadingSubscription(h.deps);
  h.emit("SUBSCRIBED");
  h.emit("CLOSED"); // a real drop, NOT our teardown
  check("(2b) a genuine CLOSED (same status) DOES schedule a rebuild", h.scheduled.length === 1);
  dispose();
}

// --- CONTROL: the OLD warn-only model never reschedules → the socket stays dead --------
{
  // The pre-WO branch: SUBSCRIBED→reload, terminal→console.warn ONLY (no rebuild).
  const legacy = { reloads: 0, warns: 0, rebuilds: 0 };
  const legacyHandle = (status: ChannelStatus) => {
    if (status === "SUBSCRIBED") legacy.reloads++;
    else if (isTerminalStatus(status)) legacy.warns++; // ← never schedules a rebuild
  };
  legacyHandle("CLOSED");
  legacyHandle("CHANNEL_ERROR");
  check("CONTROL: the OLD model only warns on a drop", legacy.warns === 2);
  check("CONTROL: the OLD model NEVER rebuilds → the socket stays dead (the real bug)", legacy.rebuilds === 0);

  // The NEW orchestrator, same two drops, DOES rebuild — the red→green contrast.
  const h = makeHarness();
  const dispose = createReloadingSubscription(h.deps);
  h.emit("SUBSCRIBED");
  h.emit("CLOSED");
  check("NEW model: where the OLD stayed dead, the new schedules a rebuild", h.scheduled.length === 1);
  dispose();
}

// --- subscribeWithReload glue (flag-ON default in the test env) ------------------------
{
  let subCb: ((s: string) => void) | null = null;
  const removed: unknown[] = [];
  const chan: Record<string, unknown> = {};
  chan.on = () => chan;
  chan.subscribe = (cb?: (s: string) => void) => { subCb = cb ?? null; return chan; };
  const s = {
    channel: (_n: string) => chan,
    removeChannel: (ch: unknown) => { removed.push(ch); },
  };
  let changes = 0;
  check("flag is ON by default (no explicit 'false' in the env)", isRealtimeResubscribeEnabled() === true);
  const dispose = subscribeWithReload(s as never, {
    channelName: "conv-x", bind: (ch) => ch, onChange: () => { changes++; }, label: "conversations",
  });
  subCb?.("SUBSCRIBED");
  check("subscribeWithReload wires reconnect-reload (onChange on SUBSCRIBED)", changes === 1);
  dispose();
  check("subscribeWithReload's dispose removes the channel", removed.length === 1);
}

// --- wiring (source): PART 1 setAuth + all 8 sites on the shared helper ----------------
const boot = read("components/DataBootstrap.tsx");
check("(PART1) DataBootstrap registers onAuthStateChange", /onAuthStateChange\(/.test(boot));
check("(PART1) DataBootstrap pushes the refreshed token to the socket via realtime.setAuth", /\.realtime\.setAuth\(token\)/.test(boot));
check("(PART1) DataBootstrap gates setAuth on shouldPropagateAuth", /shouldPropagateAuth\(event\)/.test(boot));
check("(PART1) DataBootstrap unsubscribes the auth listener on unmount", /authSub\?\.data\.subscription\.unsubscribe\(\)/.test(boot));
check("(PART1) setAuth is UNCONDITIONAL — not gated by the resubscribe kill-switch",
  !/REALTIME_RESUBSCRIBE|isRealtimeResubscribeEnabled/.test(boot));

const SITES: Array<[string, string]> = [
  ["lib/db/conversations.ts", "conversations"],
  ["lib/db/restaurant-settings.ts", "restaurants"],
  ["lib/db/orders.ts", "orders"],
  ["lib/db/brain.ts", "brain"],
  ["lib/db/members-realtime.ts", "members"],
  ["lib/db/dispatch-realtime.ts", "dispatch"],
  ["lib/db/cod-realtime.ts", "cod"],
  ["lib/db/payments.ts", "payments"],
];
for (const [file, label] of SITES) {
  const src = read(file);
  check(`(site) ${label} routes through subscribeWithReload`, /subscribeWithReload\(s, \{/.test(src));
  check(`(site) ${label} no longer hand-rolls its own \.subscribe\(status\)`, !/\.subscribe\(\(status\)/.test(src));
}
const pay = read("lib/db/payments.ts");
check("(site) payments preserves its silent legacy shape via legacyMode 'bare'", /legacyMode: "bare"/.test(pay));

// The kill-switch flag is documented in the house registry (feature-flags.ts) ----------
const flags = read("lib/feature-flags.ts");
check("(flag) REALTIME_RESUBSCRIBE is a default-ON kill-switch (!== 'false')",
  /REALTIME_RESUBSCRIBE\s*=\s*\n?\s*process\.env\.NEXT_PUBLIC_REALTIME_RESUBSCRIBE !== "false"/.test(flags));

console.log(`\nREALTIME-AUTH-REFRESH PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
