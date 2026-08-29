// ============================================================================
// MaitreAI — the demo's SPOKEN reply.
//
// Khalid listens on the demo and has never spoken: `synthesizeVoiceReply` had exactly one
// caller in the repo, lib/messaging/respond-and-send.ts, the WhatsApp path. This module is
// the demo's half, and it exists as its own file because four things in the WhatsApp block
// are actively wrong on a PUBLIC page:
//
//   1. `recordCriticalAlert` on a TTS fallback — which EMAILS AND WHATSAPPS THE FOUNDER.
//      A stranger on a public page must never be able to page a human. That single line
//      is the highest-risk part of the WhatsApp block, and it is not copied here.
//   2. `sendWhatsAppAudio` — replaced by returning the audio in the HTTP response.
//   3. The per-conversation daily counters, which belong to a real tenant's billing.
//   4. The onyx FALLBACK itself — see below.
//
// WHAT IS NOT DROPPED, and was in the first version of this file: the HARD-ZERO gate from
// lib/messaging/voice-budget.ts. lib/ai/tts/types.ts states the product law — "Safety /
// money / payment-link / receipt turns are text-only" — and `voiceHardZeroReason` is a
// PURE function, so there was never an excuse to skip it. It binds harder here than on
// WhatsApp: the allergen gate is the thing this page exists to demonstrate, and speaking
// that reply would show the feature off in the one modality the product forbids for it.
//
// WE CALL THE ADAPTER DIRECTLY, NOT `synthesizeVoiceReply`. That wrapper's whole feature is
// the onyx fallback, and this module refuses a fallback anyway — so routing through it
// meant PAYING OpenAI for an onyx synthesis on every ElevenLabs failure and discarding the
// bytes one line later, on an unauthenticated page, precisely when ElevenLabs is already
// over quota. Calling the adapter directly removes that automatic fallback purchase
// entirely. The adapter/voice checks below are still refusals AFTER a synthesis has been
// paid for — which is why they carry the spend to the ledger rather than dropping it.
//
// AND WE VERIFY WHAT CAME BACK, not what we asked for. `getTtsAdapter()` lives in the
// shared WhatsApp-path file; a one-token edit there ("elevenlabs" → openaiTtsAdapter) used
// to hand a visitor onyx audio while every demo proof stayed green, because no demo proof
// reads that file. `result.adapter` is the provider's own account of itself and is checked
// after the fact.
// ============================================================================

import "server-only";
import { getTtsAdapter } from "@/lib/ai/tts";
import { TTS_RATE_PER_CHAR } from "@/lib/ai/tts/pricing";
import {
  voiceHardZeroReason, voiceSignalsForTurn,
  type VoiceZeroReason, type VoiceTurnSignals,
} from "@/lib/messaging/voice-budget";

export type DemoVoiceOutSkip =
  | "not_triggered"      // the visitor typed; we answer in text
  | "provider_unpinned"  // see the pinning note below — refuse rather than guess a voice
  | "mock_pinned"        // a deliberate no-voice config, NOT a misconfiguration
  | "too_long"
  | "empty"
  | "synth_failed"
  | "wrong_voice"        // the provider that answered is not the one we pinned
  // The four HARD-ZERO categories, from lib/messaging/voice-budget.ts. A product ruling,
  // not a budget: a spoken safety message is a new mis-hearing surface, a spoken amount is
  // a misheard charge, a link must be tappable, and a receipt's record of truth is text.
  | VoiceZeroReason;

export interface DemoVoiceOut {
  /** base64 audio for the browser, or null with a reason the caller may log. */
  audioBase64: string | null;
  mime: string | null;
  skipped: DemoVoiceOutSkip | null;
  /** What the synthesis actually cost, for agent_runs. Null whenever we stayed silent.
   *  The route records this: its own comment records why STT cost is written down ("the
   *  one surface anyone can call was the one surface the spend monitor could not see")
   *  and TTS is the same money on the same public page. */
  spend: { costUsd: number; chars: number; model: string; adapter: string } | null;
}

