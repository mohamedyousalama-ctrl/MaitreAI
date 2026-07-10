// ============================================================================
// MaitreAI — Messaging layer types (Sprint 6)
// Channel-agnostic message shapes shared by every adapter. WhatsApp-first, but
// not WhatsApp-hardcoded: the same InboundMessage/OutboundMessage flows through
// the adapter interface regardless of channel. No backend, no real network in
// test mode.
// ============================================================================

/** All channels the architecture is designed for. Only "whatsapp" is active. */
export type ChannelKey =
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "website"
  | "google"
  | "voice";

/** Channels that are actually wired up right now. */
export const ACTIVE_CHANNELS: ChannelKey[] = ["whatsapp", "website"];

/** Arabic display labels for channels (used by the simulator + logs UI). */
export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  whatsapp: "واتساب",
  instagram: "إنستغرام",
  facebook: "فيسبوك",
  website: "موقع الويب",
  google: "Google Business",
  voice: "المكالمات الصوتية",
};

/** A normalized inbound message after an adapter parses a raw provider payload. */
export interface InboundMessage {
  channel: ChannelKey;
  /** Provider message id, if the channel supplies one. */
  externalMessageId?: string;
  /** Sender identity — phone number for WhatsApp, user id for others. */
  from: string;
  /** Display name if the channel provides it (e.g. WhatsApp contact profile). */
  customerName?: string;
  text: string;
  timestamp: number;
  /** Reply id of a tapped button/list row (e.g. "item:123", "confirm_order"), if any. */
  interactiveId?: string;
  /** WhatsApp media id of a voice note, if this is an audio message (S9-6). */
  audioId?: string;
  /** MIME type of the voice note (e.g. audio/ogg). */
  audioMime?: string;
  /** WO-VOICE-1: STT confidence + model for a transcribed voice note, stamped by the
   *  webhook after transcription and persisted into messages.meta (the audio ref is
   *  kept too). Feeds the fail-closed net's secondary confidence tripwire. */
  sttConfidence?: number;
  sttModel?: string;
  /** WB3 — Meta click-to-message ad referral, when this inbound arrived via a
   *  click-to-WhatsApp ad. Undefined for organic messages. Captured as data only. */
  referral?: AdReferral;
  /** WO-DELIVERY-D1 — a WhatsApp location pin (delivery_geo_routing). Set only when
   *  the webhook, after resolving the flag, chose to ingest the pin. Persisted into
   *  messages.meta.location so the Brain turn can route it to a zone + branch. */
  location?: { lat: number; lng: number; name?: string; address?: string };
  /** Original raw payload fragment, kept for debugging only. */
  raw?: unknown;
}

/** WB3 — ad/campaign referral context from a Meta click-to-message ad. */
export interface AdReferral {
  sourceType?: string; // "ad" | "post"
  sourceId?: string;   // the ad / post id
  headline?: string;
  body?: string;
  sourceUrl?: string;  // fb.me/… referral url
  ctwaClid?: string;   // click-to-WhatsApp click id
}

/** What kind of outbound content we are sending (affects logging + formatting). */
export type OutboundKind = "text" | "payment_link";

/** A channel-agnostic outbound message handed to an adapter for delivery. */
export interface OutboundMessage {
  channel: ChannelKey;
  /** Recipient identity — phone number for WhatsApp. */
  to: string;
  text: string;
  kind?: OutboundKind;
  /** Optional structured payload (e.g. payment url) for richer channels. */
  metadata?: Record<string, unknown>;
}

/** Result of an adapter attempting to deliver an outbound message. */
export type SendStatus = "sent" | "simulated" | "skipped" | "failed";

export interface SendResult {
  ok: boolean;
  channel: ChannelKey;
  to: string;
  /** sent = real delivery, simulated = mock, skipped = not configured, failed = error. */
  status: SendStatus;
  externalMessageId?: string;
  error?: string;
  /** Provider error code when the response carried one (e.g. Meta Graph API
   *  `error.code`) — lets the retry policy tell a transient rate-limit 4xx from
   *  a structural 4xx, and makes an otherwise-opaque «API 400» diagnosable. */
  errorCode?: number;
  /** Raw provider response, debugging only. */
  raw?: unknown;
}

/** The contract every channel adapter implements. */
export interface MessagingAdapter {
  channel: ChannelKey;
  /** True only when real credentials are present and delivery would be live. */
  isConfigured(): boolean;
  /** Parse a raw provider webhook payload into zero or more normalized messages. */
  normalizeInbound(payload: unknown): InboundMessage[];
  /** Deliver a text message (or simulate/skip when not configured). */
  sendMessage(message: OutboundMessage): Promise<SendResult>;
  /** Optional richer payment-link delivery; falls back to sendMessage otherwise. */
  sendPaymentLink?(message: OutboundMessage & { url: string }): Promise<SendResult>;
}
