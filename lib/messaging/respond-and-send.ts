// ============================================================================
// MaitreAI — Inbound → Brain → WhatsApp bridge (Sprint 9, S9-1) — SERVER ONLY
// The keystone: after the webhook has persisted an inbound message, run the
// Customer Agent (same shared path as /api/agent/respond) and put the reply on
// the WhatsApp wire. Honors takeover (a human-owned conversation is left alone),
// the 24h window, and surfaces every send failure to the conversation timeline
// so nothing is ever silently dropped.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runCustomerTurn, CustomerTurnError } from "@/lib/ai/customer-turn";
import { sendWhatsAppText, sendWhatsAppInteractive } from "./outbound";
import { persistOrderFromDraft } from "@/lib/db/orders-create";
import { sendReceiptToCustomer } from "./send-receipt";
import type { LlmMessage } from "@/lib/ai/llm/types";

export type RespondAndSendStatus =
  | "responded"
  | "skipped_takeover"
  | "skipped_no_customer_msg"
  | "skipped_not_found"
  | "send_failed"
  | "agent_error";

export interface RespondAndSendResult {
  status: RespondAndSendStatus;
  reply?: string;
  escalate?: boolean;
  sendStatus?: string;
  error?: string;
}

/** Insert a system note into the conversation timeline (operator-visible). */
async function noteToTimeline(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  text: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  await admin.from("messages").insert({
    restaurant_id: restaurantId,
    conversation_id: conversationId,
    direction: "outbound",
    sender: "system",
    text,
    status: "sent",
    meta,
  });
}

export async function respondAndSendWhatsApp(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string
): Promise<RespondAndSendResult> {
  // 1. Conversation + owner + recipient phone + customer id.
  const { data: conv } = await admin
    .from("conversations")
    .select("id, owner, channel, customer_id, customers(phone)")
    .eq("id", conversationId)
    .single();
  if (!conv) return { status: "skipped_not_found", error: "conversation_not_found" };
  const customerId = (conv.customer_id as string | null) ?? null;

  // Takeover (Amendment 03 §E): a human owns this thread — the Brain stays out.
  if ((conv.owner as string) === "human") return { status: "skipped_takeover" };

  const phone = (conv.customers as { phone?: string } | null)?.phone ?? "";

  // 2. History + the customer message to answer (last inbound), from the DB —
  //    the inbound was already persisted by the webhook, so we derive both here
  //    (no double-counting of the message into the prompt).
  const { data: msgs } = await admin
    .from("messages")
    .select("sender,text,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at")
    .limit(40);
  const rows = (msgs ?? []) as { sender: string; text: string | null; created_at: string }[];
  const lastCustomerIdx = rows.map((m) => m.sender).lastIndexOf("customer");
  if (lastCustomerIdx < 0) return { status: "skipped_no_customer_msg" };
  const userMessage = (rows[lastCustomerIdx].text ?? "").trim();
  if (!userMessage) return { status: "skipped_no_customer_msg" };
  const lastInboundAtMs = new Date(rows[lastCustomerIdx].created_at).getTime();
  const history: LlmMessage[] = rows
    .slice(0, lastCustomerIdx)
    .filter((m) => m.text)
    .map((m) => ({ role: m.sender === "customer" ? "user" : "assistant", content: m.text as string }));

  // 3. Brain turn — persists the AI reply, logs cost to agent_runs, flips to
  //    human on escalation. Any failure hands the thread to a human + notes it.
  let outcome;
  try {
    outcome = await runCustomerTurn(admin, { restaurantId, conversationId, history, userMessage });
  } catch (e) {
    const detail = e instanceof CustomerTurnError ? e.code : e instanceof Error ? e.message : String(e);
    await admin
      .from("conversations")
      .update({ owner: "human", status: "يحتاج تدخل موظف", escalation_reason: `agent_error: ${detail}` })
      .eq("id", conversationId);
    await noteToTimeline(
      admin,
      restaurantId,
      conversationId,
      "تعذّر توليد رد المساعد تلقائياً — تم تحويل المحادثة لموظف للمتابعة.",
      { kind: "agent_error", detail }
    );
    return { status: "agent_error", error: detail };
  }

  // 4. Put the reply on the WhatsApp wire — as an interactive message when the
  //    Brain presented options (degrades to numbered text on failure), else text.
  const send = outcome.presentation
    ? await sendWhatsAppInteractive({ to: phone, body: outcome.reply, presentation: outcome.presentation, lastInboundAtMs })
    : await sendWhatsAppText({ to: phone, text: outcome.reply, lastInboundAtMs });

  // 4.5 (S9-4.5): a finalized draft becomes a real order row (idempotent — one
  // finalized draft = one row), then the receipt auto-sends (skips in test mode).
  // Runs regardless of reply-send outcome — the order is placed either way.
  if (outcome.draft.finalized) {
    try {
      const persisted = await persistOrderFromDraft(admin, { restaurantId, conversationId, customerId, draft: outcome.draft });
      if (persisted.created && persisted.orderId) await sendReceiptToCustomer(admin, persisted.orderId);
    } catch (e) {
      console.error("[respond-and-send] order persist/receipt error", e);
    }
  }

  if (send.status === "sent") {
    if (outcome.replyMessageId) {
      await admin
        .from("messages")
        .update({ status: "sent", channel_message_id: send.externalMessageId ?? null })
        .eq("id", outcome.replyMessageId);
    }
    return { status: "responded", reply: outcome.reply, escalate: outcome.escalate, sendStatus: "sent" };
  }

  if (send.status === "skipped") {
    // Test mode (no credentials): the reply is persisted, just not transmitted.
    return { status: "responded", reply: outcome.reply, escalate: outcome.escalate, sendStatus: "skipped" };
  }

  // Real failure (network / 4xx after retries, or outside the 24h window) —
  // mark the reply failed and surface it so an operator can act. Nothing dropped.
  if (outcome.replyMessageId) {
    await admin.from("messages").update({ status: "failed" }).eq("id", outcome.replyMessageId);
  }
  await noteToTimeline(
    admin,
    restaurantId,
    conversationId,
    `تعذّر إرسال رد المساعد عبر واتساب: ${send.error ?? "خطأ غير معروف"}. الرسالة محفوظة ويمكن إعادة المحاولة.`,
    { kind: "send_error", windowState: send.windowState, attempts: send.attempts }
  );
  return {
    status: "send_failed",
    reply: outcome.reply,
    escalate: outcome.escalate,
    sendStatus: send.status,
    error: send.error,
  };
}