/** Hard ceiling on ONE spoken reply. TTS bills per character and this page is
 *  unauthenticated, so the cap is on the input, before a provider is ever called. Long
 *  replies fall back to text, which is a worse demo than a spoken one and a much better
 *  one than an unbounded bill. */
export const DEMO_TTS_MAX_CHARS = 600;

/** Env reads are TRIMMED. `ELEVENLABS_API_KEY=" "` is a misconfiguration, not a key, and
 *  an untrimmed truthiness test let it through to a request against `.../text-to-speech/%20`. */
const envTrim = (k: string): string => (process.env[k] || "").trim();

/** Zero-width and bidi characters that `trim()` does not remove. A reply of one U+200B is
 *  blank to a reader and a billable character to a provider. */
const INVISIBLE_RE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

/** ElevenLabs' own STOCK voice ids — public constants, shipped in every account.
 *
 *  THIS IS A HEURISTIC, AND THE ONLY HONEST CLAIM FOR IT: it catches the LIKELY paste
 *  error, not every wrong voice. Pinning the provider never pinned the VOICE — any valid
 *  id in the account speaks with no error, so a mis-copied id yields ElevenLabs' stock
 *  "Rachel" (female) or "Adam" (American male) reading Najdi Arabic, exactly the failure
 *  this module claims to prevent. Copying an opaque 20-character id off a dashboard is the
 *  single most likely operator error in the rollout, and a STOCK id is definitionally not
 *  the Founder's designed Khalid — so those we can refuse outright. A wrong CUSTOM id we
 *  cannot detect without asking the provider, and that is a per-turn API call; it stays a
 *  known residual risk, listed for the Founder rather than papered over. */
const ELEVENLABS_STOCK_VOICE_IDS = new Set([
  "21m00Tcm4TlvDq8ikWAM", "9BWtsMINqrJLrRacOk9x", "AZnzlk1XvdvUeBnXmlld", "CwhRBWXzGAHq8TQ4Fs17",
  "CYw3kZ02Hs0563khs1Fj", "D38z5RcWu1voky8WS1ja", "EXAVITQu4vr4xnSDxMaL", "ErXwobaYiN019PkySvjV",
  "FGY2WhTYpPnrIDTdsKH5", "IKne3meq5aSn9XLyUdCD", "JBFqnCBsd6RMkjVDRZzb", "LcfcDJNUP1GQjkzn1xUU",
  "MF3mGyEYCl7XYWbV9V6O", "N2lVS1w4EtoT3dr4eOWO", "ODq5zmih8GrVes37Dizd", "SAz9YHcvj6GT2YYXdXww",
  "SOYHLrjzK2X1ezoPC6cr", "TX3LPaxmHKxFdv7VOQHJ", "TxGEqnHWrfWFTfGW9XjX", "VR6AewLTigWG4xSOukaG",
  "XB0fDUnXU5powFXDhCwa", "Xb7hH8MSUJpSbSDYk0k2", "XrExE9yKIg1WjnnlVkGX", "ZQe5CZNOzWyzPSCn5a3c",
  "Zlb1dXrM653N07WRdFW3", "bIHbv24MWmeRgasZH58o", "bVMeCyTHy58xNoL34h3p", "cgSgspJ2msm6clMCkdW9",
  "cjVigY5qzO86Huf0OWal", "flq6f7yk4E4fJM5XTYuZ", "g5CIjZEefAph4nQFvHAz", "iP95p4xoKVk53GoZ742B",
  "jBpfuIE2acCO8z3wKNLl", "jsCqWAovK2LkecY7zXl4", "nPczCjzI2devNBz1zQrb", "oWAxZDx7w5VEj9dCyTzz",
  "onwK4e9ZLuTAKqWW03F9", "pFZP5JQG7iQjIQuC4Bku", "piTKgcLEGmPE4e6mEKli", "pNInz6obpgDQGcFmaJgB",
  "pqHfZKP75CvOlQylNhV4", "t0jbNlBVZ17f02VDIeMI", "yoZ06aMxZJJ28mfd3POQ", "z9fAnlkpzviPz146aGWa",
  "zcAOhNBS3c14rBihAFp1", "ThT5KcBeYPX3keUQqHPh",
  // legacy premade set — verified to speak before they were listed
  "29vD33N1CtxCmqQRPOHJ", "2EiwWnXFnvU5JabPnv8n", "5Q0t7uMcjvnagumLfvZi",
  "GBv7mTt0atIp3Br8iCZE", "pMsXgVXv3BLzUgSXRplE",
].map((v) => v.toLowerCase()));

