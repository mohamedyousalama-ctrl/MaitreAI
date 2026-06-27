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
import { modeAllowsAgentReply, type SystemMode } from "@/lib/ai/modes";
import { sendWhatsAppText, sendWhatsAppInteractive, sendWhatsAppImageLink } from "./outbound";
import { persistOrderFromDraft } from "@/lib/db/orders-create";
import { readHandoffConfig, isSafetyHold, isIdleBeyond } from "@/lib/tenant/handoff";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { emitConversationReport } from "@/lib/intelligence/conversation-report";
import { createDeliveryForOrder } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { sendReceiptToCustomer } from "./send-receipt";
import { setOwnershipState } from "@/lib/db/ownership";
import { checkAndNotifyStuck } from "@/lib/intelligence/stuck-detection";
import { recordCriticalAlert } from "@/lib/alerts/record";
import type { LlmMessage } from "@/lib/ai/llm/types";

export type RespondAndSendStatus =
  | "responded"
  | "skipped_takeover"
  | "skipped_mode"
  | "skipped_no_customer_msg"
  | "skipped_not_found"
  | "send_failed"
  | "agent_error"
  | "deduped";

export interface RespondAndSendResult {
  status: RespondAndSendStatus;
  reply?: string;
  escalate?: boolean;
  sendStatus?: string;
  error?: string;
}

