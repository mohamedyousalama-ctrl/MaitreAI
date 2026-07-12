// ============================================================================
// MaitreAI — WO-VOICE-DEEPGRAM-SPIKE first duty: archive the golden voice clips.
// SERVER ONLY. Closed by default (no CRON_SECRET → 401), same posture as the cron
// routes. Accepts BOTH:
//   • Vercel Cron  → GET  with `Authorization: Bearer $CRON_SECRET`.
//   • Manual/admin → POST with `x-cron-secret: $CRON_SECRET`.
//
// Downloads every voice clip in the golden conversations via the EXISTING WhatsApp
// adapter (no new credential path) and uploads each to the private `voice-golden-set`
// bucket keyed by message-id, then writes a manifest.json (message-id, audio_id,
// duration, sha256, size, golden flag, archived_at). Idempotent (upsert) so a re-run
// after a partial failure simply re-archives. Runs in PRODUCTION where the WhatsApp
// token lives — the archive is the only expiring asset in the spike.
//
// Body (optional, all default to the golden constants):
//   { conversationIds?: string[], dryRun?: boolean }
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadWhatsAppMedia } from "@/lib/messaging/adapters/whatsapp";
import {
  GOLDEN_BUCKET, GOLDEN_CONVERSATION_IDS, buildManifestEntry, isGoldenMessage,
  type GoldenManifestEntry,
} from "@/lib/voice/golden-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Closed by default. True only when CRON_SECRET is set AND the request presents it as
 *  `Authorization: Bearer <secret>` (Vercel Cron) OR `x-cron-secret: <secret>` (manual). */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization");
  if (bearer && bearer === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

interface VoiceRow {
  id: string;
  conversation_id: string;
  meta: { audio_id?: string; duration?: number; stt_confidence?: number } | null;
}

async function archive(conversationIds: string[], dryRun: boolean): Promise<NextResponse> {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data, error } = await admin
    .from("messages")
    .select("id, conversation_id, meta")
    .in("conversation_id", conversationIds)
    .eq("meta->>voice", "true");
  if (error) return NextResponse.json({ error: "query_failed", detail: error.message }, { status: 500 });

  const rows = ((data ?? []) as VoiceRow[]).filter((r) => r.meta?.audio_id);
  const archivedAt = new Date().toISOString();
  const manifest: GoldenManifestEntry[] = [];
  const failures: Array<{ messageId: string; audioId: string; reason: string }> = [];

  for (const row of rows) {
    const audioId = String(row.meta!.audio_id);
    if (dryRun) {
      manifest.push({
        messageId: row.id, conversationId: row.conversation_id, audioId,
        objectKey: `${row.id}.ogg`, mime: "audio/ogg", sizeBytes: 0, sha256: "",
        durationSec: row.meta?.duration ?? null, sttConfidence: row.meta?.stt_confidence ?? null,
        golden: isGoldenMessage(row.id), archivedAt,
      });
      continue;
    }
    const media = await downloadWhatsAppMedia(audioId);
    if (!media || media.bytes.byteLength === 0) {
      failures.push({ messageId: row.id, audioId, reason: media ? "empty_media" : "download_failed" });
      continue;
    }
    const entry = buildManifestEntry({
      messageId: row.id, conversationId: row.conversation_id, audioId,
      bytes: media.bytes, mime: media.mime,
      durationSec: row.meta?.duration ?? null, sttConfidence: row.meta?.stt_confidence ?? null,
      archivedAt,
    });
    const up = await admin.storage.from(GOLDEN_BUCKET).upload(entry.objectKey, media.bytes, {
      contentType: entry.mime, upsert: true,
    });
    if (up.error) {
      failures.push({ messageId: row.id, audioId, reason: `upload_failed: ${up.error.message}` });
      continue;
    }
    manifest.push(entry);
  }

  // Write the manifest (unless a dry-run) so the harness + verification read one artifact.
  if (!dryRun) {
    const body = JSON.stringify(
      { bucket: GOLDEN_BUCKET, archivedAt, conversationIds, count: manifest.length,
        goldenCount: manifest.filter((m) => m.golden).length, entries: manifest, failures },
      null, 2,
    );
    await admin.storage.from(GOLDEN_BUCKET).upload("manifest.json", Buffer.from(body, "utf8"), {
      contentType: "application/json", upsert: true,
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    dryRun,
    conversations: conversationIds.length,
    found: rows.length,
    archived: manifest.length,
    golden: manifest.filter((m) => m.golden).length,
    failures,
  });
}

async function run(req: Request, method: "GET" | "POST"): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let conversationIds = [...GOLDEN_CONVERSATION_IDS];
  let dryRun = false;
  if (method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { conversationIds?: string[]; dryRun?: boolean };
    if (Array.isArray(body.conversationIds) && body.conversationIds.length > 0) conversationIds = body.conversationIds;
    dryRun = body.dryRun === true;
  }
  return archive(conversationIds, dryRun);
}

export async function GET(req: Request) { return run(req, "GET"); }
export async function POST(req: Request) { return run(req, "POST"); }
