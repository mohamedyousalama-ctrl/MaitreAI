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
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  audio?: { id?: string; mime_type?: string; voice?: boolean };
  voice?: { id?: string; mime_type?: string };
}
interface WaChange {
  value?: {
    contacts?: WaContact[];
    messages?: WaMessage[];
    metadata?: { display_phone_number?: string; phone_number_id?: string };
  };
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

/** Reply id of a tapped button/list row, if this message is an interactive reply. */
function extractInteractiveId(m: WaMessage): string | undefined {
  return m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? undefined;
}

/** The Meta `phone_number_id` this delivery was sent to (identifies the tenant's
 *  WhatsApp number), from the first change's metadata. Null if absent. Pure parse
 *  — no node-only deps, safe alongside the rest of this adapter. */
export function extractInboundPhoneNumberId(payload: unknown): string | null {
  const data = (payload ?? {}) as WaWebhookPayload;
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const id = change.value?.metadata?.phone_number_id;
      if (id) return String(id).trim();
    }
  }
  return null;
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
        const audio = m.audio ?? m.voice;
        const audioId = audio?.id;
        // Keep text messages, interactive replies, AND voice notes (no text yet).
        if (!m.from || (!text && !audioId)) continue;
        out.push({
          channel: CHANNEL,
          externalMessageId: m.id,
          from: m.from,
          customerName: nameByWaId.get(m.from),
          text,
          interactiveId: extractInteractiveId(m),
          audioId,
          audioMime: audio?.mime_type,
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

// --- interactive bodies (S9-2) ---------------------------------------------
const WA_BODY_MAX = 1024;
const WA_HEADER_MAX = 60;

/** Reply-buttons interactive message (≤3 buttons). */
export function buildWhatsAppButtonsBody(
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[],
  header?: string
) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(header ? { header: { type: "text", text: header.slice(0, WA_HEADER_MAX) } } : {}),
      body: { text: bodyText.slice(0, WA_BODY_MAX) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
    },
  };
}

/** List interactive message (sections of tappable rows). */
export function buildWhatsAppListBody(
  to: string,
  bodyText: string,
  buttonText: string,
  sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[],
  header?: string
) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(header ? { header: { type: "text", text: header.slice(0, WA_HEADER_MAX) } } : {}),
      body: { text: bodyText.slice(0, WA_BODY_MAX) },
      action: {
        button: buttonText,
        sections: sections.map((s) => ({
          ...(s.title ? { title: s.title } : {}),
          rows: s.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })),
        })),
      },
    },
  };
}

/** POST any pre-built message body to the Graph API and map the response. */
async function postToGraph(env: ReturnType<typeof readWhatsAppEnv>, body: Record<string, unknown>): Promise<SendResult> {
  const to = String((body as { to?: string }).to ?? "");
  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${env.phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, channel: CHANNEL, to, status: "failed", error: `WhatsApp API ${res.status}`, raw: json };
    }
    const externalMessageId = (json as { messages?: { id?: string }[] })?.messages?.[0]?.id;
    return { ok: true, channel: CHANNEL, to, status: "sent", externalMessageId, raw: json };
  } catch (err) {
    return { ok: false, channel: CHANNEL, to, status: "failed", error: err instanceof Error ? err.message : "network error" };
  }
}

const SKIPPED = (to: string): SendResult => ({
  ok: false,
  channel: CHANNEL,
  to,
  status: "skipped",
  error: "WhatsApp غير مُهيأ (الوضع التجريبي) — لم يتم الإرسال الفعلي.",
});

/** Download inbound media (e.g. a voice note) by media id. Two-step per the
 *  Graph API: resolve the media URL, then fetch the bytes (both authenticated).
 *  Returns null in test mode / on failure. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const env = readWhatsAppEnv();
  if (!isWhatsAppConfigured(env)) return null;
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${env.accessToken}` },
    });
    const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string };
    if (!metaRes.ok || !meta.url) return null;
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${env.accessToken}` } });
    if (!binRes.ok) return null;
    return { bytes: Buffer.from(await binRes.arrayBuffer()), mime: meta.mime_type || "audio/ogg" };
  } catch {
    return null;
  }
}

/** Send a pre-built message body (text or interactive). Skips in test mode. */
export async function sendWhatsAppBody(body: Record<string, unknown>): Promise<SendResult> {
  const env = readWhatsAppEnv();
  if (!isWhatsAppConfigured(env)) return SKIPPED(String((body as { to?: string }).to ?? ""));
  return postToGraph(env, body);
}

/** Upload binary media (e.g. a receipt PNG) and return its media id for sending. */
export async function uploadWhatsAppMedia(
  bytes: Buffer,
  mime = "image/png",
  filename = "receipt.png"
): Promise<SendResult & { mediaId?: string }> {
  const env = readWhatsAppEnv();
  if (!isWhatsAppConfigured(env)) return { ...SKIPPED("media") };
  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${env.phoneNumberId}/media`;
  try {
    const fd = new FormData();
    fd.append("messaging_product", "whatsapp");
    fd.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${env.accessToken}` }, body: fd });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, channel: CHANNEL, to: "media", status: "failed", error: `WhatsApp media ${res.status}`, raw: json };
    return { ok: true, channel: CHANNEL, to: "media", status: "sent", mediaId: (json as { id?: string })?.id, raw: json };
  } catch (err) {
    return { ok: false, channel: CHANNEL, to: "media", status: "failed", error: err instanceof Error ? err.message : "network error" };
  }
}

/** Image message body referencing an uploaded media id. */
export function buildWhatsAppImageBody(to: string, mediaId: string, caption?: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: { id: mediaId, ...(caption ? { caption } : {}) },
  };
}

/** Template message body (the only way to message outside the 24h window). */
export function buildWhatsAppTemplateBody(
  to: string,
  name: string,
  language: string,
  components: { type: string; parameters: { type: string; text: string }[] }[]
) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(components.length ? { components } : {}),
    },
  };
}

async function sendWhatsAppMessage(message: OutboundMessage): Promise<SendResult> {
  const env = readWhatsAppEnv();
  if (!isWhatsAppConfigured(env)) return SKIPPED(message.to);
  return postToGraph(env, buildWhatsAppTextBody(message.to, message.text));
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
