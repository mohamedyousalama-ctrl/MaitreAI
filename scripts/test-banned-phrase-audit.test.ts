// WO-LIVE-2-F4 — RED-FIRST: the §0 banned-phrase BLOCK must produce a
// conversation_allergy_events audit row. Before this WO the block site emitted only a
// conversation_signals row and NO audit event, so a companion safety block left the §4
// trail empty (live: conv c016a121, 0 rows). buildBannedPhraseBlockAudit maps the
// respond() signal into the audit input; null when no block occurred.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/test-banned-phrase-audit.test.ts
import { buildBannedPhraseBlockAudit } from "../lib/db/allergy-audit.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const CTX = {
  restaurantId: "r1",
  conversationId: "c016a121-7e56-4dc7-95cd-195b9d52a8fd",
  customerMessage: "لا. اقصد الاولاني",
  sessionAllergyNote: "⚠️ حساسية: مكسرات، بيض",
  agentReply: "صحتك تهمّنا 🙏 ما أقدرش أجزم عن سلامة الأصناف من غير ما المطبخ يتأكد.",
};

// The live block signal (as respond() emits it: reason + phrases + the blocked draft).
const blockSignal = {
  type: "escalation",
  detail: { reason: "companion_banned_phrase", phrases: ["عادي"], reply: "تمام، عرض الكتيبة ✅\n\nعادي، حار، أو مكس؟" },
};

// ── THE FIX (red→green): a block signal → a non-null audit input, fully populated. ──
const a = buildBannedPhraseBlockAudit([blockSignal], CTX);
ok("block signal → audit input built (not null)", a !== null);
ok("event_kind = banned_phrase_block", a?.eventKind === "banned_phrase_block");
ok("truth_states carries the banned phrase(s)", JSON.stringify(a?.truthStates)?.includes("عادي") === true);
ok("truth_states carries the BLOCKED draft (liability record)",
  (a?.truthStates as { blockedDraft?: string } | undefined)?.blockedDraft?.includes("عادي، حار، أو مكس") === true);
ok("agent_reply = the rewrite actually sent (not the blocked draft)",
  a?.agentReply === CTX.agentReply);
ok("allergens parsed from the session note", JSON.stringify(a?.allergens) === JSON.stringify(["مكسرات", "بيض"]));
ok("staff notified (block escalates to a human)", a?.staffNotified === true);
ok("net_reason names the phrase", a?.netReason === "banned_phrase_block:عادي");
ok("customer message preserved", a?.customerMessage === CTX.customerMessage);

// ── NO block this turn → null (never write a spurious audit row). ──
ok("no signals → null", buildBannedPhraseBlockAudit([], CTX) === null);
ok("null signals → null", buildBannedPhraseBlockAudit(null, CTX) === null);
ok("unrelated signal only → null",
  buildBannedPhraseBlockAudit([{ type: "money_mismatch", detail: { reason: "money_without_tool" } }], CTX) === null);
ok("escalation with a DIFFERENT reason → null",
  buildBannedPhraseBlockAudit([{ type: "escalation", detail: { reason: "allergen_safety_claim" } }], CTX) === null);

// ── Edge: block signal without phrases → still recorded, empty phrase list. ──
const b = buildBannedPhraseBlockAudit([{ type: "escalation", detail: { reason: "companion_banned_phrase" } }], { ...CTX, sessionAllergyNote: null });
ok("block w/o phrases → built, phrases empty", b !== null && Array.isArray((b!.truthStates as { bannedPhrases?: unknown[] }).bannedPhrases) && (b!.truthStates as { bannedPhrases: unknown[] }).bannedPhrases.length === 0);
ok("no session note → allergens empty", JSON.stringify(b?.allergens) === "[]");

console.log(`\n${fail === 0 ? "✅" : "❌"} banned-phrase-audit: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
