// ============================================================================
// MaitreAI — Messaging service (Sprint 6)
// Single entry point the app uses to talk to channels. Resolves the right
// adapter for a channel, performs the send, and records the result in the
// outbound log. WhatsApp-first but channel-agnostic: callers never import a
// concrete adapter directly.
// ============================================================================

import type { ChannelKey, MessagingAdapter, OutboundMessage, SendResult } from "./types";
import { whatsappAdapter } from "./adapters/whatsapp";
import { createMockAdapter, mockAdapter } from "./adapters/mock";
import { useMessageLogStore } from "./message-log-store";

/**
 * Resolve the adapter for a channel. WhatsApp uses the real (env-gated) adapter;
 * every other channel currently falls back to the mock adapter so the rest of
 * the app keeps working until that channel is implemented.
 */
export function getAdapter(channel: ChannelKey): MessagingAdapter {
  switch (channel) {
    case "whatsapp":
      return whatsappAdapter;
    case "website":
      return mockAdapter;
    default:
      // instagram / facebook / google / voice → not implemented yet.
      return createMockAdapter(channel);
  }
}

/**
 * Send an outbound message through the resolved adapter and record it in the
 * outbound log. Returns the adapter's SendResult. Safe to call client-side;
 * when a channel is not configured the adapter returns a "skipped" result and
 * nothing is delivered over the network.
 */
export async function sendOutbound(message: OutboundMessage): Promise<SendResult> {
  const adapter = getAdapter(message.channel);

  let result: SendResult;
  try {
    if (message.kind === "payment_link" && adapter.sendPaymentLink) {
      const url = (message.metadata?.url as string | undefined) ?? "";
      result = await adapter.sendPaymentLink({ ...message, url });
    } else {
      result = await adapter.sendMessage(message);
    }
  } catch (err) {
    result = {
      ok: false,
      channel: message.channel,
      to: message.to,
      status: "failed",
      error: err instanceof Error ? err.message : "send error",
    };
  }

  useMessageLogStore.getState().logOutbound(message, result);
  return result;
}
