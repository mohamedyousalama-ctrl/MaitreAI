// ============================================================================
// MaitreAI — HX3 active handback resume — SERVER ONLY, session-authenticated.
// When staff returns a conversation to Karim and a customer message is waiting
// unanswered, trigger EXACTLY ONE Karim turn so the customer isn't left hanging
// (the normal respondAndSendWhatsApp path, post-HX1/HX2: human turns labeled,
// system notes excluded).
//
// HARD SAFETY BAIL (#87): never auto-resume a SYSTEM_HOLD / safety-held thread.
// The caller (returnToAi) gates on the pre-handback hold state (the operator's UI
// knows it); this route independently bails if it still observes SYSTEM_HOLD or
// is_safety_hold — fail-safe toward NOT resuming. A held thread only ever reaches
// AI_ACTIVE via a deliberate human release, so #87 (no AUTOMATIC release) holds.
//
// No double-send: the turn runs under withConversationLock (same mutex the webhook
// uses) and only fires when the latest real message is still an unanswered customer
// message — so a near-simultaneous inbound can't double-answer.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondAndSendWhatsApp } from "@/lib/messaging/respond-and-send";
import { runWithTenantWhatsAppCreds } from "@/lib/messaging/tenant-creds";
import { withConversationLock } from "@/lib/db/conversation-lock";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: conv } = await admin
    .from("conversations")
    .select("id, ownership_state, is_safety_hold")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const state = (conv as { ownership_state: string | null }).ownership_state;
  const held = (conv as { is_safety_hold: boolean | null }).is_safety_hold === true;

  // HARD SAFETY BAIL (#87) — never auto-resume a held thread.
  if (state === "SYSTEM_HOLD" || held) return NextResponse.json({ ok: true, skipped: "hold" });
  // Only the completed-handback posture (Karim now owns) is resumable here.
  if (state !== "AI_ACTIVE") return NextResponse.json({ ok: true, skipped: "not_ai_active" });

  // One turn, serialized by the per-conversation mutex; only if STILL pending.
  const out = await withConversationLock(admin, params.id, async () => {
    // "Pending" = the latest REAL (non-system) message is the customer's, with no
    // ai/human reply after it. System notes (incl. the handback note) are ignored.
    const { data: last } = await admin
      .from("messages")
      .select("sender")
      .eq("conversation_id", params.id)
      .in("sender", ["customer", "ai", "human"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if ((last as { sender?: string } | null)?.sender !== "customer") {
      return { skipped: "no_pending" as const };
    }
    // DRYRUN-2 (F1): bind the tenant's own WhatsApp creds for the resume turn's
    // sends (respondAndSendWhatsApp's outbound layer reads the bound override).
    // Null override when unconfigured → env fallback, byte-identical to today.
    const r = await runWithTenantWhatsAppCreds(admin, tenant.restaurantId, () =>
      respondAndSendWhatsApp(admin, tenant.restaurantId, params.id)
    );
    return { triggered: true as const, status: r.status };
  });

  return NextResponse.json({ ok: true, ...out });
}
