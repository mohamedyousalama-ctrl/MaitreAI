// WO-3b unit tests — payment-session idempotency (flag-gated-OFF, branch-only).
//   • ACTIVE_STATUSES ↔ isSessionActive/isTerminalStatus consistency.
//   • Migration 0059 partial-index WHERE set === ACTIVE_STATUSES (drift guard —
//     single source, so the index predicate and the app can never diverge).
//   • decideSessionAction: (a) active→reuse, (b) paid→already_paid (no new),
//     (c) expired→create, (d) cross-tenant scoping → independent; + expiry refresh.
//   • markPaymentSessionPaid: transition to 'paid' twice → 2nd is a no-op.
//
// The DB partial-unique index enforces the true concurrency guarantee ("two
// concurrent creates → one session"); that belongs to an integration test
// against real Postgres. Here we unit-test the decision logic each request runs
// plus the atomic idempotent transition against a fake admin.
// Run: node --conditions=react-server --experimental-strip-types scripts/test-payment-idempotency.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACTIVE_STATUSES,
  EXPIRY_REFRESH_THRESHOLD_MS,
  isSessionActive,
  isTerminalStatus,
  decideSessionAction,
  decidePaidTransition,
} from "../lib/payments.ts";
import { markPaymentSessionPaid } from "../lib/payments/transitions.ts";

let pass = 0, fail = 0;
const eq = (n: string, actual: unknown, expected: unknown) => {
  if (actual === expected) pass++;
  else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
};
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const ALL_STATUSES = ["created", "link_sent", "opened", "paid", "failed", "expired", "cancelled", "refunded"] as const;
const NOW = 1_000_000_000_000; // fixed epoch ms (tests must not read the clock)
const row = (status: string, expiresAtMs: number | null = NOW + 10 * 60 * 1000) => ({ status, expiresAtMs } as { status: string; expiresAtMs: number | null });

// ── 1. ACTIVE_STATUSES ↔ isSessionActive / isTerminalStatus consistency ───────
eq("ACTIVE_STATUSES is exactly [created,link_sent,opened]", ACTIVE_STATUSES.join(","), "created,link_sent,opened");
for (const s of ALL_STATUSES) {
  const active = (["created", "link_sent", "opened"] as string[]).includes(s);
  eq(`isSessionActive(${s})`, isSessionActive(s as never), active);
  eq(`isTerminalStatus(${s}) = !active`, isTerminalStatus(s as never), !active);
}

// ── 2. Migration 0059 WHERE-set === ACTIVE_STATUSES (drift guard) ─────────────
{
  const sql = readFileSync(
    fileURLToPath(new URL("../supabase/migrations/0059_payment_session_idempotency.sql", import.meta.url)),
    "utf8"
  );
  const whereClause = /where\s+status\s+in\s*\(([^)]*)\)/i.exec(sql);
  ok("0059 has a `where status in (...)` predicate", !!whereClause);
  const found = [...(whereClause?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  const expected = [...ACTIVE_STATUSES].sort();
  eq("index predicate set === ACTIVE_STATUSES set", found.join(","), expected.join(","));
}

// ── 3. decideSessionAction — the per-request decision (a)–(d) ─────────────────
// (a) concurrent → one: a 2nd caller that sees the 1st's active session reuses it.
{
  const d = decideSessionAction([row("link_sent")], NOW);
  eq("(a) active present → reuse", d.action, "reuse");
  ok("(a) reuse not refreshed when >5min left", d.action === "reuse" && d.refreshExpiry === false);
}
// (b) after success → no new session.
{
  const d = decideSessionAction([row("paid", null)], NOW);
  eq("(b) paid present, no active → already_paid", d.action, "already_paid");
}
// (c) expired → new session allowed.
eq("(c) only expired → create", decideSessionAction([row("expired")], NOW).action, "create");
// (d) cross-tenant independence: caller scopes by restaurant_id, so the other
//     tenant's rows are simply not in the array → this tenant decides on its own.
eq("(d) empty (other tenant's order) → create", decideSessionAction([], NOW).action, "create");
ok("(d) same order_id, this tenant active → reuse (independent of other tenant)",
  decideSessionAction([row("link_sent")], NOW).action === "reuse");

// active precedence + refresh threshold
{
  const near = decideSessionAction([row("opened", NOW + 2 * 60 * 1000)], NOW); // 2min left < 5min
  ok("reuse with <5min left → refreshExpiry true", near.action === "reuse" && near.refreshExpiry === true);
}
ok("reuse with null expiry → no refresh (never-expiring)",
  (() => { const d = decideSessionAction([row("created", null)], NOW); return d.action === "reuse" && d.refreshExpiry === false; })());
eq("active wins even when a terminal row is newer", decideSessionAction([row("expired"), row("opened")], NOW).action, "reuse");
eq("paid wins over other terminals when no active", decideSessionAction([row("failed"), row("paid", null)], NOW).action, "already_paid");
eq("only failed/cancelled → create (retry allowed)", decideSessionAction([row("failed"), row("cancelled")], NOW).action, "create");
eq("EXPIRY_REFRESH_THRESHOLD_MS is 5 minutes", EXPIRY_REFRESH_THRESHOLD_MS, 5 * 60 * 1000);

// ── 4. decidePaidTransition — idempotent ──────────────────────────────────────
eq("paid → no change", decidePaidTransition("paid" as never).changed, false);
eq("link_sent → change", decidePaidTransition("link_sent" as never).changed, true);
eq("created → change", decidePaidTransition("created" as never).changed, true);
eq("expired → change (late webhook can still settle)", decidePaidTransition("expired" as never).changed, true);

// ── 5. markPaymentSessionPaid — transition to paid TWICE → 2nd is a no-op ─────
// Minimal fake admin modelling: update(patch).eq().neq().select() applies the
// patch to rows matching ALL conds and returns the affected ids (mirrors the
// atomic `... WHERE id=? AND status<>'paid'` guard).
function makeFakeAdmin(initial: Array<{ id: string; status: string }>) {
  const rows = initial.map((r) => ({ ...r }));
  const admin = {
    _rows: rows,
    from() {
      return {
        update(patch: Record<string, unknown>) {
          const conds: Array<[string, string, unknown]> = [];
          const builder = {
            eq(c: string, v: unknown) { conds.push(["eq", c, v]); return builder; },
            neq(c: string, v: unknown) { conds.push(["neq", c, v]); return builder; },
            select() {
              const matched = rows.filter((r) =>
                conds.every(([op, c, v]) => (op === "eq" ? (r as Record<string, unknown>)[c] === v : (r as Record<string, unknown>)[c] !== v))
              );
              matched.forEach((r) => Object.assign(r, patch));
              return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
            },
          };
          return builder;
        },
      };
    },
  };
  return admin;
}

await (async () => {
  const admin = makeFakeAdmin([{ id: "s1", status: "link_sent" }]);
  const r1 = await markPaymentSessionPaid(admin as never, "s1");
  ok("1st markPaid → changed true", r1.changed === true);
  eq("row is now paid", admin._rows[0].status, "paid");
  const r2 = await markPaymentSessionPaid(admin as never, "s1");
  ok("2nd markPaid (already paid) → no-op (changed false)", r2.changed === false);
  eq("row stays paid (unchanged)", admin._rows[0].status, "paid");
  const r3 = await markPaymentSessionPaid(admin as never, "missing");
  ok("markPaid on missing session → changed false", r3.changed === false);

  console.log(`\nPAYMENT-IDEMPOTENCY UNIT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
