// ============================================================================
// WO-KHALID-BRAIN-3 — the persona guards must actually RUN on a live reply.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-khalid-runtime-guards.test.ts
//
// WHY THIS EXISTS
// ---------------
// khalid-forbidden-claims.mjs defines 8 classes of assertion Khalid must never make.
// A corpus audit found it had NO runtime importer: it was read only by the CI eval
// harness and two unit tests. Seven of the eight — everything except allergen safety,
// which respond.ts guards on its own path — were PROMPT TEXT AND NOTHING ELSE. A
// guaranteed delivery time, a medical claim, an invented discount, a request for card
// data, a false "payment received", an attack on a competitor, and a claim to be human
// all reached customers with nothing checking.
//
// The dialect linter had the mirror problem: it ran, but only console.warn'd. Nobody
// reads a lambda log, so the leakage rate the module exists to MEASURE was never
// measured once.
//
// These assertions pin the wiring, not the verdicts — the detectors have their own
// unit tests. What is proven here is that customer-turn actually calls them and that
// the result is persisted somewhere queryable.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORBIDDEN_CLAIMS, findForbiddenClaims } from "../lib/ai/personas/khalid-forbidden-claims.mjs";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};
const codeOf = (p: string) => readFileSync(resolve(ROOT, p), "utf8")
  .split("\n").filter((l) => { const t = l.trimStart(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); }).join("\n");

const turn = codeOf("lib/ai/customer-turn.ts");

// ── 1. the forbidden-claim list is REACHED at runtime ───────────────────────
ok("customer-turn imports findForbiddenClaims", /import \{ findForbiddenClaims \}/.test(turn));
ok("it is actually CALLED on the composed reply", /findForbiddenClaims\(result\.reply\)/.test(turn));
ok("a hit is persisted as a signal, not only logged",
  /guard: "forbidden_claim"[\s\S]{0,80}ids:/.test(turn));
ok("the detector is wrapped so a fault cannot break a customer turn",
  /findForbiddenClaims\(result\.reply\)[\s\S]{0,400}catch \{/.test(turn));
// It must NOT be flag-gated: a false payment/medical/personhood claim is not a
// Khalid-only concern, and the engine serves Karim through the same path.
const fcBlock = turn.slice(turn.indexOf("findForbiddenClaims(result.reply)") - 600,
                           turn.indexOf("findForbiddenClaims(result.reply)"));
ok("forbidden-claim detection is NOT gated on khalid_persona (it guards every tenant)",
  !/isFeatureExplicitlyEnabled\("khalid_persona"[\s\S]{0,200}$/.test(fcBlock));

// ── 2. dialect leakage is measurable, not just printed ──────────────────────
ok("a dialect leak is persisted as a signal too",
  /guard: "dialect_leakage"[\s\S]{0,160}hits:/.test(turn));
ok("the dialect linter stays flag-scoped to khalid_persona (it IS persona-specific)",
  /isFeatureExplicitlyEnabled\("khalid_persona", tenantFeatures\) && result\.reply/.test(turn));

// ── 3. the list itself still covers what it claims ─────────────────────────
ok("8 forbidden-claim classes are defined", FORBIDDEN_CLAIMS.length === 8);
for (const id of ["allergen_safety", "guaranteed_delivery", "medical_suitability",
                  "invented_discount", "competitor_attack", "card_data_request",
                  "payment_status_claim", "false_personhood"]) {
  ok(`class present: ${id}`, FORBIDDEN_CLAIMS.some((c) => c.id === id));
}

// ── 4. the classes that had NO live guard before now have one ──────────────
// Spot-check the detector end-to-end on one string per previously-unguarded class,
// so this proof fails if a regex is broken as well as if the wiring is removed.
for (const [id, sample] of [
  ["guaranteed_delivery", "التوصيل مضمون خلال ٣٠ دقيقة"],
  ["medical_suitability", "هذا الطبق مناسب لمرضى السكر"],
  ["invented_discount", "خليها عليّ ببلاش"],
  ["false_personhood", "أنا خالد، مضيف حقيقي من مطعم الديرة"],
] as const) {
  ok(`detector fires for ${id}`, findForbiddenClaims(sample).some((c) => c.id === id));
}
// And an ordinary good reply must stay clean — a guard that fires on everything is noise.
for (const clean of [
  "هلا والله، وش تحب تطلب اليوم؟",
  "أرز مبهّر ببهارات الكبسة مع دجاج، طبق المائدة السعودية الأشهر.",
  "لا، الأسعار في المنيو ما تشمل الضريبة — تُضاف ١٥٪ على الإجمالي.",
]) {
  ok(`an ordinary reply is NOT flagged: «${clean.slice(0, 34)}…»`, findForbiddenClaims(clean).length === 0);
}

console.log(`\nKHALID RUNTIME-GUARDS PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
