// ============================================================================
// MaitreAI — Order-status template send (Sprint 9, S9-4) — SERVER ONLY, FOUNDATION
// Ready send-path for the order_status_update template: resolve the order's
// customer phone + number and dispatch the approved template (works outside the
// 24h window). NOT auto-fired yet — Meta template approval is pending-owner on
// the verified account. Wire callers once the template is approved.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate } from "./outbound";
import { orderStatusUpdate } from "./templates";

export interface SendTemplateResult {
  status: "sent" | "skipped" | "failed" | "no_phone" | "order_not_found";
  error?: string;
}

export async function sendOrderStatusUpdate(
  client: SupabaseClient,
  orderId: string,
  status: string
): Promise<SendTemplateResult> {
  const { data: o } = await client
    .from("orders")
    .select("order_number, customers(phone)")
    .eq("id", orderId)
    .single();
  if (!o) return { status: "order_not_found" };
  const phone = (o.customers as { phone?: string } | null)?.phone ?? "";
  if (!phone) return { status: "no_phone" };

  const num = String(o.order_number ?? "");
  const orderNumber = num.startsWith("#") ? num : `#${num}`;
  const send = await sendWhatsAppTemplate(phone, orderStatusUpdate, { orderNumber, status });

  if (send.status === "sent") return { status: "sent" };
  if (send.status === "skipped") return { status: "skipped" };
  return { status: "failed", error: send.error };
}
