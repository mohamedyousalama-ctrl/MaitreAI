// ============================================================================
// MaitreAI — WhatsApp Cloud API adapter (Sprint 6 — preparation)
// Parses real WhatsApp webhook payloads and builds the real Graph API send
// request, but only performs live delivery when credentials are configured.
// In test mode (no env vars) sending is SKIPPED gracefully — the app never
// crashes and never silently pretends a message was delivered.
//
// NOTE: this module intentionally avoids node-only imports (e.g. "crypto") so
// it is safe to bundle on both server and client. HMAC signature verification
// lives in the server-only webhook route.
// ============================================================================

import type {
  InboundMessage,
  MessagingAdapter,
  OutboundMessage,
  SendResult,
} from "../types";
import {
  WHATSAPP_GRAPH_VERSION,
  isWhatsAppConfigured,
  readWhatsAppEnv,
} from "../config";

const CHANNEL = "whatsapp" as const;

// ---------------------------------------------------------------------------
// Inbound: WhatsApp Cloud API webhook payload → normalized messages
// Shape (trimmed):
// { object, entry: [{ changes: [{ value: { contacts:[{profile:{name},wa_id}],
//   messages:[{from,id,timestamp,type,text:{body}}] }, field:"messages" }] }] }
// ---------------------------------------------------------------------------
interface WaContact {
  profile?: { name?: string };
  wa_id?: string;
}
interface WaMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
}
interface WaChange {
  value?: { contacts?: WaContact[]; messages?: WaMessage[] };
  field?: string;
}
interface WaEntry {
  changes?: WaChange[];
}
interface WaWebhookPayload {
  object?: string;
  entry?: WaEntry[];
}

/** Best-effort text extraction across text / button / interactive message types. */
function extractText(m: WaMessage): string {
  if (m.text?.body) return m.text.body;
  if (m.button?.text) return m.button.text;
  if (m.interactive?.button_reply?.title) return m.interactive.button_reply.title;
  if (m.interactive?.list_reply?.title) return m.interactive.list_reply.title;
  return "";
}

export function normalizeWhatsAppInbound(payload: unknown): InboundMessage[] {
  const data = (payload ?? {}) as WaWebhookPayload;
  const out: InboundMessage[] = [];

  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      // Build a wa_id → name map from contacts for this change.
      const nameByWaId = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);
      }

      for (const m of value.messages) {
        const text = extractText(m);
        if (!m.from || !text) continue;
        out.push({
          channel: CHANNEL,
          externalMessageId: m.id,
          from: m.from,
          customerName: nameByWaId.get(m.from),
          text,
          timestamp: m.timestamp ? Number(m.timestamp) * 1000 : Date.now(),
          raw: m,
        });
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Outbound: build + (optionally) perform the Graph API send
// ---------------------------------------------------------------------------
/** Build the exact JSON body the WhatsApp Cloud API expects for a text message. */
export function buildWhatsAppTextBody(to: string, text: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: true, body: text },
  };
}

async function sendWhatsAppMessage(message: OutboundMessage): Promise<SendResult> {
  const env = readWhatsAppEnv();

  // Test mode / not configured → skip gracefully (never crash, never fake-send).
  if (!isWhatsAppConfigured(env)) {
    return {
      ok: false,
      channel: CHANNEL,
      to: message.to,
      status: "skipped",
      error: "WhatsApp غير مُهيأ (الوضع التجريبي) — لم يتم الإرسال الفعلي.",
    };
  }

  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${env.phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildWhatsAppTextBody(message.to, message.text)),
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        channel: CHANNEL,
        to: message.to,
        status: "failed",
        error: `WhatsApp API ${res.status}`,
        raw: json,
      };
    }
    const externalMessageId = (json as { messages?: { id?: string }[] })?.messages?.[0]?.id;
    return {
      ok: true,
      channel: CHANNEL,
      to: message.to,
      status: "sent",
      externalMessageId,
      raw: json,
    };
  } catch (err) {
    return {
      ok: false,
      channel: CHANNEL,
      to: message.to,
      status: "failed",
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

// ---------------------------------------------------------------------------
// Webhook verification helper (GET handshake)
// ---------------------------------------------------------------------------
/**
 * Verify the WhatsApp webhook subscription handshake.
 * Returns the challenge string to echo back when the token matches, else null.
 */
export function verifyWhatsAppWebhook(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  verifyToken: string;
}): string | null {
  const { mode, token, challenge, verifyToken } = params;
  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return challenge ?? "";
  }
  return null;
}

export const whatsappAdapter: MessagingAdapter = {
  channel: CHANNEL,
  isConfigured: () => isWhatsAppConfigured(),
  normalizeInbound: normalizeWhatsAppInbound,
  sendMessage: sendWhatsAppMessage,
  async sendPaymentLink(message) {
    // WhatsApp Cloud API text messages render URLs as link previews; a dedicated
    // template/interactive message can replace this once a template is approved.
    return sendWhatsAppMessage({ ...message, kind: "payment_link" });
  },
};
