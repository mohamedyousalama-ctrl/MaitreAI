// ============================================================================
// MaitreAI — WhatsApp voice note → transcript (Sprint 9, S9-6) — SERVER ONLY
// Download the voice note media, run it through the env-selected STT adapter,
// and return the transcript + cost. In test mode (no WhatsApp creds) the media
// download is skipped and the mock adapter still yields a deterministic
// transcript, so the full path works without spend.
// ============================================================================

import "server-only";
import { downloadWhatsAppMedia } from "./adapters/whatsapp";
import { getSttAdapter, type SttResult } from "@/lib/ai/stt";
import { buildSttPromptVocab } from "@/lib/ai/voice-quality";

export async function transcribeWhatsAppVoice(
  mediaId: string,
  mimeHint?: string,
  // WO-VOICE-QUALITY (b) — the tenant's menu item names, used to seed the STT prompt
  // bias. Optional/back-compat: absent → the generic ordering words alone.
  menuItemNames?: Array<string | null | undefined>
): Promise<SttResult> {
  const adapter = getSttAdapter();
  const media = await downloadWhatsAppMedia(mediaId);
  const bytes = media?.bytes ?? Buffer.from([]);
  const mime = media?.mime ?? mimeHint ?? "audio/ogg";
  const prompt = buildSttPromptVocab(menuItemNames ?? []);
  return adapter.transcribe(bytes, { mimeType: mime, languageHint: "ar", prompt: prompt || undefined });
}
