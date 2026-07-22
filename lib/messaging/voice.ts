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
import { buildSttPromptVocab } from "@/lib/ai/voice-quality";

export const VOICE_STT_UNAVAILABLE_TRANSCRIPT = "[رسالة صوتية — التفريغ الصوتي غير متاح حاليًا]";

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
  return adapter.transcribe(bytes, { mimeType: mime, languageHint: "ar", prompt: prompt || undefined });
}
