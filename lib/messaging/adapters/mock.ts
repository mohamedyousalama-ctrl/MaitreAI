// ============================================================================
// MaitreAI — Mock messaging adapter (Sprint 6)
// Used for local testing of any channel. Simulates inbound normalization and
// outbound delivery without touching the network. Always "configured" so the
// simulator and tests have a deterministic, always-on channel.
// ============================================================================

import type {
  ChannelKey,
  InboundMessage,
  MessagingAdapter,
  OutboundMessage,
  SendResult,
} from "../types";

/** Shape the local simulator posts to mockAdapter.normalizeInbound(). */
export interface MockInboundPayload {
  channel?: ChannelKey;
  from: string;
  name?: string;
  text: string;
  timestamp?: number;
}

export function createMockAdapter(channel: ChannelKey = "website"): MessagingAdapter {
  return {
    channel,

    // The mock channel is always available so tests never depend on env vars.
    isConfigured: () => true,

    normalizeInbound(payload: unknown): InboundMessage[] {
      const p = (payload ?? {}) as MockInboundPayload;
      if (!p.from || !p.text) return [];
      return [
        {
          channel: p.channel ?? channel,
          from: p.from,
          customerName: p.name,
          text: p.text,
          timestamp: p.timestamp ?? Date.now(),
          raw: payload,
        },
      ];
    },

    async sendMessage(message: OutboundMessage): Promise<SendResult> {
      // No network — we just acknowledge the send with a fake provider id.
      return {
        ok: true,
        channel: message.channel,
        to: message.to,
        status: "simulated",
        externalMessageId: `mock_${Date.now().toString(36)}`,
      };
    },

    async sendPaymentLink(message): Promise<SendResult> {
      return this.sendMessage({ ...message, kind: "payment_link" });
    },
  };
}

/** Default mock adapter instance (website channel). */
export const mockAdapter = createMockAdapter("website");
