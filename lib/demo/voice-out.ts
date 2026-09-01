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
import { lookupVoice, voiceMatchesPin } from "@/lib/ai/tts/voice-registry";
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

/** THE VOICE IS ALLOW-LISTED, NOT DENY-LISTED — see lib/ai/tts/voice-registry.ts.
 *
 *  This used to be a 50-entry list of ElevenLabs' STOCK voice ids, and its own comment was
 *  honest about the limit: "it catches the LIKELY paste error, not every wrong voice." A
 *  wrong CUSTOM id — the quarantined `Khalid Demo`, `Saad`, or any of the historical
 *  objects KIV-95 has not finished inventorying — passed it and spoke.
 *
 *  KIV-313 closed that hole by naming exactly one voice. An allow list of one refuses every
 *  stock id (none is registered) AND every historical id, including the ones nobody has
 *  written down yet, which is the set a deny list can never cover. The old list is gone
 *  rather than kept alongside, because a guard that no longer decides anything still reads
 *  like a guard, and the next person to touch this file should not have to work out which
 *  of the two is load-bearing.
 *
 *  The residual risk the old comment recorded is now CLOSED for the wrong-custom-id case:
 *  a mis-copied id is refused before the network, without a provider round trip. */

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
    // Only a registered voice may speak. Stock ids, quarantined ids and typos all land here.
    const voice = lookupVoice(voiceId);
    if (!voice) return false;
    // THE MODEL THIS CHECK PRICES MUST BE THE MODEL THE ADAPTER SENDS. It used to read
    // ELEVENLABS_TTS_MODEL with its own default of "eleven_flash_v2.5" while the adapter
    // read the same var with the same default — two copies of one decision, which is how
    // they drift. The registry now owns it, and an env value that DISAGREES is refused
    // here exactly as the adapter refuses it, so a mismatch fails closed in both places
    // instead of the pin approving a configuration the adapter will then reject.
    const requested = envTrim("ELEVENLABS_TTS_MODEL");
    if (requested && requested !== voice.model) return false;
    // REFUSE A MODEL WE CANNOT PRICE. ttsCostUsd() returns 0 for an unknown provider:model,
    // so an unrecognised model does not merely cost more — it reports its cost as ZERO, and
    // the demo's spend goes invisible to lib/monitoring/sweep.ts again. One env var must
    // not be able to blind the only spend monitor there is.
    if (!TTS_RATE_PER_CHAR[`elevenlabs:${voice.model}`]) return false;
    return true;
  }
  // `mock` is pinned on purpose in tests and local runs; it produces no provider cost and
  // no wrong voice, because it produces no voice.
  return pinned === "mock";
}

/** Can this surface actually PRODUCE A SOUND right now?
 *
 *  Not the same question as demoVoiceProviderPinned(), and conflating them shipped a lie.
 *  That function answers "is the configuration deliberate", and it says YES for `mock` —
 *  correctly, because a pinned mock is a considered choice rather than a misconfiguration.
 *  But the mock produces NO AUDIO. The demo's capability probe used it as "can speak", so
 *  with TTS_ADAPTER=mock the call screen opened, listened, thought, and went silent — and
 *  then told the visitor that safety/money/receipt rules were why. On a reply reading
 *  «تمام، كبسة دجاج وحدة 👍», which contains no allergen, no amount and no receipt.
 *
 *  That is a fabricated demonstration of the one guarantee this page exists to sell, on
 *  every turn. The probe must ask THIS question instead. */
export function demoVoiceAudible(): boolean {
  return demoVoiceProviderPinned() && envTrim("TTS_ADAPTER").toLowerCase() !== "mock";
}

/** Why a turn produced no audio, in the only two shapes a VISITOR should be told apart:
 *  a deliberate product rule, or the voice not working. Deliberately coarse — a public
 *  page has no business learning which env var is wrong.
 *
 *  The distinction is not cosmetic. A rule-based silence means "keep going, this reply is
 *  text on purpose"; a provider failure means "the voice is not working, stop pretending
 *  to be a call". Collapsing them made every provider failure display the safety-rule
 *  explanation and kept the loop running, uploading a fresh clip each turn. */