/** Compare stock ids case-insensitively and with invisibles stripped: a lowercased paste
 *  (`21m00tcm4tlvdq8ikwam`) and an id carrying a stray zero-width character both used to
 *  slip past an exact-string Set and speak in a stock voice. */
function isStockVoiceId(id: string): boolean {
  return ELEVENLABS_STOCK_VOICE_IDS.has(id.replace(INVISIBLE_RE, "").trim().toLowerCase());
}

/** True when the demo is configured to speak in a voice we actually chose.
 *
 *  `TTS_ADAPTER` must be set explicitly. Relying on inference is what makes the silent
 *  `onyx` substitution possible, and the whole point of the demo's voice is that it is the
 *  Founder's designed Khalid — a different voice is not a degraded demo, it is a wrong one. */
export function demoVoiceProviderPinned(): boolean {
  const pinned = envTrim("TTS_ADAPTER").toLowerCase();
  if (pinned === "elevenlabs") {
    const voiceId = envTrim("ELEVENLABS_VOICE_ID");
    if (!envTrim("ELEVENLABS_API_KEY") || !voiceId) return false;
    if (isStockVoiceId(voiceId)) return false;
    // REFUSE A MODEL WE CANNOT PRICE. ttsCostUsd() returns 0 for an unknown provider:model,
    // so an unrecognised ELEVENLABS_TTS_MODEL does not merely cost more — it reports its
    // cost as ZERO, and the demo's spend goes invisible to lib/monitoring/sweep.ts again.
    // One env var must not be able to blind the only spend monitor there is.
    const model = envTrim("ELEVENLABS_TTS_MODEL") || "eleven_flash_v2.5";
    if (!TTS_RATE_PER_CHAR[`elevenlabs:${model}`]) return false;
    return true;
  }
  // `mock` is pinned on purpose in tests and local runs; it produces no provider cost and
  // no wrong voice, because it produces no voice.
  return pinned === "mock";
}

/** Does the synthesis we got back actually come from the provider AND the voice we pinned?
 *  Takes the result rather than reading env, so a proof can hand it a lying adapter. */
export function voiceMatchesPin(
  result: { adapter?: string | null; voiceId?: string | null },
  pinnedVoiceId: string
): boolean {
  if (result.adapter !== "elevenlabs") return false;
  return (result.voiceId ?? "") === pinnedVoiceId;
}

/** The demo route's mapping from a completed turn to the hard-zero signals, as a PURE
 *  function so a proof can drive it with an emergency-shaped outcome.
 *
 *  It lives here rather than inline in the route because inline it was checkable only by
 *  regexes on identifiers: replacing the whole argument object with four constants
 *  (`stopReason: "end_turn", escalate: false, model: "claude", orderNumber: null`) left
 *  every assertion matching and the full suite green, while an active-anaphylaxis reply —
 *  ambulance number and all — was synthesized and played to the visitor. */
export function demoVoiceSignalsFor(
  turn: { stopReason?: string | null; escalate?: boolean | null; model?: string | null },
  closed: { orderNumber?: string | null }
): VoiceTurnSignals {
  return voiceSignalsForTurn({
    stopReason: turn.stopReason,
    escalate: turn.escalate,
    model: turn.model,
    orderNumber: closed.orderNumber ?? null,
  });
}


