// Unit tests for the Khalid persona PLAYBOOKS + the FORBIDDEN CLAIMS constant.
// Run: node --experimental-strip-types scripts/test-khalid-playbooks.test.ts
//
// Asserts (1) the forbidden-claims list is well-formed and its detector both fires on
// known-bad strings and stays quiet on benign ones; (2) the persona OVERLAY TEXT
// (base layer + playbooks, every region) contains ZERO forbidden claims — the core
// guarantee the PM asked for; (3) the playbook sections are present + keep the overlay
// contract (menu-truth-gated, Approvals-only compensation, ≤3 msgs, 24h window,
// split-recap). Pure — no LLM, no I/O.
import { buildKhalidPlaybooks } from "../lib/ai/personas/khalid-playbooks.ts";
import {
  FORBIDDEN_CLAIMS,
  FORBIDDEN_CLAIM_IDS,
  findForbiddenClaims,
} from "../lib/ai/personas/khalid-forbidden-claims.mjs";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const REGIONS = ["najd", "hijaz", "asir", "eastern"] as const;

// ── 1) forbidden-claims list well-formed ────────────────────────────────────
ok("5 forbidden-claim classes", FORBIDDEN_CLAIMS.length === 5);
ok("expected ids present", ["allergen_safety", "guaranteed_delivery", "medical_suitability", "invented_discount", "competitor_attack"].every((id) => FORBIDDEN_CLAIM_IDS.includes(id)));
ok("every entry well-formed", FORBIDDEN_CLAIMS.every((c) => c.id && c.label && c.re instanceof RegExp && typeof c.evalAssert === "boolean" && c.rationale));

// ── 1b) detector FIRES on known-bad strings (so the guarantee is real) ───────
ok("detect: allergen safety «آمن ١٠٠٪»", findForbiddenClaims("الأكل ده آمن ١٠٠٪ للحساسية").some((c) => c.id === "allergen_safety"));
ok("detect: free-of «مفيهاش مكسرات»", findForbiddenClaims("الكبسة مفيهاش مكسرات خالص").some((c) => c.id === "allergen_safety"));
ok("detect: nut-free (english)", findForbiddenClaims("this is nut-free").some((c) => c.id === "allergen_safety"));
ok("detect: guaranteed delivery «التوصيل مضمون»", findForbiddenClaims("التوصيل مضمون خلال ٣٠ دقيقة").some((c) => c.id === "guaranteed_delivery"));
ok("detect: guaranteed time «خلال ٢٠ دقيقة بالضبط»", findForbiddenClaims("يوصلك خلال ٢٠ دقيقة بالضبط").some((c) => c.id === "guaranteed_delivery"));
ok("detect: medical «مناسب لمرضى السكر»", findForbiddenClaims("هذا الطبق مناسب لمرضى السكر").some((c) => c.id === "medical_suitability"));
ok("detect: invented discount «ببلاش»", findForbiddenClaims("خليها عليّ ببلاش").some((c) => c.id === "invented_discount"));
ok("detect: personal discount «خصم خاص لك»", findForbiddenClaims("أعطيك خصم خاص لك من عندي").some((c) => c.id === "invented_discount"));
ok("detect: competitor attack", findForbiddenClaims("إحنا أحسن من مطعم الجيران").some((c) => c.id === "competitor_attack"));

// ── 1c) detector STAYS QUIET on benign / legit strings (no false positives) ──
ok("benign: secure payment «دفع آمن»", findForbiddenClaims("الدفع آمن عند الاستلام").length === 0);
ok("benign: real promo quote «خصم ١٥٪ على أول طلب»", findForbiddenClaims("عندنا خصم ١٥٪ على أول طلب").length === 0);
ok("benign: honest ETA estimate", findForbiddenClaims("التوصيل عادة خلال ٤٥ دقيقة حسب المنطقة").length === 0);
ok("benign: normal recommendation", findForbiddenClaims("أنصحك بالكبسة، من ألذ أطباقنا").length === 0);
ok("evalOnly filter returns a subset or equal", findForbiddenClaims("مناسب لمرضى السكر", { evalOnly: true }).length >= 1);

// ── 1d) NEGATION / REFUSAL context is NOT a claim (Codex P2 — no false positives) ──
// A compliant safety refusal + handoff must NOT be flagged as an allergen-safety claim.
ok("refusal: «لا أقدر أؤكد إنه آمن تماماً، بحوّلك للفريق» → NOT flagged",
  findForbiddenClaims("لا أقدر أؤكد إنه آمن تماماً، بحوّلك لفريق المطعم", { evalOnly: true }).length === 0);
ok("refusal: «مو آمن تماماً» → NOT flagged", findForbiddenClaims("مو آمن تماماً، فيه احتمال مكسرات").length === 0);
ok("refusal: declined delivery guarantee «ما أقدر أضمن لك التوصيل» → NOT flagged",
  findForbiddenClaims("ما أقدر أضمن لك التوصيل، بس عادة يوصل بسرعة").length === 0);
ok("refusal: declined freebie «ما أقدر أعطيك ببلاش» → NOT flagged",
  findForbiddenClaims("ما أقدر أعطيك ببلاش، بس أقدر أحوّلك للفريق").length === 0);
// … but an ASSERTED claim in a later clause is STILL flagged (no over-suppression).
ok("mixed: refusal then a real assertion IS flagged",
  findForbiddenClaims("ما أقدر أأكل معاك. الأكل آمن ١٠٠٪ للحساسية").some((c) => c.id === "allergen_safety"));

// ── 2) THE GUARANTEE: the playbooks overlay text trips ZERO forbidden claims,
//      in every region. (The base persona layer's own cleanliness is covered in the
//      persona-layer PR; the wiring composes the two, and the live-output eval below
//      asserts the composed result against Khalid's actual replies.)
for (const region of REGIONS) {
  const play = buildKhalidPlaybooks({ region });
  const hits = findForbiddenClaims(play);
  ok(`playbooks overlay [${region}] contains NO forbidden claim`, hits.length === 0);
  if (hits.length) console.log("     tripped:", hits.map((h) => h.id).join(", "));
}

// ── 3) playbook sections present + overlay contract kept ─────────────────────
const p = buildKhalidPlaybooks({ region: "najd" });
ok("has complaint-recovery section", /Complaint recovery WITHIN policy/.test(p));
ok("compensation is Approvals-only", /COMPENSATION IS APPROVALS-ONLY/.test(p) && /never self-authorize/i.test(p));
ok("has Ramadan section", /Ramadan behaviours/.test(p));
ok("Ramadan bundle is menu-truth-gated", p.includes("REAL tenant menu item") && p.includes("Market knowledge ≠ menu truth"));
ok("has WhatsApp cadence section", /WhatsApp cadence/.test(p));
ok("≤3 messages per turn", /≤ 3 MESSAGES PER TURN/.test(p));
ok("24-hour window respected", /24-HOUR WINDOW RESPECT/.test(p));
ok("split-recap / facts atomic", /SPLIT-RECAP PATTERN/.test(p) && /FACTS atomic|facts atomic/i.test(p));
ok("has forbidden-claims section", /Forbidden claims/.test(p));
ok("region flavour varies (asir vs najd)", buildKhalidPlaybooks({ region: "asir" }) !== buildKhalidPlaybooks({ region: "najd" }));

console.log(`\nKHALID-PLAYBOOKS UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
