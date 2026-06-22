// ============================================================================
// MaitreAI — Driver location push (token-scoped, public) — SERVER ONLY.
// POST { lat, lng } — stores the latest point + breadcrumb trail. App-ready:
// a native driver app posts here on the same cadence. Honest by design: the
// driver page only posts WHILE OPEN with sharing on.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushLocationByToken } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const r = await pushLocationByToken(admin, params.token, lat, lng);
  if (!r.ok) {
    const code = r.error === "not_found" ? 404 : r.error === "completed" ? 410 : 400;
    return NextResponse.json({ error: r.error }, { status: code });
  }
  return NextResponse.json({ ok: true });
}
