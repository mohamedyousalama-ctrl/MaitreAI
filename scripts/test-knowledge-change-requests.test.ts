// Unit tests for the knowledge change-request core (pure, no DB).
// Run: node --experimental-strip-types scripts/test-knowledge-change-requests.test.ts
import { nextStatus, buildPatch, isTargetType, isAction } from "../lib/knowledge/change-request.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// --- State machine: the only legal advances ---
ok("approve: proposed → approved", (() => { const r = nextStatus("proposed", "approve"); return r.ok && r.to === "approved" && !r.noop; })());
ok("reject: proposed → rejected", (() => { const r = nextStatus("proposed", "reject"); return r.ok && r.to === "rejected"; })());
ok("apply: approved → applied", (() => { const r = nextStatus("approved", "apply"); return r.ok && r.to === "applied" && !r.noop; })());

// --- Idempotency: applying an applied request is a NO-OP, never a second write ---
ok("apply: applied → applied is a NO-OP", (() => { const r = nextStatus("applied", "apply"); return r.ok && r.to === "applied" && r.noop === true; })());

// --- Illegal transitions refused ---
ok("reject: cannot apply a proposed request", !nextStatus("proposed", "apply").ok);
ok("cannot approve an approved request", !nextStatus("approved", "approve").ok);
ok("cannot approve an applied request", !nextStatus("applied", "approve").ok);
ok("cannot reject an approved request", !nextStatus("approved", "reject").ok);
ok("cannot reject an applied request", !nextStatus("applied", "reject").ok);
ok("cannot apply a rejected request", !nextStatus("rejected", "apply").ok);
ok("cannot approve a rejected request", !nextStatus("rejected", "approve").ok);

// --- Type guards ---
ok("isTargetType accepts menu_item", isTargetType("menu_item"));
ok("isTargetType rejects garbage", !isTargetType("restaurants") && !isTargetType(null));
ok("isAction accepts apply", isAction("apply") && !isAction("delete"));

// --- Field allowlist: menu_item ---
ok("menu price 690 → { price: 690 }", (() => { const r = buildPatch("menu_item", "price", 690); return r.ok && (r.patch as { price: number }).price === 690; })());
ok("menu description string → { description }", (() => { const r = buildPatch("menu_item", "description", "قطعتين كرسبي"); return r.ok && (r.patch as { description: string }).description === "قطعتين كرسبي"; })());
ok("menu price rejects negative", !buildPatch("menu_item", "price", -5).ok);
ok("menu price rejects string", !buildPatch("menu_item", "price", "690").ok);
ok("menu price rejects NaN/Infinity", !buildPatch("menu_item", "price", Infinity).ok);
ok("menu rejects unknown field (name)", !buildPatch("menu_item", "name", "x").ok);
ok("menu rejects arbitrary column (restaurant_id)", !buildPatch("menu_item", "restaurant_id", "other").ok);
ok("menu description rejects > 600 chars", !buildPatch("menu_item", "description", "x".repeat(601)).ok);

// --- Field allowlist: delivery_zone ---
ok("zone deliveryFee 40 → { deliveryFee: 40 }", (() => { const r = buildPatch("delivery_zone", "deliveryFee", 40); return r.ok && (r.patch as { deliveryFee: number }).deliveryFee === 40; })());
ok("zone name string → trimmed", (() => { const r = buildPatch("delivery_zone", "name", " فيصل "); return r.ok && (r.patch as { name: string }).name === "فيصل"; })());
ok("zone active boolean → { active }", (() => { const r = buildPatch("delivery_zone", "active", false); return r.ok && (r.patch as { active: boolean }).active === false; })());
ok("zone active rejects non-boolean", !buildPatch("delivery_zone", "active", "true").ok);
ok("zone deliveryFee rejects negative", !buildPatch("delivery_zone", "deliveryFee", -1).ok);
ok("zone rejects unknown field (polygon)", !buildPatch("delivery_zone", "polygon", "{}").ok);
ok("zone rejects estimatedTime (lossy, not verifiable)", !buildPatch("delivery_zone", "estimatedTime", "45 min").ok);
ok("zone name rejects empty", !buildPatch("delivery_zone", "name", "   ").ok);

// --- Field allowlist: policy ---
ok("policy delivery text → { delivery }", (() => { const r = buildPatch("policy", "delivery", "توصيل خلال ساعة"); return r.ok && (r.patch as { delivery: string }).delivery === "توصيل خلال ساعة"; })());
ok("policy rejects unknown key (allergen)", !buildPatch("policy", "allergen", "x").ok);
ok("policy rejects > 4000 chars", !buildPatch("policy", "refund", "x".repeat(4001)).ok);

console.log(`\nKNOWLEDGE-CHANGE-REQUESTS UNIT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
