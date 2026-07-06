// ============================================================================
// Kivo (KSA) — WO-PAYLINK-MSG: the customer-facing payment-link message.
// Composed + sent on session-create success (the operator triggers a link; the
// CUSTOMER receives this on WhatsApp). Carries the order #, the VAT-inclusive
// total in ر.س, the 15-min expiry, and the anti-phishing safety line.
//
// SERVER ONLY. The composer is pure (node-testable); the send helper takes an
// injected admin (service-role) client and binds the tenant's OWN WhatsApp creds
// (never the global/Wesaya number) via runWithTenantWhatsAppCreds.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantWhatsAppEnvById } from "@/lib/db/restaurants";
import { runWithWhatsAppCreds } from "@/lib/messaging/creds-context";
import { sendWhatsAppText } from "@/lib/messaging/outbound";
import { payLinkMessage } from "@/lib/payments/paylink-message";

export { payLinkMessage };

export interface PayLinkSendResult {
  sent: boolean;
  reason?: string;
}

/**
 * Send the pay-link message to the order's customer. BEST-EFFORT — never throws;
 * a send failure must not fail the link creation (the payUrl is already returned
 * to the operator). `admin` MUST be a service-role client (reads customer phone
 * + binds the tenant's encrypted WhatsApp creds).
 */
export async function sendPayLink(
  admin: SupabaseClient,
  restaurantId: string,
  orderId: string,
  payUrl: string
): Promise<PayLinkSendResult> {
  const { data: o } = await admin
    .from("orders")
    .select("order_number, total, restaurants(name), customers(phone)")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!o) return { sent: false, reason: "order_not_found" };

  const phone = (o.customers as { phone?: string } | null)?.phone ?? "";
  if (!phone) return { sent: false, reason: "no_phone" };

  // TENANT-OWNED SENDER ONLY (Codex P1 / standing rule): a customer pay-link must
  // go out from the TENANT's own WhatsApp number, never the global/Wesaya number.
  // Resolve the tenant's creds explicitly and SKIP if absent — do NOT use the
  // env-fallback wrapper (runWithTenantWhatsAppCreds), which would send from the
  // global creds when the tenant has none.
  const env = await resolveTenantWhatsAppEnvById(admin, restaurantId);
  if (!env) return { sent: false, reason: "tenant_wa_not_configured" };

  const text = payLinkMessage({
    restaurantName: (o.restaurants as { name?: string } | null)?.name ?? "",
    orderNumber: String((o as { order_number?: unknown }).order_number ?? ""),
    total: Number((o as { total?: unknown }).total ?? 0),
    payUrl,
  });

  try {
    const r = await runWithWhatsAppCreds(env, () => sendWhatsAppText({ to: phone, text }));
    return { sent: r.status === "sent", reason: r.status === "sent" ? undefined : r.status };
  } catch (e) {
    console.error("[paylink] send failed (non-blocking):", e);
    return { sent: false, reason: "send_error" };
  }
}