interface PersistedDraftOrder {
  created: boolean;
  orderId: string | null;
  orderNumber: string | null;
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

/** HANDOFF-HARDENING (Fix 1) — nudge the team that a human-owned conversation has
 *  gone idle while the customer is still messaging. Operator-facing only (never
 *  sent to the customer). Deduped to at most one alert per idle window so a
 *  customer pinging repeatedly doesn't spam the timeline. Safety holds get a
 *  louder, "do not auto-return" alert. Does NOT touch updated_at (the wait/SLA
 *  clock stays truthful about how long the customer has actually waited). */
async function realertOperator(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  idleMinutes: number,
  safety: boolean
): Promise<void> {
  const sinceIso = new Date(Date.now() - idleMinutes * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("messages")
    .select("meta")
    .eq("conversation_id", conversationId)
    .eq("sender", "system")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(5);
  const alreadyAlerted = (recent ?? []).some((m) => (m.meta as Record<string, unknown> | null)?.kind === "handoff_idle_alert");
  if (alreadyAlerted) return;
  const text = safety
    ? "⏰🔒 العميل لسه مستني — دي محادثة سلامة/حساسية محوّلة لموظف ومحتاجة متابعة بشرية. (لا تُعاد للمساعد تلقائياً.)"
    : "⏰ العميل لسه مستني ردك — برجاء المتابعة.";
  await noteToTimeline(admin, restaurantId, conversationId, text, { kind: "handoff_idle_alert", safety });
}

async function sendRequestedPhotos(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  phone: string,
  photoRequests: { imageUrl: string; caption: string; name: string }[],
  lastInboundAtMs: number
): Promise<void> {
  for (const photo of photoRequests.slice(0, 4)) {
    const send = await sendWhatsAppImageLink({
      to: phone,
      imageUrl: photo.imageUrl,
      caption: photo.caption,
      lastInboundAtMs,
    });
    if (send.status === "failed") {
      await noteToTimeline(
        admin,
        restaurantId,
        conversationId,
        `تعذّر إرسال صورة ${photo.name} عبر واتساب: ${send.error ?? "خطأ غير معروف"}.`,
        { kind: "photo_send_error", itemName: photo.name, imageUrl: photo.imageUrl, attempts: send.attempts }
      );
    }
  }
}

export async function respondAndSendWhatsApp(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string
): Promise<RespondAndSendResult> {
  // 1. Conversation + owner + recipient phone + customer id (+ the handoff clock
  //    and reason for the idle policy below).
  const { data: conv } = await admin
    .from("conversations")
    .select("id, owner, channel, customer_id, escalation_reason, updated_at, ownership_state, customers(phone)")
    .eq("id", conversationId)
    .single();
  if (!conv) return { status: "skipped_not_found", error: "conversation_not_found" };
  const customerId = (conv.customer_id as string | null) ?? null;
  const ownershipState = (conv.ownership_state as string | null) ?? null;

  // Spine Step 3 (enforcement-safe reopen): a CLOSED conversation receiving a new
  // inbound is reopened to AI_ACTIVE — the ONE legal transition out of CLOSED — before
  // the Brain turn. Without this, a downstream escalation flip (AI_ACTIVE→HUMAN_ACTIVE/
  // SYSTEM_HOLD) would start from CLOSED and the now-enforced map would throw. This is
  // exactly the documented "customer messages again, reopen" transition.
  if (ownershipState === "CLOSED") {
    await setOwnershipState(admin, conversationId, "AI_ACTIVE", {
      extra: { owner: "ai", status: "AI نشط" },
    });
  }

  // Spine Step 3 (enforcement-safe hold-clearance canonicalization): when the operator
  // clears an allergy/safety hold via the UI (returnToAi in conversation-store.ts), it
  // updates `owner='ai'` AND calls setOwnershipState(SYSTEM_HOLD→AI_ACTIVE). That write
  // goes through the browser client with fire-and-forget (fire() swallows errors), so if
  // RLS or a network error silently rejects it, `owner` becomes 'ai' while
  // `ownership_state` stays 'SYSTEM_HOLD'. On the next inbound the human branch is
  // bypassed (owner='ai'), but the enforced map then throws on any transition out of
  // SYSTEM_HOLD that the Brain or error-handler tries to make. Fix: detect the mismatch
  // here and canonicalize — SYSTEM_HOLD→AI_ACTIVE is the deliberate operator release and
  // IS legal. #87 guarantee is preserved: we only do this when owner is already 'ai'
  // (meaning a human already pressed "return to AI"); we never auto-release a hold where
  // owner is still 'human'.
  if ((conv.owner as string) === "ai" && ownershipState === "SYSTEM_HOLD") {
    await setOwnershipState(admin, conversationId, "AI_ACTIVE", {
      extra: { owner: "ai", status: "AI نشط", is_safety_hold: false },
    });
  }

  // Takeover (Amendment 03 §E): a human owns this thread — the Brain normally
  // stays out. HANDOFF-HARDENING (Fix 1 — stop "silent death"): a human-owned
  // thread must never answer the customer with nobody, forever. When the customer
  // messages and no operator has tended the thread for the tenant's idle window,
  // apply the per-tenant idle policy. SAFETY holds (allergy/medical escalation
  // reason) NEVER auto-return — re-alert the team and stay silent. Flag-gated
  // (handoff_timeout); default off → the existing skipped_takeover behavior.
  let resumedAfterTimeout = false;
  if ((conv.owner as string) === "human") {
    // Spine Step 3 (Part A — stuck detection live): a human-owned thread is exactly the
    // "customer waiting on a person" posture where stuck-ness matters. Detect + alert
    // (deduped internally to ≤1 per window) BEFORE the idle/realert policy, so a stuck
    // thread is surfaced even when handoff_timeout is off. Healthy AI_ACTIVE flows never
    // enter this block, so normal replies get no stuck check and no alert spam. A failure
    // here never breaks the turn.
    await checkAndNotifyStuck({ admin, restaurantId, conversationId }).catch((e) =>
      console.error("[respond-and-send] stuck check error", e)
    );

    const { data: rFlags } = await admin.from("restaurants").select("feature_flags").eq("id", restaurantId).single();
    const features = (rFlags?.feature_flags as Record<string, unknown> | null) ?? null;
    const cfg = readHandoffConfig(features);
    const idle = cfg.enabled && isIdleBeyond(conv.updated_at as string | null, cfg.idleMinutes);
    if (!idle) return { status: "skipped_takeover" };

    // Safety carve-out source of truth: the STRUCTURED is_safety_hold flag (Fix 2),
    // read only when the allergen-safety feature is on — so Wesaya (flag off) never
    // references the new column (deploy-safe before the migration) and stays
    // byte-identical (falls back to the legacy reason-text classifier). When on, the
    // structured flag means a safety hold can NEVER wrongly auto-return regardless
    // of how the model phrased its escalation reason.
    let structuredSafety = false;
    if (isFeatureExplicitlyEnabled("deterministic_allergen_safety", features)) {
      const { data: sh } = await admin.from("conversations").select("is_safety_hold").eq("id", conversationId).single();
      structuredSafety = (sh as { is_safety_hold?: boolean } | null)?.is_safety_hold === true;
    }
    // Spine Step 3 (enforcement-safe + #87 hardening): treat an explicit SYSTEM_HOLD
    // ownership state as a safety hold UNCONDITIONALLY — independent of the feature flag
    // or the model's free-text reason. This makes the "a safety hold never auto-returns"
    // guarantee STRUCTURAL, and guarantees the auto-return path below (SYSTEM_HOLD would
    // be an illegal → HUMAN_IDLE transition under enforcement) is never reached.
    const isSystemHold = ownershipState === "SYSTEM_HOLD";
    const safety = isSystemHold || structuredSafety || isSafetyHold(conv.escalation_reason as string | null);
    if (safety || cfg.action === "realert_only") {
      // Keep the human in the loop; nudge staff (deduped to ≤ once per idle window).
      // Safety holds are released only by a deliberate human action — never here.
      await realertOperator(admin, restaurantId, conversationId, cfg.idleMinutes, safety);
      return { status: "skipped_takeover" };
    }

    // Non-safety + auto_return: return ownership to the AI through the SAME fields
    // returnToAi writes (owner/status reset, escalation_reason + handover_note
    // cleared — no human commitment to honor) and reset the wait clock. Then fall
    // through so the Brain answers the waiting customer; an honest resume line is
    // sent first (below, once recipient + 24h window are resolved).
    // Ownership axis (spine Step 1): the timeout path is HUMAN_IDLE → AI_ACTIVE. Mark
    // the idle hand-off explicitly, then return to the AI, dual-writing the legacy
    // owner/status/reason resets via `extra`. (Safety holds never reach here — they
    // bail above with realert_only — so SYSTEM_HOLD can never auto-return.)
    await setOwnershipState(admin, conversationId, "HUMAN_IDLE");
    await setOwnershipState(admin, conversationId, "AI_ACTIVE", {
      extra: { owner: "ai", status: "AI نشط", escalation_reason: null, handover_note: null, updated_at: new Date().toISOString() },
    });
    await noteToTimeline(
      admin,
      restaurantId,
      conversationId,
      "المحادثة رجعت للمساعد تلقائياً بعد انتظار العميل بدون رد من الفريق.",
      { kind: "handoff_auto_return", idleMinutes: cfg.idleMinutes }
    );
    resumedAfterTimeout = true;
  }

  // Mode gate (incident control, §F): only auto-reply in modes that allow it.
  // A tenant flipped to setup/paused leaves the inbound for human handling — no
  // auto-reply — while test/live (and closed) reply normally. The stored
  // agent_mode (setup|test|live|paused) maps onto SystemMode; a missing value
  // defaults to live so the existing reply path is unchanged.
  const { data: rest } = await admin.from("restaurants").select("agent_mode").eq("id", restaurantId).single();
  const agentMode = ((rest?.agent_mode as string) || "live") as SystemMode;
  if (!modeAllowsAgentReply(agentMode)) return { status: "skipped_mode" };

  const phone = (conv.customers as { phone?: string } | null)?.phone ?? "";

  // 2. History + the customer message to answer (last inbound), from the DB —
  //    the inbound was already persisted by the webhook, so we derive both here
  //    (no double-counting of the message into the prompt).
  const { data: msgs } = await admin
    .from("messages")
    .select("sender,text,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);
  // Fetch the NEWEST 40 (descending) then reverse to chronological (oldest→
  // newest). The previous ascending+limit(40) returned the OLDEST 40, so in a
  // long thread lastIndexOf("customer") resolved to message ~#40 — the agent
  // kept answering a stale message and looped. Reversing makes the window the
  // last 40 in order, so the final "customer" row IS the latest inbound.
  const rows = ([...(msgs ?? [])] as { sender: string; text: string | null; created_at: string }[]).reverse();
  const lastCustomerIdx = rows.map((m) => m.sender).lastIndexOf("customer");
  if (lastCustomerIdx < 0) return { status: "skipped_no_customer_msg" };
  const userMessage = (rows[lastCustomerIdx].text ?? "").trim();
  if (!userMessage) return { status: "skipped_no_customer_msg" };
  const lastInboundAtMs = new Date(rows[lastCustomerIdx].created_at).getTime();
  const history: LlmMessage[] = rows
    .slice(0, lastCustomerIdx)
    .filter((m) => m.text)
    .map((m) => ({ role: m.sender === "customer" ? "user" : "assistant", content: m.text as string }));

  // HANDOFF-HARDENING (Fix 1): after a timeout auto-return, open with an honest
  // resume line that acknowledges the wait BEFORE the Brain answers the message.
  if (resumedAfterTimeout) {
    const resumeText = "معلش اتأخرنا عليك 🙏 أنا معاك دلوقتي ونكمّل على طول.";
    const { data: rmsg } = await admin
      .from("messages")
      .insert({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        direction: "outbound",
        sender: "ai",
        text: resumeText,
        status: "sent",
        meta: { kind: "handoff_resume" },
      })
      .select("id")
      .single();
    const rsend = await sendWhatsAppText({ to: phone, text: resumeText, lastInboundAtMs });
    if (rmsg?.id) {
      await admin
        .from("messages")
        .update(rsend.status === "sent" ? { status: "sent", channel_message_id: rsend.externalMessageId ?? null } : { status: "failed" })
        .eq("id", rmsg.id);
    }
  }

  // 3. Brain turn — persists the AI reply, logs cost to agent_runs, flips to
  //    human on escalation. Any failure hands the thread to a human + notes it.
  let outcome;
  try {
    outcome = await runCustomerTurn(admin, { restaurantId, conversationId, history, userMessage });
  } catch (e) {
    // Fix B: surface the REAL message (was discarding it → «agent_error: agent_error»).
    const detail = e instanceof CustomerTurnError ? (e.message || e.code) : e instanceof Error ? e.message : String(e);
    // Ownership axis (spine Step 1): an agent error hands the thread to a human.
    await setOwnershipState(admin, conversationId, "HUMAN_ACTIVE", {
      extra: { owner: "human", status: "يحتاج تدخل موظف", escalation_reason: `agent_error: ${detail}` },
    });
    await noteToTimeline(
      admin,
      restaurantId,
      conversationId,
      "تعذّر توليد رد المساعد تلقائياً — تم تحويل المحادثة لموظف للمتابعة.",
      { kind: "agent_error", detail }
    );
    // Critical-failure alert: console banner + email (best-effort, never throws).
    await recordCriticalAlert(admin, { restaurantId, type: "agent_error", detail, conversationId });
    return { status: "agent_error", error: detail };
  }

  // 4.5 (S9-4.5): a finalized draft becomes a real order row BEFORE the
  // customer-facing confirmation is transmitted. If the server-side DB recompute
  // rejects the draft, do not send a "confirmed" message.
  let persistedOrder: PersistedDraftOrder | null = null;
  if (outcome.draft.finalized) {
    try {
      persistedOrder = await persistOrderFromDraft(admin, { restaurantId, conversationId, customerId, draft: outcome.draft, agentRunId: outcome.agentRunId });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("[respond-and-send] order persist error", e);
      if (outcome.replyMessageId) {
        await admin.from("messages").update({ status: "failed" }).eq("id", outcome.replyMessageId);
      }
      // Ownership axis (spine Step 1): a persist failure hands the thread to a human.
      await setOwnershipState(admin, conversationId, "HUMAN_ACTIVE", {
        extra: { owner: "human", status: "يحتاج تدخل موظف", escalation_reason: `order_persist_error: ${detail}` },
      });
      await noteToTimeline(
        admin,
        restaurantId,
        conversationId,
        "تعذّر تأكيد الطلب تلقائياً لأن مراجعة الأسعار من السيستم فشلت — تم تحويل المحادثة لموظف للمتابعة.",
        { kind: "order_persist_error", detail }
      );
      // Q2 — revenue path: order row failed to persist. Surface to banner + WhatsApp.
      await recordCriticalAlert(admin, { restaurantId, type: "order_persist_failed", detail, conversationId });
      return { status: "agent_error", reply: outcome.reply, escalate: true, error: detail };
    }

    // Karim Pro P1 terminal hook — ORDER FINALIZED. Emit ONLY after the order is
    // actually committed (so order_placed/order_total/order_id are TRUE, never
    // narrated). Pro-gated; standard tenants emit nothing.
    if (persistedOrder?.created && persistedOrder.orderId) {
      await emitConversationReport(admin, {
        restaurantId,
        tier: outcome.tier,
        features: outcome.features,
        conversationId,
        terminalTrigger: "finalized",
        order: {
          id: persistedOrder.orderId,
          total: outcome.draft.total,
          fulfillment: outcome.draft.fulfillment,
          paymentStatus: "unpaid",
          // F1.7 Fix 2 / F1.6 — the real method stamped at creation (orders-create.ts):
          // the customer's chosen method, or "cod" when none was selected.
          paymentMethod: outcome.draft.paymentMethod ?? "cod",
          branchId: null,
        },
        transcript: [
          ...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: outcome.reply },
        ],
      });
    }
  }

  // If the draft was finalized but the persist was an idempotent no-op, the same
  // order content was already placed in a prior turn (reorder of identical items in
  // the same conversation). Skip the customer-facing send — never tell the customer
  // "your order is placed" when we did not create a new order row.
  if (outcome.draft.finalized && persistedOrder?.created === false) {
    console.warn("[respond-and-send] idempotent no-op — skipping duplicate confirmation", {
      conversationId,
      orderId: persistedOrder.orderId,
      agentRunId: outcome.agentRunId,
    });
    if (outcome.replyMessageId) {
      await admin.from("messages").update({ status: "failed" }).eq("id", outcome.replyMessageId);
    }
    return { status: "deduped", reply: outcome.reply };
  }

  // 4. Put the reply on the WhatsApp wire — as an interactive message when the
  //    Brain presented options (degrades to numbered text on failure), else text.
  const send = outcome.presentation
    ? await sendWhatsAppInteractive({ to: phone, body: outcome.reply, presentation: outcome.presentation, lastInboundAtMs })
    : await sendWhatsAppText({ to: phone, text: outcome.reply, lastInboundAtMs });

  // Receipt resend — customer asked «فين الايصال؟» and the model called resend_receipt.
  if (outcome.resendReceipt && conversationId) {
    const { data: latestOrd } = await admin
      .from("orders")
      .select("id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestOrd?.id) {
      sendReceiptToCustomer(admin, latestOrd.id as string).catch((e) => {
        console.error("[respond-and-send] receipt resend error", e);
        // Q2 — best-effort alert on a failed receipt resend (non-blocking).
        void recordCriticalAlert(admin, {
          type: "receipt_send_failed",
          restaurantId,
          conversationId,
          detail: e instanceof Error ? e.message : String(e),
          context: { orderId: latestOrd.id, resend: true },
        });
      });
    }
  }

  // Receipt auto-sends after the customer confirmation (skips in test mode).
  if (persistedOrder?.created && persistedOrder.orderId) {
    try {
      // Delivery dispatch (flag-gated): a finalized DELIVERY order opens a pending
      // delivery for the operator to assign. Fully inert when the flag is off.
      if (ENABLE_DELIVERY_TRACKING && persistedOrder.orderId && outcome.draft.fulfillment === "delivery") {
        try {
          await createDeliveryForOrder(admin, { restaurantId, orderId: persistedOrder.orderId });
        } catch (e) {
          console.error("[respond-and-send] delivery create error", e);
        }
      }
      await sendReceiptToCustomer(admin, persistedOrder.orderId);
    } catch (e) {
      console.error("[respond-and-send] receipt error", e);
      // Q2 — customer didn't get their receipt; surface to banner + WhatsApp.
      await recordCriticalAlert(admin, {
        type: "receipt_send_failed",
        restaurantId,
        conversationId,
        detail: e instanceof Error ? e.message : String(e),
        context: { orderId: persistedOrder.orderId },
      });
    }
  }

  if (send.status === "sent") {
    if (outcome.photoRequests.length) {
      await sendRequestedPhotos(admin, restaurantId, conversationId, phone, outcome.photoRequests, lastInboundAtMs);
    }
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
    if (outcome.photoRequests.length) {
      await sendRequestedPhotos(admin, restaurantId, conversationId, phone, outcome.photoRequests, lastInboundAtMs);
    }
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
  // Critical-failure alert: console banner + email (best-effort, never throws).
  await recordCriticalAlert(admin, {
    restaurantId,
    type: "whatsapp_send_failed",
    detail: send.error ?? "خطأ غير معروف",
    conversationId,
    context: { windowState: send.windowState, attempts: send.attempts },
  });
  return {
    status: "send_failed",
    reply: outcome.reply,
    escalate: outcome.escalate,
    sendStatus: send.status,
    error: send.error,
  };
}
