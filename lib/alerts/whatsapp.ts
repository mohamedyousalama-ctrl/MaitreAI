// ============================================================================
// MaitreAI — critical-alert WhatsApp channel (Q1). A REAL out-of-band channel:
// a concise WhatsApp message to the Kivo admin whenever a critical alert fires,
// so a live failure is seen even with no manager watching the console.
//
// Reuses the existing hardened send path (lib/messaging/outbound → adapter →
// Graph API) — no new HTTP/provider dependency. SENDER: the platform/env-
// configured WhatsApp number, pinned via runWithWhatsAppCreds(null) so the alert
// is NOT sent from whatever per-tenant override may be active in the current
// request (e.g. a webhook). RECIPIENT: ALERT_WHATSAPP_TO (configurable; no-op when
// unset). Best-effort + non-throwing; the caller logs loudly on failure (Q3) and
// never lets an alert-send failure break the request path.
//
// WhatsApp window note: an alert is a BUSINESS-INITIATED message to the admin, so
// outside the admin's 24h customer-service window Meta rejects free-form text and
// requires an approved template. For the pilot, the admin keeps a thread open by
// messaging the number; we do NOT pass a window pre-check here — we attempt the
// send and let Meta gate it, surfacing any rejection to the loud log.
// ============================================================================

import "server-only";
import { sendWhatsAppText } from "@/lib/messaging/outbound";
import { runWithWhatsAppCreds } from "@/lib/messaging/creds-context";

export interface AlertWhatsAppPayload {
  type: string;
  detail: string;
  restaurantName: string | null;
  restaurantId: string;
  conversationId?: string | null;
  at: string; // ISO timestamp
}

export interface AlertWhatsAppResult {
  sent: boolean;
  reason?: string;
}

/** Admin recipient from ALERT_WHATSAPP_TO (E.164, no '+'/spaces as Meta expects).
 *  Empty when unset → the channel is a clean no-op. */
export function alertWhatsAppRecipient(): string {
  return (process.env.ALERT_WHATSAPP_TO ?? "").trim();
}

/** Send a critical-alert WhatsApp to the configured admin. Never throws; returns
 *  a result the caller logs. No-op (reason:"no_recipient") when ALERT_WHATSAPP_TO
 *  is unset. */
export async function sendAlertWhatsApp(p: AlertWhatsAppPayload): Promise<AlertWhatsAppResult> {
  const to = alertWhatsAppRecipient();
  if (!to) return { sent: false, reason: "no_recipient" };

  const place = p.restaurantName || p.restaurantId;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const lines = [
    "🚨 Kivo — تنبيه حرج",
    `النوع: ${p.type}`,
    `المطعم: ${place}`,
    `التفاصيل: ${p.detail}`,
  ];
  if (p.conversationId) lines.push(`محادثة: ${p.conversationId}`);
  if (base) lines.push(`🔗 ${base}/conversations`);
  lines.push(p.at);
  const text = lines.join("\n");

  // Force the platform/env sender (null = no per-tenant override → env creds), and
  // omit lastInboundAtMs so OUR window pre-check is skipped (Meta still gates it).
  const res = await runWithWhatsAppCreds(null, () => sendWhatsAppText({ to, text }));
  if (res.status === "sent") return { sent: true };
  return { sent: false, reason: `${res.status}${res.error ? `:${res.error}` : ""}` };
}
