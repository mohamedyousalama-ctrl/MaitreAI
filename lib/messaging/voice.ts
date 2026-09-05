// ============================================================================
// MaitreAI — WhatsApp voice note → transcript (Sprint 9, S9-6) — SERVER ONLY
// Download the voice note media, run it through the env-selected STT adapter,
// and return the transcript + cost. In test mode (no WhatsApp creds) the media
// download is skipped and the mock adapter still yields a deterministic
// transcript, so the full path works without spend.
// ============================================================================

import "server-only";
import { downloadWhatsAppMedia } from "./adapters/whatsapp";
import { assertMockSttAllowed } from "@/lib/ai/stt/guard";
import { getSttAdapter, type SttResult } from "@/lib/ai/stt";
import type { SttAdapter, SttTranscribeOptions } from "@/lib/ai/stt/types";
import { isEmptyTranscript, transcribeWithFallback } from "@/lib/ai/stt/fallback";
import { buildSttPromptVocab } from "@/lib/ai/voice-quality";

export const VOICE_STT_UNAVAILABLE_TRANSCRIPT = "[رسالة صوتية — التفريغ الصوتي غير متاح حاليًا]";

/**
 * Transcribe with the configured engine, and if it returns NO WORDS, give the same bytes
 * to a second engine once.
 *
 * WHY THIS SITS HERE AND NOT IN EITHER CALLER. Both public voice paths — the WhatsApp
 * webhook and the demo call screen — end in `adapter.transcribe(...)`, and both turn an
 * empty transcript into a dead turn: the webhook falls back to the "transcription
 * unavailable" text, the demo route returns 422 and the caller hears nothing. One seam
 * means one behaviour, and no third surface can be added later that quietly lacks it.
 *
 * SPEND IS SUMMED, NOT REPLACED. The turn really did pay for two transcriptions, and
 * lib/monitoring/sweep.ts adds `agent_runs.cost_usd` up for the daily spend alert — so
 * reporting only the second engine's bill would under-count real money on the one surface
 * anyone on the internet can call. `model` and `adapter` name the engine whose WORDS were
 * used, because that is what the row is describing.
 *
 * A recovered turn costs exactly two provider calls; a turn that produced words on the
 * first attempt costs one and never enters the fallback at all.
 */
async function transcribeWithSecondEngine(
  adapter: SttAdapter,
  bytes: Buffer,
  opts: SttTranscribeOptions
): Promise<SttResult> {
  const primary = await adapter.transcribe(bytes, opts);
  if (!isEmptyTranscript(primary)) return primary;
  const recovered = await transcribeWithFallback(adapter.name, bytes, opts);
  if (!recovered) return primary;
  return { ...recovered, costUsd: (primary.costUsd || 0) + (recovered.costUsd || 0) };
}

/**
 * Transcribe audio the caller already holds, rather than a WhatsApp media id.
 *
 * `transcribeWhatsAppVoice` is media-id bound: it calls `downloadWhatsAppMedia`
 * first. A browser recording has BYTES, not an id, so the public demo could not
 * use it. Everything below the download was already byte-based and unchanged —
 * this is that half, extracted, so both callers share one STT path and one guard.
 *
 * The mock guard is kept deliberately: `lib/ai/stt/mock.ts` returns a FIXED
 * invented Arabic sentence, so a mock transcript would make the agent appear to
 * understand someone who said something entirely different. Failing loudly is the
 * only honest behaviour on a public surface.
 */
export async function transcribeAudioBytes(
  bytes: Buffer,
  mimeHint?: string,
  menuItemNames?: Array<string | null | undefined>,
  priorityTerms?: Array<string | null | undefined>
): Promise<SttResult> {
  const adapter = getSttAdapter();
  if (adapter.name === "mock") assertMockSttAllowed("transcribeAudioBytes");
  const prompt = buildSttPromptVocab(menuItemNames ?? [], 200, priorityTerms);
  return transcribeWithSecondEngine(adapter, bytes, {
    mimeType: mimeHint || "audio/ogg",
    languageHint: "ar",
    prompt: prompt || undefined,
  });
}

export async function transcribeWhatsAppVoice(
  mediaId: string,
  mimeHint?: string,
  // WO-VOICE-QUALITY (b) — the tenant's menu item names, used to seed the STT prompt
  // bias. Optional/back-compat: absent → the generic ordering words alone.
  menuItemNames?: Array<string | null | undefined>,
  // WO-VOICE-ALIASES — state-aware priority terms (the expected answer-class words when
  // the last AI turn asked for a quantity/size/sauce); front-loaded into the prompt bias.
  priorityTerms?: Array<string | null | undefined>
): Promise<SttResult> {
  const adapter = getSttAdapter();
  if (adapter.name === "mock") assertMockSttAllowed("transcribeWhatsAppVoice");
  const media = await downloadWhatsAppMedia(mediaId);
  const bytes = media?.bytes ?? Buffer.from([]);
  const mime = media?.mime ?? mimeHint ?? "audio/ogg";
  const prompt = buildSttPromptVocab(menuItemNames ?? [], 200, priorityTerms);
  return transcribeWithSecondEngine(adapter, bytes, { mimeType: mime, languageHint: "ar", prompt: prompt || undefined });
}
