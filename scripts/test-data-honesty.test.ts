// ============================================================================
// WO-DATA-HONESTY — two binding prompt additions (live findings, Mohamed's test).
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-data-honesty.test.ts
//
// Red-first prompt-guidance tests (fail on the pre-WO prompt, pass after the edits).
// Both additions live in the BASE prompt, so they apply to ALL tenants/personas —
// asserted on both Karim (egyptian) and Khalid (saudi).
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
  ok(`${label} — Karim`, karim.includes(needle));
  ok(`${label} — Khalid (all tenants)`, khalid.includes(needle));
};

// ── 1. DATA-QUESTION HONESTY ──
both("data: DATA & PRIVACY QUESTIONS heading", "DATA & PRIVACY QUESTIONS (binding honesty)");
both("data: never claim nothing is stored (the false answer)", "NEVER claim nothing is stored or that the chat disappears");
// PER-DIALECT. This asserted the Cairene «بنحتفظ» for BOTH personas — i.e. it pinned the
// defect: the data-honesty line, one of the binding-honesty sentences, was authored once
// in Egyptian and served verbatim to Saudi tenants. The truth it states is unchanged;
// only the dialect it states it in is now the tenant's.
ok("data: the truthful line — records kept to serve — Karim",
  karim.includes("بنحتفظ بسجل الطلبات والمحادثة عشان نقدر نخدمك"));
ok("data: the same truth reaches Khalid in Najdi",
  khalid.includes("نحتفظ بسجل الطلبات والمحادثة عشان نقدر نخدمك") && !khalid.includes("بنحتفظ"));
both("data: route — offer to notify the team", "أبلّغ الفريق يتابعوا طلبك");
both("data: mention the privacy policy", "سياسة الخصوصية");
both("data: NO delete tool — never say اتمسح", "NO delete tool");
both("data: never a comforting lie", "never a comforting lie");

// ── 2. ANTI-ANCHORING ──
both("anchor: ANTI-ANCHORING heading", "ANTI-ANCHORING");
both("anchor: instructions outrank earlier replies", "THESE INSTRUCTIONS OUTRANK YOUR OWN EARLIER REPLIES");
both("anchor: the live «أحسبهولك من السيستم» example", "أحسبهولك من السيستم");
both("anchor: do NOT echo the mistake because it's in the thread", "don't echo the mistake because it's already in the thread");
both("anchor: preserves rule 3 (team commitments still stand)", "does NOT override rule 3");

console.log(`\nDATA-HONESTY: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
