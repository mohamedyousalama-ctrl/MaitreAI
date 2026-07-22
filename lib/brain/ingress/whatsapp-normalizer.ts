import type { BrainChannelEvent, BrainRawMessageForScan, WhatsAppStatusValue } from "./types";
import { canonicalFingerprint } from "./signature";

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
  audio?: { id?: string; mime_type?: string };
  voice?: { id?: string; mime_type?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
}

interface WaStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

interface WaChange {
  field?: string;
  value?: {
    contacts?: WaContact[];
    messages?: WaMessage[];
    statuses?: WaStatus[];
    metadata?: { display_phone_number?: string; phone_number_id?: string };
  };
}

interface WaEntry {
  id?: string;
  changes?: WaChange[];
}

interface WaWebhookPayload {
  object?: string;
  entry?: WaEntry[];
}

export const WHATSAPP_STATUS_RANK: Record<WhatsAppStatusValue, number> = {
  sent: 10,
  delivered: 20,
  read: 30,
  failed: 40,
};

export function extractWhatsAppPhoneNumberId(payload: unknown): string | null {
  const data = (payload ?? {}) as WaWebhookPayload;
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const id = change.value?.metadata?.phone_number_id;
      if (id) return String(id).trim();
    }
  }
  return null;
}

function timestampIso(seconds: string | undefined, receivedAt: string): string {
  const numeric = seconds ? Number(seconds) : NaN;
  if (!Number.isFinite(numeric)) return receivedAt;
  return new Date(numeric * 1000).toISOString();
}

function textForMessage(message: WaMessage): string {
  if (message.text?.body) return message.text.body;
  if (message.button?.text) return message.button.text;
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title;
  if (message.image?.caption) return message.image.caption;
  if (message.video?.caption) return message.video.caption;
  if (message.document?.caption) return message.document.caption;
  return "";
}

function interactiveId(message: WaMessage): string | null {
  return message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id ?? null;
}

function mediaType(message: WaMessage): string | null {
  if (message.audio || message.voice) return "audio";
  if (message.image) return "image";
  if (message.video) return "video";
  if (message.document) return "document";
  return null;
}

function messageType(message: WaMessage): string {
  return message.type || mediaType(message) || (interactiveId(message) ? "interactive" : "unknown");
}

function rawMessageForScan(message: WaMessage): BrainRawMessageForScan | null {
  const id = message.id;
  if (!id) return null;
  return {
    sourceMessageId: id,
    messageType: messageType(message),
    text: textForMessage(message),
    interactiveId: interactiveId(message),
    mediaType: mediaType(message),
    raw: message,
  };
}

function statusValue(status: string | undefined): WhatsAppStatusValue | null {
  if (status === "sent" || status === "delivered" || status === "read" || status === "failed") return status;
  return null;
}

export function reduceWhatsAppStatusLattice(statuses: readonly (WhatsAppStatusValue | null | undefined)[]): WhatsAppStatusValue | null {
  let best: WhatsAppStatusValue | null = null;
  for (const status of statuses) {
    if (!status) continue;
    if (!best || WHATSAPP_STATUS_RANK[status] > WHATSAPP_STATUS_RANK[best]) best = status;
  }
  return best;
}

export function normalizeWhatsAppBrainEvents(args: {
  payload: unknown;
  tenantId: string;
  receivedAt: string;
  envelopeId?: string;
}): BrainChannelEvent[] {
  const data = (args.payload ?? {}) as WaWebhookPayload;
  const events: BrainChannelEvent[] = [];
  let index = 0;

  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : null;
      const nameByWaId = new Map<string, string>();
      for (const contact of value?.contacts ?? []) {
        if (contact.wa_id && contact.profile?.name) nameByWaId.set(contact.wa_id, contact.profile.name);
      }

      for (const message of value?.messages ?? []) {
        const providerMessageId = message.id ?? null;
        const from = message.from ?? null;
        const type = messageType(message);
        const eventDedupeKey = providerMessageId
          ? ["whatsapp", args.tenantId, "customer_inbound", providerMessageId].join(":")
          : `whatsapp:${args.tenantId}:customer_inbound:${canonicalFingerprint([entry.id, change.field, message])}`;
        const scan = rawMessageForScan(message);
        events.push({
          tenantId: args.tenantId,
          envelopeId: args.envelopeId,
          provider: "whatsapp",
          channel: "whatsapp",
          eventKind: "customer_inbound",
          eventDedupeKey,
          eventIndex: index++,
          providerMessageId,
          providerTimestamp: timestampIso(message.timestamp, args.receivedAt),
          customerChannelId: from,
          threadKey: from,
          status: null,
          statusRank: 0,
          messageType: type,
          rawEvent: message,
          normalizedEvent: {
            phoneNumberId,
            from,
            customerName: from ? nameByWaId.get(from) ?? null : null,
            text: textForMessage(message),
            interactiveId: interactiveId(message),
            mediaType: mediaType(message),
            messageType: type,
          },
          receivedAt: args.receivedAt,
          rawMessageForScan: scan ?? undefined,
        });
      }

      for (const status of value?.statuses ?? []) {
        const providerMessageId = status.id ?? null;
        const s = statusValue(status.status);
        const providerTimestamp = timestampIso(status.timestamp, args.receivedAt);
        const eventDedupeKey =
          providerMessageId && s
            ? ["whatsapp", args.tenantId, providerMessageId, s, providerTimestamp].join(":")
            : `whatsapp:${args.tenantId}:status:${canonicalFingerprint([entry.id, change.field, status])}`;
        events.push({
          tenantId: args.tenantId,
          envelopeId: args.envelopeId,
          provider: "whatsapp",
          channel: "whatsapp",
          eventKind: "outbound_status",
          eventDedupeKey,
          eventIndex: index++,
          providerMessageId,
          providerTimestamp,
          customerChannelId: status.recipient_id ?? null,
          threadKey: status.recipient_id ?? null,
          status: s,
          statusRank: s ? WHATSAPP_STATUS_RANK[s] : 0,
          messageType: "status",
          rawEvent: status,
          normalizedEvent: {
            phoneNumberId,
            messageId: providerMessageId,
            status: s,
            recipientId: status.recipient_id ?? null,
            error: status.errors?.[0] ?? null,
          },
          receivedAt: args.receivedAt,
        });
      }

      if (!value?.messages?.length && !value?.statuses?.length) {
        events.push({
          tenantId: args.tenantId,
          envelopeId: args.envelopeId,
          provider: "whatsapp",
          channel: "whatsapp",
          eventKind: "other",
          eventDedupeKey: `whatsapp:${args.tenantId}:other:${canonicalFingerprint([entry.id, change])}`,
          eventIndex: index++,
          providerMessageId: null,
          providerTimestamp: args.receivedAt,
          customerChannelId: null,
          threadKey: null,
          status: null,
          statusRank: 0,
          messageType: "other",
          rawEvent: change,
          normalizedEvent: { phoneNumberId, field: change.field ?? null },
          receivedAt: args.receivedAt,
        });
      }
    }
  }

  return events;
}