/** Synthesize the demo's spoken reply, or explain why it stayed silent. Never throws. */
export async function demoVoiceReply(
  replyText: string,
  opts?: { inboundWasVoice?: boolean; safetyHold?: boolean; isReceipt?: boolean }
): Promise<DemoVoiceOut> {
  const none = (skipped: DemoVoiceOutSkip): DemoVoiceOut =>
    ({ audioBase64: null, mime: null, skipped, spend: null });

  // Defaulted rather than destructured: the docstring promises this never throws, and a
  // missing argument used to make it throw on property access.
  const o = opts ?? {};

  // Speak only when spoken to. A voice note back to a typed message is not what WhatsApp
  // does and not what a visitor expects.
  if (o.inboundWasVoice !== true) return none("not_triggered");

  const text = String(replyText ?? "").trim();
  if (!text || !text.replace(INVISIBLE_RE, "").trim()) return none("empty");
  if (text.length > DEMO_TTS_MAX_CHARS) return none("too_long");

  // HARD-ZERO SUPPRESSION, before any provider is reached — so a suppressed turn also
  // costs nothing. Safety first, then receipt, then a payment link, then a money figure.
  // The visitor still gets the full text either way.
  const hardZero = voiceHardZeroReason(text, {
    safetyHold: o.safetyHold === true,
    isReceipt: o.isReceipt === true,
  });
  if (hardZero) return none(hardZero);

  if (!demoVoiceProviderPinned()) return none("provider_unpinned");

  const adapter = getTtsAdapter();
  // A pinned `mock` is a deliberate no-voice configuration, not a failure — say so, rather
  // than logging a cause that is not true.
  if (adapter.name === "mock") return none("mock_pinned");

  // PASS THE ID WE VALIDATED, and below, verify the one that came back. Calling
  // synthesize(text) with no options left the adapter to re-read ELEVENLABS_VOICE_ID
  // itself, so the value checked here and the value actually spoken were never the same
  // value — a default injected in the adapter shipped ElevenLabs' stock "Rachel" to a
  // visitor with skipped:null and every proof green.
  const pinnedVoiceId = envTrim("ELEVENLABS_VOICE_ID");
  let result;
  try {
    result = await adapter.synthesize(text, { voiceId: pinnedVoiceId });
  } catch {
    // No fallback is attempted, and none is bought. On WhatsApp falling back to onyx is
    // right — a customer waiting on an order is better served by any voice than silence.
    // On a sales page the voice IS the thing being demonstrated, so the wrong one is worse
    // than none, and the visitor still has the full text reply either way.
    return none("synth_failed");
  }
  if (!result?.audio?.length) return none("synth_failed");

  // THE PROVIDER'S OWN ACCOUNT OF ITSELF, checked after the fact. getTtsAdapter() is a
  // shared file on the WhatsApp path; asserting only what we ASKED for left the demo's
  // whole voice guarantee resting on a file no demo proof reads.
  // A refusal AFTER a synthesis still cost money — carry the spend so the ledger sees it.
  const spentAnyway = {
    costUsd: result.costUsd, chars: result.chars,
    model: result.model, adapter: result.adapter,
  };
  const refuse = (why: DemoVoiceOutSkip): DemoVoiceOut =>
    ({ audioBase64: null, mime: null, skipped: why, spend: spentAnyway });

  // THE PROVIDER *AND* THE VOICE. Right company, wrong person is still a stranger reading
  // Najdi Arabic to a prospect. Exported as a pure function because inline it was
  // untestable: no configuration a proof can reach makes the adapter's own env fallback
  // differ from the value we pass, so deleting the whole round trip left the suite green.
  if (!voiceMatchesPin(result, pinnedVoiceId)) return refuse("wrong_voice");

  return {
    audioBase64: Buffer.from(result.audio).toString("base64"),
    mime: result.mime,
    skipped: null,
    spend: {
      costUsd: result.costUsd,
      chars: result.chars,
      model: result.model,
      adapter: result.adapter,
    },
  };
}
