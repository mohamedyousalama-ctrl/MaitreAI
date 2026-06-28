// ============================================================================
// MaitreAI — Send order receipt to the customer over WhatsApp (Sprint 9, S9-3)
// SERVER ONLY. Renders the receipt PNG from the DB order (numbers never from the
// LLM), uploads + sends it as a WhatsApp image, and records the outcome on the
// conversation timeline. Safe in test mode (skips delivery, never fakes it).
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadReceiptData } from "@/lib/render/load";
import { renderReceiptPng } from "@/lib/render/receipt";
import { sendWhatsAppImage, within24hWindow } from "./outbound";

export interface SendReceiptResult {
  status: "sent" | "skipped" | "failed" | "no_phone" | "order_not_found";
  // DLV3 — why a send was skipped (neutral, not a failure). DLV4 — already_sent = a
  // prior receipt was already sent/attempted for this order (fire-once).
  reason?: "no_conversation" | "no_window" | "test_mode" | "already_sent";
  // Operator-facing neutral message for the SKIP cases (printable fallback).
  message?: string;
  error?: string;
}

// The printable fallback note shown when WhatsApp delivery isn't possible — never
// a failure; the kitchen/customer receipt is still available via print.
const PRINTABLE = "الإيصال متاح بالطباعة";

/** DLV4 dedupe key + record helper: one receipt timeline row per order. */
async function recordReceiptTimeline(
  client: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  orderId: string,
  note: string,
  sendStatus: string
): Promise<void> {
  await client.from("messages").insert({
    restaurant_id: restaurantId,
    conversation_id: conversationId,
    direction: "outbound",
    sender: "system",
    text: note,
    status: "sent",
    meta: { kind: "receipt", orderId, sendStatus },
  });
}

export async function sendReceiptToCustomer(client: SupabaseClient, orderId: string): Promise<SendReceiptResult> {
  const data = await loadReceiptData(client, orderId);
  if (!data) return { status: "order_not_found" };
  if (!data.customerPhone) return { status: "no_phone" };

  // Conversation (for the timeline note + 24h-window timestamp).
  const { data: order } = await client.from("orders").select("conversation_id, restaurant_id").eq("id", orderId).single();
  const conversationId = (order?.conversation_id as string | null) ?? null;
  const restaurantId = (order?.restaurant_id as string | null) ?? null;

  // DLV4 — fire once. If a receipt was already SENT or skipped for this order, don't
  // re-fire (a genuine prior 'failed' may still be retried via the UI retry button).
  // Deduped on the receipt timeline row (meta.kind='receipt', meta.orderId). Only a
  // conversation-linked order records a row; a web order with no conversation never
  // does, but its skip below is side-effect-free so re-clicks are harmless.
  if (conversationId) {
    const { data: prior } = await client
      .from("messages")
      .select("meta")
      .eq("conversation_id", conversationId)
      .eq("meta->>kind", "receipt")
      .eq("meta->>orderId", orderId)
      .limit(1)
      .maybeSingle();
    const priorStatus = (prior?.meta as { sendStatus?: string } | null | undefined)?.sendStatus;
    if (priorStatus === "sent") return { status: "sent", reason: "already_sent" };
    if (priorStatus === "skipped") {
      return { status: "skipped", reason: "already_sent", message: `الإيصال اتجهّز قبل كده — ${PRINTABLE}.` };
    }
    // priorStatus === "failed" (or no prior row) → allow a (re)attempt below.
  }

  // DLV3 — a WhatsApp receipt needs a conversation with an OPEN 24h window. No
  // conversation (e.g. a web order) or a closed window is the NORMAL expected state,
  // not a failure → classify as a neutral SKIP (the receipt is still printable). A
  // genuine send error (window was open, the send broke) stays 'failed' below.
  if (!conversationId) {
    return { status: "skipped", reason: "no_conversation", message: `العميل مش على واتساب — ${PRINTABLE}.` };
  }

  let lastInboundAtMs: number | undefined;
  {
    const { data: lastIn } = await client
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastIn?.created_at) lastInboundAtMs = new Date(lastIn.created_at as string).getTime();
  }

  if (!within24hWindow(lastInboundAtMs)) {
    // Closed/absent 24h window → neutral skip (printable). Record a dedupe row so
    // re-clicks short-circuit via the DLV4 check above.
    if (restaurantId) {
      await recordReceiptTimeline(
        client,
        restaurantId,
        conversationId,
        orderId,
        `تم تجهيز إيصال الطلب ${data.orderNumber} — نافذة واتساب مقفولة، ${PRINTABLE}.`,
        "skipped"
      );
    }
    return { status: "skipped", reason: "no_window", message: `نافذة واتساب مقفولة — ${PRINTABLE}.` };
  }

  // Window is open → attempt the real send. A failure HERE is a genuine failure.
  const png = renderReceiptPng(data);
  const send = await sendWhatsAppImage({
    to: data.customerPhone,
    png,
    caption: `إيصال طلبك ${data.orderNumber} — بالعافية 🙏`,
    lastInboundAtMs,
  });

  // Record on the timeline (when we have a conversation to attach to).
  if (conversationId && restaurantId) {
    const note =
      send.status === "sent"
        ? `تم إرسال إيصال الطلب ${data.orderNumber} للعميل عبر واتساب.`
        : send.status === "skipped"
        ? `تم تجهيز إيصال الطلب ${data.orderNumber} (الوضع التجريبي — لم يُرسل فعلياً).`
        : `تعذّر إرسال إيصال الطلب ${data.orderNumber}: ${send.error ?? "خطأ"}.`;
    await recordReceiptTimeline(client, restaurantId, conversationId, orderId, note, send.status);
  }

  if (send.status === "sent") return { status: "sent" };
  if (send.status === "skipped") return { status: "skipped", reason: "test_mode", message: `الوضع التجريبي — ${PRINTABLE}.` };
  return { status: "failed", error: send.error };
}
