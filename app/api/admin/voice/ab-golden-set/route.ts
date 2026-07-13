// ============================================================================
// MaitreAI — WO-VOICE-DEEPGRAM-SPIKE: the LIVE A/B run. SERVER ONLY, closed by default
// (no CRON_SECRET → 401), Bearer (Vercel Cron) or x-cron-secret (manual admin) — same
// posture as the archival + cron routes. Runs every ARCHIVED golden clip through BOTH
// STT adapters (groq current vs deepgram Nova-3 + menu keyterms), reduces each to
// canonical slots, compares slot-by-slot (never characters), and writes ab-report.json
// to the voice-golden-set bucket. Evidence only — no adapter switch happens here.
//
// Needs GROQ_API_KEY + DEEPGRAM_API_KEY (both in Vercel) — runs in PRODUCTION.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { groqSttAdapter } from "@/lib/ai/stt/groq";
import { deepgramSttAdapter } from "@/lib/ai/stt/deepgram";
import { buildSttPromptVocab } from "@/lib/ai/voice-quality";
import { buildDeepgramKeyterms } from "@/lib/ai/stt/deepgram-keyterms";
import { GOLDEN_BUCKET } from "@/lib/voice/golden-archive";
import { buildAbEntry, summarizeAb, type AbClipEntry } from "@/lib/voice/ab-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization");
  if (bearer && bearer === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

interface ManifestEntry { messageId: string; conversationId: string; objectKey: string; mime: string; golden: boolean }

async function menuForConversation(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  cache: Map<string, string[]>
): Promise<string[]> {
  if (!admin) return [];
  const { data: conv } = await admin.from("conversations").select("restaurant_id").eq("id", conversationId).maybeSingle();
  const restaurantId = (conv as { restaurant_id?: string } | null)?.restaurant_id;
  if (!restaurantId) return [];
  if (cache.has(restaurantId)) return cache.get(restaurantId)!;
  const { data: items } = await admin.from("menu_items").select("name").eq("restaurant_id", restaurantId);
  const names = ((items ?? []) as Array<{ name?: string }>).map((i) => String(i.name ?? "")).filter(Boolean);
  cache.set(restaurantId, names);
  return names;
}

async function runAb(): Promise<NextResponse> {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const dl = await admin.storage.from(GOLDEN_BUCKET).download("manifest.json");
  if (dl.error || !dl.data) return NextResponse.json({ error: "no_manifest", detail: dl.error?.message }, { status: 404 });
  const manifest = JSON.parse(await dl.data.text()) as { entries?: ManifestEntry[] };
  const golden = (manifest.entries ?? []).filter((e) => e.golden);
  if (golden.length === 0) return NextResponse.json({ error: "no_golden_entries" }, { status: 404 });

  const menuCache = new Map<string, string[]>();
  const entries: AbClipEntry[] = [];
  const failures: Array<{ goldenId: string; reason: string }> = [];

  for (const g of golden) {
    try {
      const menu = await menuForConversation(admin, g.conversationId, menuCache);
      const prompt = buildSttPromptVocab(menu, 200);
      const keyterms = buildDeepgramKeyterms(menu);
      const blob = await admin.storage.from(GOLDEN_BUCKET).download(g.objectKey);
      if (blob.error || !blob.data) { failures.push({ goldenId: g.messageId, reason: `download: ${blob.error?.message}` }); continue; }
      const bytes = Buffer.from(await blob.data.arrayBuffer());
      const mime = g.mime || "audio/ogg";
      const [groq, deepgram] = await Promise.all([
        groqSttAdapter.transcribe(bytes, { mimeType: mime, languageHint: "ar", prompt }),
        deepgramSttAdapter.transcribe(bytes, { mimeType: mime, languageHint: "ar", keyterms }),
      ]);
      entries.push(buildAbEntry({
        goldenId: g.messageId, conversationId: g.conversationId, objectKey: g.objectKey, menuItemNames: menu,
        groq, deepgram,
      }));
    } catch (e) {
      failures.push({ goldenId: g.messageId, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const summary = summarizeAb(entries);
  const report = { bucket: GOLDEN_BUCKET, ranAt: new Date().toISOString(), summary, entries, failures };
  await admin.storage.from(GOLDEN_BUCKET).upload("ab-report.json", Buffer.from(JSON.stringify(report, null, 2), "utf8"), {
    contentType: "application/json", upsert: true,
  });

  return NextResponse.json({ ok: failures.length === 0, goldenClips: golden.length, compared: entries.length, summary, failures });
}

async function run(req: Request): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return runAb();
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
