// WO-LIVE6-DUP-ORDER-AWARENESS — RED-FIRST: a reference to an order the customer ALREADY
// placed this conversation must resolve to THAT order (recap, never re-finalize a duplicate).
// Live dup (conv 68966859): #1009 registered 14:46:57; at 15:01:37 the customer said «لاخلاص
// خلينا على طلبي القديم» — a reference to #1009 — but nothing surfaced #1009, so the model
// rebuilt the basket and re-finalized #1010 (byte-identical, 23 min apart, past the 120s
// double-tap window). Fix: refersToRegisteredOrder() + a deterministic recap intercept placed
// AFTER every safety branch, gated on the dup_order_awareness flag + a real registered order.
// Run: node --conditions=react-server --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-dup-order.test.ts
// (Reordered fix: PM ruling — bare «طلبي» excluded, intercept-only, recap with an open door.)
import { readFileSync } from "fs";
import { resolve } from "path";
import { refersToRegisteredOrder } from "../lib/ai/order-reference.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── A — the detector: the live reference turn fires; reorder / bare «طلبي» / build do NOT ──
ok("A: LIVE «لاخلاص خلينا على طلبي القديم» → refers to the registered order (was: rebuilt → #1010 dup)",
  refersToRegisteredOrder("لاخلاص خلينا على طلبي القديم") === true);
ok("A: «خلينا على الطلب السابق» → reference", refersToRegisteredOrder("خلينا على الطلب السابق") === true);
ok("A: «طلبي اللي فات» → reference", refersToRegisteredOrder("عايز طلبي اللي فات") === true);
ok("A: «نفس طلبي» → reference", refersToRegisteredOrder("ايوه نفس طلبي") === true);
ok("A: «طلبي الاولاني» → reference", refersToRegisteredOrder("رجعلي طلبي الاولاني") === true);

// ── B — a GENUINE reorder must NOT intercept (a real new order still gets created) ─────────
ok("B: «عايز أطلب نفس الحاجة تاني» → NOT a reference (genuine reorder → new order)",
  refersToRegisteredOrder("عايز أطلب نفس الحاجة تاني") === false);
ok("B: «عايز نفس طلبي تاني» → reorder intent WINS over the reference (new order)",
  refersToRegisteredOrder("عايز نفس طلبي تاني") === false);
ok("B: «اطلب كمان مرة نفس الطلب» → reorder → NOT intercepted",
  refersToRegisteredOrder("اطلب كمان مرة نفس الطلب") === false);

// ── C — bare «طلبي» / an active build refers to the LIVE DRAFT, never the committed order ──
ok("C: «شيل من طلبي البيتزا» (bare طلبي = draft edit) → NOT a reference",
  refersToRegisteredOrder("شيل من طلبي البيتزا") === false);
ok("C: «عايز أعمل طلبي» (building) → NOT a reference", refersToRegisteredOrder("عايز أعمل طلبي") === false);
ok("C: «تأكيد الطلب» (generic confirm) → NOT a reference", refersToRegisteredOrder("تأكيد الطلب") === false);
ok("C: «عايز طلب جديد» (new order) → NOT a reference", refersToRegisteredOrder("عايز طلب جديد") === false);
ok("C: empty → NOT a reference", refersToRegisteredOrder("") === false);

// ── D — source wiring: the intercept is flag-gated, safety-first, and never re-finalizes ──
const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
ok("D: the flag is read (dup_order_awareness, default OFF → byte-identical)",
  /isFeatureExplicitlyEnabled\("dup_order_awareness", tenantFeatures\)/.test(ct));
ok("D: the registered-order read EXCLUDES cancelled/rejected orders",
  /order_status[\s\S]{0,80}?\(cancelled,canceled,rejected\)/.test(ct));
ok("D: the intercept requires the flag AND a real registered order AND the detector",
  /dupOrderIntercept\s*=[\s\S]{0,400}?dupOrderAwarenessOn[\s\S]{0,400}?registeredOrder != null[\s\S]{0,400}?refersToRegisteredOrder\(input\.userMessage\)/.test(ct));
ok("D: SAFETY-FIRST — the intercept is disqualified by an allergen / emergency / human-request signal",
  /dupOrderIntercept\s*=[\s\S]{0,400}?!combinedAllergenHit\.fired[\s\S]{0,200}?!companionEmergency\.fired[\s\S]{0,200}?!isExplicitHumanRequest\(input\.userMessage\)/.test(ct));
ok("D: the intercept branch sits AFTER the companion/safety branches, before the normal-turn else",
  ct.indexOf("dupOrderIntercept && registeredOrder") > ct.indexOf("} else if (enterCompanion) {") &&
  ct.indexOf("dupOrderIntercept && registeredOrder") < ct.indexOf("// Normal turn. In companion mode"));
ok("D: the recap resolves to the registered order and does NOT finalize (deterministic, no LLM)",
  /function dupOrderRecapResult[\s\S]{0,600}?toArabicDigits[\s\S]{0,300}?مسجّل بالفعل/.test(ct) &&
  /stopReason: "dup_order_reference"/.test(ct));
ok("D: the recap keeps an open door for a genuinely new order",
  /تطلب حاجة جديدة|تطلب شي جديد/.test(ct));

// ── E — RED WITNESS: without the detector call the intercept can never gate on it. Assert the
//    wiring literally references the detector so deleting it flips this proof red. ──────────
ok("E: customer-turn imports + calls refersToRegisteredOrder (remove it → red)",
  /import \{ refersToRegisteredOrder \} from "@\/lib\/ai\/order-reference"/.test(ct) &&
  /refersToRegisteredOrder\(input\.userMessage\)/.test(ct));

console.log(`\n${fail === 0 ? "✅" : "❌"} dup-order: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
