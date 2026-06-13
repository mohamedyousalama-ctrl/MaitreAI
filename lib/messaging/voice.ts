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

export async function transcribeWhatsAppVoice(mediaId: string, mimeHint?: string): Promise<SttResult> {
  const adapter = getSttAdapter();
  const media = await downloadWhatsAppMedia(mediaId);
  const bytes = media?.bytes ?? Buffer.from([]);
  const mime = media?.mime ?? mimeHint ?? "audio/ogg";
  return adapter.transcribe(bytes, { mimeType: mime, languageHint: "ar" });
}
