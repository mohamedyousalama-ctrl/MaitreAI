// ============================================================================
// KIV-38 / D1 — the Problem path must never render as success.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-delivery-problem-path.test.ts
//
// Proves three things:
//   A. delivered / failed / cancelled / expired are now DISTINCT states, and
//      success semantics (green tone, ✅, success flag) attach to `delivered`
//      ALONE — the exact regression KIV-36 blocked on.
//   B. Gating is bit-for-bit unchanged: `driverTerminalState(d) !== "active"` is
//      exhaustively equivalent to the untouched `isExpired(d)`, so status
//      transitions, location pushes and reassignment/recovery behave identically.
//   C. Both render sites (server page + client island) are actually wired to the
//      shared module and no longer carry the old one-size-fits-all success shell.
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  driverTerminalState,
  driverTerminalPanel,
  type DriverTerminalState,
} from "../lib/delivery/driver-terminal-state.ts";
import { isExpired } from "../lib/db/delivery.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};
const ok = (n: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ❌ ${n}: expected true`); } };

const FUTURE = new Date(Date.now() + 3_600_000).toISOString();
const PAST = new Date(Date.now() - 3_600_000).toISOString();

// ══ A. States are distinct, and success belongs to `delivered` alone ═════════
{
  eq("delivered → delivered", driverTerminalState({ status: "delivered", expires_at: FUTURE }), "delivered");
  eq("failed → failed (NOT delivered)", driverTerminalState({ status: "failed", expires_at: FUTURE }), "failed");
  eq("cancelled → cancelled", driverTerminalState({ status: "cancelled", expires_at: FUTURE }), "cancelled");
  eq("in-progress + live link → active", driverTerminalState({ status: "on_the_way", expires_at: FUTURE }), "active");
  eq("in-progress + timed-out link → expired", driverTerminalState({ status: "on_the_way", expires_at: PAST }), "expired");
  eq("assigned + no expiry → active", driverTerminalState({ status: "assigned" }), "active");

  // THE REGRESSION. Before this fix, `failed` fell into the same terminal shell
  // as `delivered` and was rendered «تم إنهاء هذا التوصيل ✅» in green.
  const failed = driverTerminalPanel("failed")!;
  ok("failed panel exists", !!failed);
  eq("failed is NOT success", failed.success, false);
  eq("failed tone is problem (never success/green)", failed.tone, "problem");
  ok("failed title carries NO success checkmark", !failed.title.includes("✅"));
  ok("failed body carries NO success checkmark", !failed.body.includes("✅"));
  ok("failed says the problem was recorded", failed.title.includes("مشكلة") || failed.body.includes("المشكلة"));
  ok("failed states the delivery was NOT completed", failed.body.includes("لم يتم إتمام"));
  ok("failed never claims success wording «بنجاح»", !failed.title.includes("بنجاح") && !failed.body.includes("بنجاح"));

  const delivered = driverTerminalPanel("delivered")!;
  eq("delivered IS success", delivered.success, true);
  eq("delivered tone is success", delivered.tone, "success");
  ok("delivered keeps a clear success marker", delivered.title.includes("✅"));

  const cancelled = driverTerminalPanel("cancelled")!;
  eq("cancelled is NOT success", cancelled.success, false);
  ok("cancelled is semantically distinct from failed", cancelled.title !== failed.title);
  ok("cancelled says cancelled", cancelled.title.includes("إلغاء"));

  const expired = driverTerminalPanel("expired")!;
  eq("expired is NOT success", expired.success, false);
  ok("expired is distinct from delivered", expired.title !== delivered.title);
  ok("expired never claims the delivery completed", !expired.title.includes("✅") && !expired.body.includes("تم التوصيل"));

  eq("active renders no terminal panel at all", driverTerminalPanel("active"), null);

  // Every non-active state must have its own wording — no two share a title.
  const states: DriverTerminalState[] = ["delivered", "failed", "cancelled", "expired"];
  const titles = states.map((s) => driverTerminalPanel(s)!.title);
  eq("all four terminal states have DISTINCT titles", new Set(titles).size, 4);
  eq("exactly ONE terminal state carries success semantics",
    states.filter((s) => driverTerminalPanel(s)!.success).length, 1);
  eq("…and it is delivered",
    states.find((s) => driverTerminalPanel(s)!.success), "delivered");
}

// ══ B. Gating unchanged — exhaustive equivalence with the untouched isExpired ═
{
  const statuses = ["pending", "assigned", "picked_up", "on_the_way", "delivered", "failed", "cancelled", "", undefined];
  const expiries = [FUTURE, PAST, null, undefined];
  let checked = 0, mismatches = 0;
  for (const status of statuses) {
    for (const expires_at of expiries) {
      const d = { status, expires_at } as { status?: string; expires_at?: string | null };
      const inactive = driverTerminalState(d) !== "active";
      if (inactive !== isExpired(d)) {
        mismatches++;
        console.log(`  ❌ gating drift for status=${JSON.stringify(status)} expires_at=${JSON.stringify(expires_at)}`);
      }
      checked++;
    }
  }
  eq("all status × expiry combinations checked", checked, statuses.length * expiries.length);
  eq("ZERO gating drift vs isExpired (recovery/transitions/location unchanged)", mismatches, 0);

  // Recovery: assignDriver puts a failed delivery back to `assigned` with a fresh
  // expiry. That row must become actionable again, exactly as before.
  eq("reassigned (failed → assigned + fresh expiry) is ACTIVE again",
    driverTerminalState({ status: "assigned", expires_at: FUTURE }), "active");
  eq("…and renders no terminal panel", driverTerminalPanel(driverTerminalState({ status: "assigned", expires_at: FUTURE })), null);

  // Status outranks the clock: a reported problem stays a problem even after the
  // link times out — the driver must never be shown a different outcome later.
  eq("failed + timed-out link is still `failed`, not `expired`",
    driverTerminalState({ status: "failed", expires_at: PAST }), "failed");
  eq("delivered + timed-out link is still `delivered`",
    driverTerminalState({ status: "delivered", expires_at: PAST }), "delivered");
}

// ══ C. Both render sites are wired to the shared module ═════════════════════
{
  const page = read("app/d/[token]/page.tsx");
  ok("server page imports the shared terminal-state module",
    /from "@\/lib\/delivery\/driver-terminal-state"/.test(page));
  ok("server page renders the state-specific panel", /driverTerminalPanel\(/.test(page));
  ok("server page no longer hardcodes the one-size-fits-all success shell",
    !page.includes("تم إنهاء هذا التوصيل ✅"));
  ok("server page no longer hardcodes the green success frame for every terminal state",
    !/border-\[#cde3d4\] bg-\[#f0f7f2\]/.test(page));

  const client = read("app/d/[token]/DriverClient.tsx");
  ok("client island imports the shared terminal-state module",
    /from "@\/lib\/delivery\/driver-terminal-state"/.test(client));
  ok("client island no longer early-returns on a bare delivered check",
    !/if \(status === "delivered"\) \{/.test(client));
  ok("client island gates the checkmark icon on the success flag",
    /panel\.success \? CheckCircle2 : AlertTriangle/.test(client));
  ok("client island surfaces a failed status POST instead of silently re-enabling",
    /setPostErr\(/.test(client) && /postErr &&/.test(client));

  // The gate itself must NOT have been touched — this remediation is presentation-only.
  const db = read("lib/db/delivery.ts");
  ok("isExpired still treats failed/cancelled/delivered as terminal (gate untouched)",
    /d\.status === "delivered" \|\| d\.status === "cancelled" \|\| d\.status === "failed"/.test(db));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} delivery problem-path (D1): ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
