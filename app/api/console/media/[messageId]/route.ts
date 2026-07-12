// ============================================================================
// WO-MEDIA-PROXY — token-authenticated, tenant-scoped read-only media proxy.
//
// The console's inbound photo bubble points its <img> at this route. Inbound
// customer images carry only a WhatsApp media-id (no public URL), so the browser
// cannot fetch them directly; this route resolves + streams the bytes on the
// operator's behalf. NOT public:
//   • requireTenant() — a valid console SESSION is mandatory (401/403 otherwise).
//   • the message is looked up scoped to the CALLER's restaurant_id, so a member
//     can never fetch media from another tenant, and only a media-id actually
//     attached to one of their messages is servable (no arbitrary media-id probing).
//   • only meta.image.id (inbound customer image) is proxied (resolveConsoleMediaId).
//   • any miss (no message / no id / download fails / test mode) → 404, and the
//     console's <img> onError falls back to the 📷 placeholder. Graceful by design.
//   • Cache-Control: private — never shared/CDN-cached across sessions.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { downloadWhatsAppMedia } from "@/lib/messaging/adapters/whatsapp";
import { resolveConsoleMediaId } from "@/lib/console-v2/console-media-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { messageId: string } }) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const messageId = (params.messageId ?? "").trim();
  if (!messageId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // Tenant-scoped lookup: the message MUST belong to the caller's restaurant.
  const { data: msg } = await admin
    .from("messages")
    .select("meta")
    .eq("id", messageId)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();

  const mediaId = resolveConsoleMediaId((msg as { meta?: unknown } | null)?.meta);
  if (!mediaId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const media = await downloadWhatsAppMedia(mediaId);
  if (!media) return NextResponse.json({ error: "unavailable" }, { status: 404 });

  return new Response(new Uint8Array(media.bytes), {
    status: 200,
    headers: {
      "Content-Type": media.mime,
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(media.bytes.length),
    },
  });
}
