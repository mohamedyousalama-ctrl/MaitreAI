// ============================================================================
// MaitreAI — critical-alert email sender (SCAFFOLD — no provider wired yet).
//
// The codebase has NO email integration today (no Resend/SendGrid/Nodemailer/
// Postmark/SES, no email dependency in package.json). Per the build plan we do
// NOT pick a provider or fake a send. This is a clean interface so the failure
// points can call sendAlertEmail() unconditionally; it is a safe no-op until a
// provider is chosen and wired.
//
// TO ACTIVATE EMAIL (one decision + one implementation):
//   1. Choose a provider (e.g. Resend / SendGrid / Postmark / SES).
//   2. Add env vars:
//        ALERT_EMAILS          — comma-separated recipient list (required)
//        <PROVIDER>_API_KEY    — the chosen provider's key (e.g. RESEND_API_KEY)
//   3. Implement the marked block below with the provider's REST call/SDK.
// Until then sendAlertEmail returns { sent:false, reason:"provider_not_configured" }
// and never throws — alerting must never break the request path.
// ============================================================================

import "server-only";

export interface AlertEmailPayload {
  type: string;
  detail: string;
  restaurantId: string;
  conversationId?: string | null;
  at: string; // ISO timestamp
}

export interface AlertEmailResult {
  sent: boolean;
  reason?: string;
}

/** Recipient list from ALERT_EMAILS (comma-separated). Empty when unset. */
export function alertRecipients(): string[] {
  return (process.env.ALERT_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Send a critical-alert email. SAFE NO-OP until a provider is wired (see header).
 * Never throws — returns a result the caller can log but should not depend on.
 */
export async function sendAlertEmail(payload: AlertEmailPayload): Promise<AlertEmailResult> {
  const recipients = alertRecipients();
  if (recipients.length === 0) return { sent: false, reason: "no_recipients" };

  // ── PROVIDER NOT WIRED ───────────────────────────────────────────────────
  // No email provider has been chosen yet, so there is nothing to send through.
  // Do NOT fake a send. When a provider is selected, implement the real call
  // here (read its API key from env, POST the message to `recipients`) and
  // return { sent: true } on success.
  void payload;
  return { sent: false, reason: "provider_not_configured" };
}
