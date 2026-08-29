// ============================================================================
// WO-CONVO-QUALITY — Karim conversational fixes (live-customer findings, 11 Jul).
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-convo-quality.test.ts
//
// Prompt-guidance regression tests for the four documented live failures. Because
// the reply itself is model-generated, these assert that the ENGINE PROMPT now
// carries the binding guidance for each transcript (red-first: they fail on the
// pre-WO prompt, pass after the surgical edits) — plus a deterministic banned-jargon
// scanner over sample replies (fix #2). Guidance is in the BASE prompt, so it
// applies to ALL tenants/personas (Karim egyptian AND Khalid saudi) — asserted both.
// ============================================================================
import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctx(overrides: Record<string, unknown> = {}): any {
  return {
    profile: { name: "مطعم تجريبي", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
    dialect: "egyptian",
    menuItems: [], modifiers: [], branches: [], deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [],
    aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live", isOpen: true, autoAccept: false, personaName: "كريم",
    ...overrides,
  };
}

const karim = buildCustomerAgentSystemPrompt(ctx());
const khalid = buildCustomerAgentSystemPrompt(ctx({ dialect: "saudi", personaName: "خالد", khalidPersona: true, ksaRegion: "najd", profile: { name: "مطعم الديرة", currency: "ر.س", timezone: "Asia/Riyadh", businessType: "restaurant" } }));
const both = (label: string, needle: string) => {
  ok(`${label} — in Karim prompt`, karim.includes(needle));
  ok(`${label} — in Khalid prompt (all tenants)`, khalid.includes(needle));
};

// ── Fix 1: BUDGET RECOMMENDATIONS (propose a combo within budget, never demand order-first) ──
both("budget: BUDGET-FIRST heading", "BUDGET-FIRST RECOMMENDING");
// PER-DIALECT. This asserted the Saudi prompt contained «ميزانيتنا ٥٠٠ جنيه» — the
// EGYPTIAN pound, in a rule teaching a Saudi restaurant how to quote a budget, alongside
// «تنصح بإيه؟» and «معايا». The exemplar is now branched; the transcript it reproduces is
// still pinned for Karim, and Khalid gets the same rule in his own currency and words.
ok("budget: reproduces the «ميزانيتنا ٥٠٠ جنيه» transcript — in Karim prompt",
  karim.includes("ميزانيتنا ٥٠٠ جنيه"));
ok("budget: the same rule reaches Khalid in RIYALS and Saudi wording",
  khalid.includes("ميزانيتنا 500 ريال") && khalid.includes("وش تنصح؟") &&
  !khalid.includes("جنيه") && !khalid.includes("تنصح بإيه؟"));
both("budget: propose concrete items+prices within budget", "keep it at or under the budget");
both("budget: never demand they build the order first", "do NOT make them build the order first");
both("budget: engine-truth prices only (no invention)", "NEVER invent a dish or a price");

// ── Fix 2: JARGON BAN ──
both("jargon: WAITER LANGUAGE ONLY heading", "WAITER LANGUAGE ONLY");
both("jargon: bans السيستم", "«السيستم»");
both("jargon: bans النظام", "«النظام»");
both("jargon: bans أبني الطلب", "«أبني الطلب»");
both("jargon: bans الداتا", "«الداتا»");
both("jargon: waiter alternative أجهّزلك الطلب", "أجهّزلك الطلب؟");

// ── Fix 2b: BUNDLED GREETING + SUBSTANCE (ack greeting without re-greeting loops) ──
both("greeting: bundled greeting+substance instruction", "BUNDLED GREETING + SUBSTANCE");
both("greeting: examples include Egyptian + Saudi/Gulf greeting forms", "هاي/سلام/أهلاً/مساء الخير/إزيك/هلا/حياك/السلام عليكم");
both("greeting: brief dialect-register return then substance", "briefly return the greeting in the same dialect/register");
both("greeting: greet-once discipline still intact", "Greet ONCE at the start of the chat; afterwards continue the conversation naturally without re-greeting");
both("greeting: bundled rule does not override greet-once", "does NOT override greet-once discipline");

// ── Fix 3: REFERENCE RESOLUTION («هات ذا/ده» after a single quoted item) ──
both("reference: REFERENCE RESOLUTION heading", "REFERENCE RESOLUTION");
both("reference: «هات ذا / هات ده» resolves to the last quoted item", "هات ذا / هات ده");
both("reference: confirm-and-add example (عرض كاديا)", "عرض كاديا");
both("reference: never «مش فاهم قصدك» when referent is obvious", "NEVER «مش فاهم قصدك»");

// ── Fix 4: PHOTO RESTRAINT (only on ask / named dish; no unsolicited barrage) ──
both("photo: RESTRAINT heading", "RESTRAINT (binding)");
both("photo: only on request or a NAMED dish", "send on REQUEST or for a NAMED dish");
both("photo: never a menu-as-images barrage", "menu-as-images barrage");
both("photo: open browse → text list, not pictures", "NOT a stream of pictures");

// ── Fix 2 (cont.): deterministic banned-jargon SCANNER over replies ──
// A pure scanner (test-local; NOT wired into the engine — prompt+tests lane only) that
// flags internal-machinery words in an outgoing reply. Mirrors the prompt's banned list.
const BANNED_JARGON = ["السيستم", "النظام", "الداتا", "البيانات", "أبني الطلب", "بناء الطلب", "قاعدة البيانات", "الباك اند", "الباك إند", "الذكاء الاصطناعي", "بوت"];
function scanJargon(reply: string): string[] {
  return BANNED_JARGON.filter((w) => reply.includes(w));
}
// BAD replies (the failure) — must be flagged
ok("scan: «أبني الطلب في السيستم» flagged", scanJargon("ثانية بس أبني الطلب في السيستم وأرجعلك").length > 0);
ok("scan: «هجيب الداتا من النظام» flagged", scanJargon("هجيب الداتا من النظام دلوقتي").length >= 2);
ok("scan: «أنا بوت/ذكاء اصطناعي» flagged", scanJargon("أنا مجرد بوت ذكاء اصطناعي").length > 0);
// GOOD waiter replies — must be clean
ok("scan: «أرشّحلك بروست وأجهّزلك الطلب؟» clean", scanJargon("أرشّحلك بروست وبطاطس، أجهّزلك الطلب؟").length === 0);
ok("scan: «تمام سجّلت طلبك ✍️» clean", scanJargon("تمام، سجّلت طلبك ✍️").length === 0);
ok("scan: «أضيفه لطلبك؟» clean", scanJargon("عرض كاديا بـ٣٢٠ ✅ أضيفه لطلبك؟").length === 0);

console.log(`\nCONVO-QUALITY: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
