// ============================================================================
// MaitreAI — the demo's SPOKEN reply.
//
// Khalid listens on the demo and has never spoken: `synthesizeVoiceReply` had exactly one
// caller in the repo, lib/messaging/respond-and-send.ts, the WhatsApp path. This module is
// the demo's half, and it exists as its own file because three things in the WhatsApp
// block are actively wrong on a PUBLIC page:
//
//   1. `recordCriticalAlert` on a TTS fallback — which EMAILS AND WHATSAPPS THE FOUNDER.
//      A stranger on a public page must never be able to page a human. That single line
//      is the highest-risk part of the WhatsApp block, and it is not copied here.
//   2. `sendWhatsAppAudio` — replaced by returning the audio in the HTTP response.
//   3. The per-conversation daily counters, which belong to a real tenant's billing.
//
// PROVIDER PINNING IS A SAFETY PROPERTY HERE, NOT A NICETY. getTtsAdapter() falls back
// silently: no ELEVENLABS_API_KEY plus a present OPENAI_API_KEY selects OpenAI `onyx`, an
// American male voice, with no error anywhere. On a sales page that means a prospect hears
// a stranger read Najdi Arabic and nobody finds out. The demo therefore refuses to speak
// at all unless the configured provider is the one we intend.
// ============================================================================

import "server-only";
import { getTtsAdapter, synthesizeVoiceReply } from "@/lib/ai/tts";

/** Hard ceiling on ONE spoken reply. TTS bills per character and this page is
 *  unauthenticated, so the cap is on the input, before a provider is ever called. Long
 *  replies fall back to text, which is a worse demo than a spoken one and a much better
 *  one than an unbounded bill. */
export const DEMO_TTS_MAX_CHARS = 600;

export type DemoVoiceOutSkip =
  | "not_triggered"      // the visitor typed; we answer in text
  | "provider_unpinned"  // see the pinning note above — refuse rather than guess a voice
  | "too_long"
  | "empty"
  | "synth_failed";

export interface DemoVoiceOut {
  /** base64 audio for the browser, or null with a reason the caller may log. */
  audioBase64: string | null;
  mime: string | null;
  skipped: DemoVoiceOutSkip | null;
}

/** True when the demo is configured to speak in a voice we actually chose.
 *
 *  `TTS_ADAPTER` must be set explicitly. Relying on inference is what makes the silent
 *  `onyx` substitution possible, and the whole point of the demo's voice is that it is the
 *  Founder's designed Khalid — a different voice is not a degraded demo, it is a wrong one. */
export function demoVoiceProviderPinned(): boolean {
  const pinned = (process.env.TTS_ADAPTER || "").toLowerCase();
  if (pinned === "elevenlabs") return !!process.env.ELEVENLABS_API_KEY && !!process.env.ELEVENLABS_VOICE_ID;
  // `mock` is pinned on purpose in tests and local runs; it produces no provider cost and
  // no wrong voice, because it produces no voice.
  return pinned === "mock";
}

/** Synthesize the demo's spoken reply, or explain why it stayed silent. Never throws. */
export async function demoVoiceReply(
  replyText: string,
  opts: { inboundWasVoice: boolean }
): Promise<DemoVoiceOut> {
  const none = (skipped: DemoVoiceOutSkip): DemoVoiceOut => ({ audioBase64: null, mime: null, skipped });

  // Speak only when spoken to. A voice note back to a typed message is not what WhatsApp
  // does and not what a visitor expects.
  if (!opts.inboundWasVoice) return none("not_triggered");

  const text = String(replyText ?? "").trim();
  if (!text) return none("empty");
  if (text.length > DEMO_TTS_MAX_CHARS) return none("too_long");
  if (!demoVoiceProviderPinned()) return none("provider_unpinned");

  // A pinned `mock` adapter is a deliberate no-voice configuration, not a failure.
  if (getTtsAdapter().name === "mock") return none("provider_unpinned");

  const out = await synthesizeVoiceReply(text);
  if (!out) return none("synth_failed");

  // A FALLBACK IS A REFUSAL HERE. synthesizeVoiceReply falls back to OpenAI onyx when
  // ElevenLabs fails; on WhatsApp that is right, because a customer waiting on an order
  // is better served by any voice than by silence. On a sales page the opposite holds:
  // the voice IS the thing being demonstrated, so the wrong one is worse than none, and
  // the visitor still has the full text reply either way.
  if (out.fellBack) return none("synth_failed");

  return {
    audioBase64: Buffer.from(out.result.audio).toString("base64"),
    mime: out.result.mime,
    skipped: null,
  };
}
