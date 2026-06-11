// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — inbound message persistence (server-only)
// Idempotent upsert of an inbound channel message into Supabase: upsert the
// customer (by restaurant_id + phone), find-or-create the conversation, then
// insert the message keyed on channel_message_id so Meta's webhook redeliveries
// never create duplicates. Uses the admin (service-role) client.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundMessage } from "@/lib/messaging/types";

export interface PersistResult {
  inserted: boolean; // false = duplicate redelivery (idempotent no-op)
  conversationId?: string;
  customerId?: string;
}

export async function persistInboundMessage(
  admin: SupabaseClient,
  restaurantId: string,
  msg: InboundMessage
): Promise<PersistResult> {
  // 1. Customer — upsert on (restaurant_id, phone).
  const { data: cust, error: cErr } = await admin
    .from("customers")
    .upsert(
      {
        restaurant_id: restaurantId,
        phone: msg.from,
        ...(msg.customerName ? { name: msg.customerName } : {}),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id,phone" }
    )
    .select("id")
    .single();
  if (cErr) throw cErr;
  const customerId = cust.id as string;

  // 2. Conversation — reuse the latest for this customer+channel, else create.
  let conversationId: string;
  const { data: existing } = await admin
    .from("conversations")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("customer_id", customerId)
    .eq("channel", msg.channel)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    conversationId = existing.id as string;
  } else {
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .insert({ restaurant_id: restaurantId, customer_id: customerId, channel: msg.channel })
      .select("id")
      .single();
    if (convErr) throw convErr;
    conversationId = conv.id as string;
  }

  // 3. Message — idempotent on channel_message_id (ignore duplicate redeliveries).
  const { data: ins, error: mErr } = await admin
    .from("messages")
    .upsert(
      {
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        direction: "inbound",
        sender: "customer",
        text: msg.text,
        channel_message_id: msg.externalMessageId ?? null,
        status: "delivered",
      },
      { onConflict: "channel_message_id", ignoreDuplicates: true }
    )
    .select("id");
  if (mErr) throw mErr;

  return { inserted: (ins?.length ?? 0) > 0, conversationId, customerId };
}
