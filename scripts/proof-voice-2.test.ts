// ============================================================================
// WO-VOICE-2 — outbound voice notes, blocking CI gate (pure, offline, no spend).
// Tests the deterministic decision core: the trigger, the hard-zero suppression
// (ruling A — safety/money/link/receipt are text-only), the daily budget + reset,
// the config-overridable cap, and the TTS fallback selection contract.
// ============================================================================

import {
  decideVoiceSend,
  voiceHardZeroReason,
  voiceNotesPerDay,
  VOICE_NOTES_PER_DAY_DEFAULT,
} from "../lib/messaging/voice-budget.ts";
import { shouldOfferVoiceReply } from "../lib/ai/voice-reply-trigger.ts";
import { getTtsAdapter } from "../lib/ai/tts/index.ts";
import { ttsCostUsd } from "../lib/ai/tts/pricing.ts";

let passed = 0, failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; if (process.env.VERBOSE) console.log("  ✓ " + name); }
  else { failed++; console.error(`  ✗ ${name} — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const ok = (name: string, cond: boolean) => eq(name, !!cond, true);

const base = { enabled: true, triggered: true, hardZeroReason: null as null, notesSentToday: 0, cap: 10 };

// --- trigger ----------------------------------------------------------------
ok("trigger: inbound voice note → offer", shouldOfferVoiceReply({ inboundWasVoice: true, userText: "أبغى برجر" }));
ok("trigger: asks for voice (Gulf)", shouldOfferVoiceReply({ inboundWasVoice: false, userText: "ممكن ترد لي صوت؟" }));
ok("trigger: asks for voice (كلمني صوتي)", shouldOfferVoiceReply({ inboundWasVoice: false, userText: "كلمني صوتي لو سمحت" }));
ok("trigger: english voice note", shouldOfferVoiceReply({ inboundWasVoice: false, userText: "can you send a voice note" }));
ok("trigger: typed order, no ask → NO", !shouldOfferVoiceReply({ inboundWasVoice: false, userText: "أبغى كبسة دجاج وعصير" }));
ok("trigger: 'صوت' alone without request verb → NO", !shouldOfferVoiceReply({ inboundWasVoice: false, userText: "الصوت في المطعم عالي" }));

// --- flag + trigger gating --------------------------------------------------
eq("flag OFF → no voice", decideVoiceSend({ ...base, enabled: false }), { send: false, reason: "disabled" });
eq("not triggered → no voice", decideVoiceSend({ ...base, triggered: false }), { send: false, reason: "not_triggered" });
eq("enabled+triggered+fresh → send", decideVoiceSend({ ...base }), { send: true, reason: "ok" });

// --- hard-zero suppression (ruling A) — text-only ---------------------------
for (const r of ["safety_hold", "money_figure", "payment_link", "receipt"] as const) {
  eq(`hard-zero ${r} → suppressed`, decideVoiceSend({ ...base, hardZeroReason: r }), { send: false, reason: r });
  // suppression beats a fresh budget AND overrides trigger
  eq(`hard-zero ${r} beats budget`, decideVoiceSend({ ...base, hardZeroReason: r, notesSentToday: 0 }), { send: false, reason: r });
}

// --- hard-zero reason detection from reply text -----------------------------
eq("detect safety first", voiceHardZeroReason("أي كلام", { safetyHold: true, isReceipt: false }), "safety_hold");
eq("detect receipt", voiceHardZeroReason("طلبك", { safetyHold: false, isReceipt: true }), "receipt");
eq("detect money (ريال)", voiceHardZeroReason("الإجمالي 85 ريال", { safetyHold: false, isReceipt: false }), "money_figure");
eq("detect money (SAR)", voiceHardZeroReason("total 85 SAR", { safetyHold: false, isReceipt: false }), "money_figure");
eq("detect pay link (رابط الدفع)", voiceHardZeroReason("تفضل رابط الدفع 👇", { safetyHold: false, isReceipt: false }), "payment_link");
eq("detect pay link (url)", voiceHardZeroReason("ادفع من هنا https://checkout.moyasar.com/x", { safetyHold: false, isReceipt: false }), "payment_link");
eq("plain greeting → no suppression", voiceHardZeroReason("هلا والله، حياك", { safetyHold: false, isReceipt: false }), null);
eq("menu blurb → no suppression", voiceHardZeroReason("عندنا كبسة ومندي ومظبي", { safetyHold: false, isReceipt: false }), null);

// --- daily budget + reset ---------------------------------------------------
eq("at cap → exhausted", decideVoiceSend({ ...base, notesSentToday: 10 }), { send: false, reason: "budget_exhausted" });
eq("over cap → exhausted", decideVoiceSend({ ...base, notesSentToday: 15 }), { send: false, reason: "budget_exhausted" });
eq("one below cap → send", decideVoiceSend({ ...base, notesSentToday: 9 }), { send: true, reason: "ok" });
// "reset" is the caller passing notesSentToday=0 on a new day — proven by the fresh case above.

// --- config-overridable cap -------------------------------------------------
eq("default cap when unset", (delete process.env.VOICE_NOTES_PER_DAY, voiceNotesPerDay()), VOICE_NOTES_PER_DAY_DEFAULT);
process.env.VOICE_NOTES_PER_DAY = "3";
eq("env override cap", voiceNotesPerDay(), 3);
eq("cap=3 exhausts at 3", decideVoiceSend({ ...base, cap: 3, notesSentToday: 3 }), { send: false, reason: "budget_exhausted" });
delete process.env.VOICE_NOTES_PER_DAY;

// --- TTS selection + fallback contract --------------------------------------
delete process.env.TTS_ADAPTER; delete process.env.ELEVENLABS_API_KEY; delete process.env.OPENAI_API_KEY;
eq("default adapter = mock (no spend)", getTtsAdapter().name, "mock");
// WITH OPENAI_API_KEY PRESENT — which production always has. Deleting it above meant this
// file measured a configuration production does not run: an audit found that with the EL
// key set and TTS_ADAPTER forgotten, resolution fell through to OpenAI and shipped `onyx`
// to a real WhatsApp customer, while every assertion here stayed green because the one
// variable that makes it happen had been removed first.
process.env.OPENAI_API_KEY = "sk-present";
eq("OPENAI key alone does NOT arm openai — production's own state", getTtsAdapter().name, "mock");
process.env.ELEVENLABS_API_KEY = "el-key";
eq("…nor do BOTH keys together, with no pin", getTtsAdapter().name, "mock");
delete process.env.ELEVENLABS_API_KEY; delete process.env.OPENAI_API_KEY;
process.env.TTS_ADAPTER = "elevenlabs";
eq("explicit elevenlabs", getTtsAdapter().name, "elevenlabs");
process.env.TTS_ADAPTER = "openai";
eq("explicit openai (fallback engine)", getTtsAdapter().name, "openai");
delete process.env.TTS_ADAPTER;
process.env.ELEVENLABS_API_KEY = "x";
// CHANGED DELIBERATELY: elevenlabs is no longer inferred from the key.
//
// This used to assert `getTtsAdapter() === "elevenlabs"` on the key alone. An audit showed
// what that produced in a half-finished configuration: with the key and voice id set but
// TTS_ADAPTER forgotten, the WhatsApp path — REAL CUSTOMERS — started speaking, while the
// demo, the surface actually being switched on, stayed silent on `provider_unpinned`.
// Exactly the wrong way round. The demo has always required an explicit pin for this
// reason; the live path now requires the same, so a partial configuration is silent
// everywhere rather than live where nobody is watching.
eq("EL key alone does NOT arm elevenlabs — an explicit pin is required", getTtsAdapter().name, "mock");
process.env.TTS_ADAPTER = "elevenlabs";
eq("…and the explicit pin arms it", getTtsAdapter().name, "elevenlabs");
delete process.env.TTS_ADAPTER;
delete process.env.ELEVENLABS_API_KEY;

// --- pricing ----------------------------------------------------------------
// THE ID HERE WAS THE DASHBOARD'S DISPLAY NAME, NOT A MODEL ID — and this pair of
// assertions is how the mistake survived. They asked ttsCostUsd for
// `eleven_flash_v2.5` (a DOT) and got a number, because the rate table used the same
// wrong key. Both agreed, both passed, and neither could ever match what
// lib/ai/tts/elevenlabs.ts actually sends: it prices `elevenlabs:${model}` with the id
// it put on the wire, and ElevenLabs ids use UNDERSCORES. A test written against the
// implementation's own typo confirms the typo. Verified by synthesizing through
// `eleven_flash_v2_5` in the 2 Sep bake-off.
ok("EL flash cost > 0 for chars", ttsCostUsd("elevenlabs:eleven_flash_v2_5", 150) > 0);
ok("onyx cheaper than EL per char", ttsCostUsd("openai:gpt-4o-mini-tts", 150) < ttsCostUsd("elevenlabs:eleven_flash_v2_5", 150));
eq("unknown model → 0", ttsCostUsd("nope:model", 150), 0);
// AND THE OLD SPELLING MUST NOW PRICE AT ZERO, which is the assertion that stops the
// dotted key being quietly re-added beside the real one: two keys for one model is the
// same silent-zero bug wearing a second coat.
eq("the dashboard's display spelling is NOT a priced id", ttsCostUsd("elevenlabs:eleven_flash_v2.5", 150), 0);

console.log(`\nVOICE-2 PROOF: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
