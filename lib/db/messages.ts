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
import { ensureCustomerId } from "@/lib/db/ensure-customer";

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
  // 1. Customer — the launch rule: ensure a customers row on (restaurant_id, phone)
  // via the single canonical helper, so every conversation/order path resolves the
  // SAME customer_id. Behavior-identical to the prior inline upsert.
  const customerId = await ensureCustomerId(admin, restaurantId, msg.from, msg.customerName);

  // WB3 — ad referral fields (only when Meta sent click-to-message referral
  // context). DB columns are nullable; absent → conversation stays organic.
  const adFields = msg.referral
    ? {
        ad_source_type: msg.referral.sourceType ?? null,
        ad_source_id: msg.referral.sourceId ?? null,
        ad_headline: msg.referral.headline ?? null,
        ad_body: msg.referral.body ?? null,
        ad_referrer_url: msg.referral.sourceUrl ?? null,
        ad_ctwa_clid: msg.referral.ctwaClid ?? null,
      }
    : null;

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

  // WB3 — best-effort ad attribution. Separate + guarded so a pre-migration column
  // absence (code deployed before 0053) NEVER breaks the inbound persist path: the
  // select/update return an error object (not a throw) which we simply skip.
  // First-ad-wins: stamp only when this inbound carries a referral AND the
  // conversation isn't already attributed — never clobber the original ad. Organic
  // inbounds (no referral) touch nothing.
  if (adFields) {
    // Read ALL six ad columns (tenant-scoped): a Meta referral can lack source_id
    // and carry only ctwa_clid / url / headline, so keying the "already attributed"
    // guard on source_id alone would let a SECOND ad overwrite a first ad that had
    // no source_id. Treat the conversation as attributed if ANY ad field is set →
    // true first-ad-wins.
    const { data: cur, error: readErr } = await admin
      .from("conversations")
      .select("ad_source_type, ad_source_id, ad_headline, ad_body, ad_referrer_url, ad_ctwa_clid")
      .eq("id", conversationId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    const alreadyAttributed = !!cur && Object.values(cur as Record<string, unknown>).some((v) => v != null);
    if (!readErr && cur && !alreadyAttributed) {
      await admin.from("conversations").update(adFields).eq("id", conversationId).eq("restaurant_id", restaurantId);
    }
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
        // WO-VOICE-1: keep the original audio ref (media id) + STT provenance in meta
        // (the 🎤 chip renders from meta.voice). All additive to the jsonb — no DDL.
        ...(msg.interactiveId || msg.audioId || msg.location
          ? {
              meta: {
                ...(msg.interactiveId ? { interactiveId: msg.interactiveId } : {}),
                ...(msg.audioId
                  ? {
                      voice: true,
                      audio_id: msg.audioId,
                      ...(msg.sttModel ? { stt_model: msg.sttModel } : {}),
                      ...(typeof msg.sttConfidence === "number" ? { stt_confidence: msg.sttConfidence } : {}),
                    }
                  : {}),
                // WO-DELIVERY-D1 — the location pin, read back by respond-and-send to
                // route the order to a zone + branch. Additive jsonb; no DDL.
                ...(msg.location ? { location: msg.location } : {}),
              },
            }
          : {}),
      },
      { onConflict: "channel_message_id", ignoreDuplicates: true }
    )
    .select("id");
  if (mErr) throw mErr;

  return { inserted: (ins?.length ?? 0) > 0, conversationId, customerId };
}
