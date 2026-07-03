// ============================================================================
// R3 proof harness — handoff API (board GET + POS stamp verified + print-audit).
// Pure bucketing (bucketHandoffBoard) exercised directly; source assertions
// confirm the board route mirrors the POS eligibility set and excludes only true
// test orders, the POS stamp route is verified (atomic + eligibility-gated +
// audited), and the print-audit route is tenant-scoped + audited.
//
// Run: node --experimental-strip-types scripts/proof-r3-handoff-api.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bucketHandoffBoard, type HandoffOrder } from "../lib/handoff/board.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const mk = (id: string, pos: string): HandoffOrder => ({
  id, order_number: id, order_status: "paid", pos_status: pos as HandoffOrder["pos_status"],
  pos_reference: null, pos_entered_by: null, pos_entered_at: null, total: 100, created_at: "2026-01-01",
});

// ---- Bucketing --------------------------------------------------------------
{
  const b = bucketHandoffBoard([mk("a", "not_entered"), mk("b", "entered"), mk("c", "sent_to_kitchen"), mk("d", "not_entered")]);
  check("buckets by pos_status", b.not_entered.length === 2 && b.entered.length === 1 && b.sent_to_kitchen.length === 1);
  check("counts match bucket sizes", b.counts.not_entered === 2 && b.counts.entered === 1 && b.counts.sent_to_kitchen === 1);
  check("preserves input order within a bucket", b.not_entered[0].id === "a" && b.not_entered[1].id === "d");
}
{
  const b = bucketHandoffBoard([]);
  check("empty input → empty board, zero counts", b.not_entered.length === 0 && b.counts.entered === 0);
}
{
  // fail-safe: an unknown pos_status surfaces in the not_entered warning bucket.
  const b = bucketHandoffBoard([mk("x", "weird_state")]);
  check("unknown pos_status → not_entered (fail-safe, never vanishes)", b.not_entered.length === 1 && b.counts.not_entered === 1);
}

// ---- Board route: eligibility mirrors POS + excludes only true tests --------
const board = read("app/api/handoff/board/route.ts");
check("board mirrors POS eligibility allowlist",
  /POS_ELIGIBLE_STATUS = \["paid", "preparing", "ready", "out_for_delivery", "delivered"\]/.test(board));
check("board excludes ONLY genuine test orders (keeps null/false)", /\.not\("is_test", "is", true\)/.test(board));
check("board is tenant-scoped", board.includes('.eq("restaurant_id", tenant.restaurantId)'));
check("board is read-only (no update/insert)", !/\.update\(|\.insert\(/.test(board));

// ---- POS stamp route: VERIFIED (atomic + eligibility + audit) --------------
const pos = read("app/api/orders/[id]/pos/route.ts");
check("(pos verified) atomic conditional update on prior pos_status", /\.eq\("pos_status", from\)/.test(pos));
check("(pos verified) eligibility-gated (confirmed, non-test)", pos.includes("order_not_eligible") && pos.includes("POS_ELIGIBLE_STATUS"));
check("(pos verified) transitions validated (no skip/backward)", pos.includes("invalid_transition") && pos.includes("ALLOWED_FROM"));
check("(pos verified) stamps actor server-side + audits", pos.includes("pos_entered_by") && pos.includes('action: "order_pos_marked"'));

// ---- Print-audit route: tenant-scoped + audited ----------------------------
const print = read("app/api/orders/[id]/print-audit/route.ts");
check("(print) validates kind kitchen|receipt", print.includes("kitchen|receipt") && print.includes("PRINT_KINDS"));
check("(print) verifies order belongs to tenant before recording", print.includes('.eq("restaurant_id", tenant.restaurantId)') && print.includes("order_not_found"));
check("(print) records order_printed audit with kind", print.includes('action: "order_printed"') && print.includes("metadata: { kind"));
check("(print) touches no order state (audit-only, no update)", !/\.update\(/.test(print));

console.log(`\nR3-HANDOFF-API PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