export function demoVoiceSilenceKind(skipped: DemoVoiceOutSkip | null): "none" | "rule" | "unavailable" {
  if (!skipped) return "none";
  if (skipped === "safety_hold" || skipped === "money_figure" ||
      skipped === "payment_link" || skipped === "receipt") return "rule";
  // `too_long` sits here rather than under "rule": the visitor cannot tell it from a
  // failure, and describing a length cap as a safety guarantee is the same false claim.
  return "unavailable";
}

/** Re-exported from the registry, which owns the question. It moved there when the LIVE
 *  WhatsApp path needed the same check: `TTS_ADAPTER=openai` was an accepted value, so an
 *  operator could get `onyx` transmitted to a real customer with a correct voice id sitting
 *  beside it and no alert. The live path must not import a demo module to ask that. */
export { voiceMatchesPin } from "@/lib/ai/tts/voice-registry";


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
  // THE CANONICAL ID, not what was typed. The adapter now puts the registry's spelling on
  // the wire and echoes that back, so comparing against the raw env value made a correct
  // id with a zero-width character — the exact paste the registry tolerates on purpose —
  // BUY a synthesis and then discard it as `wrong_voice`, every turn, forever.
  const pinnedVoiceId = lookupVoice(envTrim("ELEVENLABS_VOICE_ID"))?.voiceId ?? "";
  let result;
  try {
    // MP3, NOT OGG OPUS. This is a BROWSER, and Safari cannot decode Ogg Opus — so the
    // previous default produced a successful synthesis, delivered bytes, an empty log and
    // total silence for every Safari, iPhone and iPad visitor, which on a page built to be
    // shown to restaurant owners on their phones is most of them. WhatsApp keeps Ogg Opus,
    // which is what a voice note there must be; the format is now per-caller.
    result = await adapter.synthesize(text, { voiceId: pinnedVoiceId, format: "mp3" });
  } catch (e) {
    // SAY WHY, NOT JUST THAT. This `catch` took no binding and discarded the error, so a
    // failed activation produced exactly one line — `reason: 'synth_failed'` — for a revoked
    // key, a plan without the pinned model, a pronunciation dictionary the account cannot
    // reach, an output format above the tier, and an exhausted quota alike. Five different
    // fixes behind one indistinguishable word, on the surface a prospect is watching.
    //
    // The live WhatsApp path was given this exact treatment already (`[voice] … synthesis
    // produced nothing — text-only`, with what to check); the demo, which is the surface
    // that gets configured FIRST and therefore fails first, was left guessing.
    //
    // The adapter's message is safe to print: it is either our own refusal text or the
    // provider's response body, which never echoes the key. Clipped and flattened anyway,
    // because it reaches a log and an unbounded provider payload is a 4KB log line.
    const why = (e instanceof Error ? e.message : String(e)).replace(/[\r\n\t]+/g, " ");
    console.warn(`[demo/voice] synthesis threw: ${why.slice(0, 300)}`);
    // No fallback is attempted, and none is bought. On WhatsApp falling back to onyx is
    // right — a customer waiting on an order is better served by any voice than silence.
    // On a sales page the voice IS the thing being demonstrated, so the wrong one is worse
    // than none, and the visitor still has the full text reply either way.
    return none("synth_failed");
  }
  if (!result?.audio?.length) {
    // A DIFFERENT FAULT WITH THE SAME NAME. The provider answered 2xx and handed back an
    // empty body; distinguished here so the log does not send someone hunting a key that
    // is fine.
    console.warn(`[demo/voice] synthesis returned no audio (adapter=${result?.adapter ?? "none"}, model=${result?.model ?? "none"})`);
    return none("synth_failed");
  }

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
