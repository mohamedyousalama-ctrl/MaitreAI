// ============================================================================
// MaitreAI — Operator WhatsApp send (Sprint 9, S9-1) — SERVER ONLY
// During takeover the operator's message must leave on the SAME transport the
// Brain uses. This session-authenticated route sends a human/operator message
// over the WhatsApp Cloud API and reconciles the already-persisted message row
// (status + channel_message_id). The access token is server-only; the client
// never sees it. RLS scopes every read/write to the caller's tenant.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { sendWhatsAppText } from "@/lib/messaging/outbound";
import { setOwnershipState } from "@/lib/db/ownership";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const restaurantId = tenant.restaurantId;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const conversationId = body.conversationId ? String(body.conversationId) : "";
  const messageId = body.messageId ? String(body.messageId) : null;
  const text = String(body.text ?? "").trim();
  if (!conversationId || !text) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Resolve recipient + channel (RLS scopes this to the operator's tenant).
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, channel, customers(phone)")
    .eq("id", conversationId)
    .single();
  if (!conv) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });

  // HANDOFF-HARDENING (Fix 2): the operator replying IS the takeover. Claim
  // ownership server-side (the source of truth) and reset the wait/idle clock,
  // so the AI silence-lock never depends on a slow/fire-and-forget client
  // takeover write — an inbound arriving between the operator's reply and that
  // client write can no longer see owner='ai' and let the Brain barge in. The AI
  // bridge re-reads owner on each inbound, so this flip is immediately honored.
  // Idempotent (owner is set to 'human' regardless); updated_at advances on every
  // operator reply so the idle timer restarts on real human activity. RLS scopes
  // this to the operator's tenant.
  // Ownership axis (spine Step 1): the takeover is a transition to HUMAN_ACTIVE.
  // Dual-writes the legacy owner field + advances the idle clock via `extra`.
  await setOwnershipState(supabase, conversationId, "HUMAN_ACTIVE", {
    extra: { owner: "human", updated_at: new Date().toISOString() },
  });

  if ((conv.channel as string) !== "whatsapp") {
    return NextResponse.json({ ok: true, skipped: "non_whatsapp_channel" });
  }
  const phone = (conv.customers as { phone?: string } | null)?.phone ?? "";

  // Last inbound timestamp → 24h-window gate.
  const { data: lastIn } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastInboundAtMs = lastIn?.created_at ? new Date(lastIn.created_at as string).getTime() : null;

  const send = await sendWhatsAppText({ to: phone, text, lastInboundAtMs });

  if (send.status === "sent") {
    if (messageId) {
      await supabase
        .from("messages")
        .update({ status: "sent", channel_message_id: send.externalMessageId ?? null })
        .eq("id", messageId);
    }
    return NextResponse.json({ ok: true, status: "sent" });
  }

  if (send.status === "skipped") {
    // Test mode (no credentials) — the message is already persisted locally.
    return NextResponse.json({ ok: true, status: "skipped" });
  }

  // Real failure — mark the row failed and note the timeline so it isn't silent.
  if (messageId) await supabase.from("messages").update({ status: "failed" }).eq("id", messageId);
  await supabase.from("messages").insert({
    restaurant_id: restaurantId,
    conversation_id: conversationId,
    direction: "outbound",
    sender: "system",
    text: `تعذّر إرسال رسالة الموظف عبر واتساب: ${send.error ?? "خطأ غير معروف"}.`,
    status: "sent",
    meta: { kind: "send_error", windowState: send.windowState },
  });
  const code = send.windowState === "out_of_window" ? "outside_24h_window" : "send_failed";
  return NextResponse.json({ ok: false, code, error: send.error }, { status: 502 });
}
