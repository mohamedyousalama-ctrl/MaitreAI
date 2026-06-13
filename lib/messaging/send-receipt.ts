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
import { sendWhatsAppImage } from "./outbound";

export interface SendReceiptResult {
  status: "sent" | "skipped" | "failed" | "no_phone" | "order_not_found";
  error?: string;
}

export async function sendReceiptToCustomer(client: SupabaseClient, orderId: string): Promise<SendReceiptResult> {
  const data = await loadReceiptData(client, orderId);
  if (!data) return { status: "order_not_found" };
  if (!data.customerPhone) return { status: "no_phone" };

  // Conversation (for the timeline note + 24h-window timestamp).
  const { data: order } = await client.from("orders").select("conversation_id, restaurant_id").eq("id", orderId).single();
  const conversationId = (order?.conversation_id as string | null) ?? null;
  const restaurantId = (order?.restaurant_id as string | null) ?? null;

  let lastInboundAtMs: number | undefined;
  if (conversationId) {
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
    await client.from("messages").insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      direction: "outbound",
      sender: "system",
      text: note,
      status: "sent",
      meta: { kind: "receipt", orderId, sendStatus: send.status },
    });
  }

  if (send.status === "sent") return { status: "sent" };
  if (send.status === "skipped") return { status: "skipped" };
  return { status: "failed", error: send.error };
}
