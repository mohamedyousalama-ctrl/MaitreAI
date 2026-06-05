// ============================================================================
// MaitreAI — Conversation engine hook
// Bridges the conversation store, the restaurant brain store, and the local
// mock AI engine. Simulates "AI thinking" with a timeout — no network at all.
// ============================================================================

"use client";

import { useCallback } from "react";
import { useConversationStore, nowTime } from "../conversation-store";
import { useRestaurantStore, newId } from "../store";
import { useOrderStore } from "../order-store";
import { usePaymentStore, currentOrigin } from "../payment-store";
import { isSessionActive } from "../payments";
import { customers } from "../mock-data";
import { analyzeMessage, applyDraft, type Brain } from "./engine";
import type { ChatMessage, ConversationOwner, IntentHistoryEntry } from "../types";

const AI_THINK_MS = 900;

function snapshotBrain(): Brain {
  const r = useRestaurantStore.getState();
  return {
    profile: r.profile,
    menuItems: r.menuItems,
    modifiers: r.modifiers,
    branches: r.branches,
    deliveryAreas: r.deliveryAreas,
    faqs: r.faqs,
    policies: r.policies,
    aiTone: r.aiTone,
  };
}

export function useConversationEngine() {
  const conversations = useConversationStore((s) => s.conversations);
  const selectedId = useConversationStore((s) => s.selectedId);
  const intentHistory = useConversationStore((s) => s.intentHistory);
  const selectConversation = useConversationStore((s) => s.selectConversation);

  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0];

  // Customer sends a message → AI (if it owns the conversation) replies locally.
  const sendCustomer = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const store = useConversationStore.getState();
    const convId = store.selectedId;
    const conv = store.conversations.find((c) => c.id === convId);
    if (!conv) return;

    store.addCustomerMessage(convId, trimmed);
    if (conv.owner !== "ai") return; // human owns the conversation → no AI reply

    store.setTyping(convId, true);
    setTimeout(() => {
      const brain = snapshotBrain();
      const latestOrder = useOrderStore.getState().getLatestOrderByConversation(convId);
      const latestSession = latestOrder
        ? usePaymentStore.getState().getSessionByOrder(latestOrder.id)
        : undefined;
      const result = analyzeMessage(trimmed, brain, {
        latestOrder: latestOrder
          ? { orderNumber: latestOrder.orderNumber, orderStatus: latestOrder.orderStatus }
          : undefined,
        latestPaymentStatus: latestSession?.status,
      });
      const latest = useConversationStore.getState().conversations.find((c) => c.id === convId);

      const aiMessage: ChatMessage = {
        id: newId("msg"),
        sender: "ai",
        text: result.reply,
        time: nowTime(),
        confidence: result.confidence,
        intent: result.intent,
        sources: result.sources,
        suggestedAction: result.suggestedAction,
      };

      const draftOrder = applyDraft(latest?.draftOrder, result, brain);
      const owner: ConversationOwner = result.intent === "human_request" ? "human" : "ai";

      const history: IntentHistoryEntry = {
        id: newId("ih"),
        conversationId: convId,
        messageId: aiMessage.id,
        detectedIntent: result.intent,
        confidence: result.confidence,
        entities: result.entities,
        sourcesUsed: result.sources,
        suggestedAction: result.suggestedAction,
        createdAt: Date.now(),
      };

      useConversationStore.getState().commitAiTurn(
        convId,
        aiMessage,
        {
          status: result.status,
          owner,
          aiConfidence: result.confidence,
          currentIntent: result.intent,
          entities: result.entities,
          suggestedAction: result.suggestedAction,
          escalationReason: result.escalate ? result.escalationReason : undefined,
          draftOrder,
        },
        history
      );
    }, AI_THINK_MS);
  }, []);

  const sendHuman = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    useConversationStore.getState().addHumanMessage(useConversationStore.getState().selectedId, trimmed);
  }, []);

  const takeover = useCallback(() => {
    useConversationStore.getState().takeoverToHuman(useConversationStore.getState().selectedId);
  }, []);

  const returnToAi = useCallback(() => {
    useConversationStore.getState().returnToAi(useConversationStore.getState().selectedId);
  }, []);

  // Reactive: the latest local order + payment session for the selected conversation.
  const orders = useOrderStore((s) => s.orders);
  const sessions = usePaymentStore((s) => s.sessions);
  const createdOrder = selected
    ? orders
        .filter((o) => o.conversationId === selected.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
    : undefined;
  const paymentSession = createdOrder
    ? sessions.filter((s) => s.orderId === createdOrder.id).sort((a, b) => b.createdAt - a.createdAt)[0]
    : undefined;

  // Confirm the conversation draft → create a real local order.
  const confirmOrder = useCallback(() => {
    const convStore = useConversationStore.getState();
    const convId = convStore.selectedId;
    const conv = convStore.conversations.find((c) => c.id === convId);
    if (!conv?.draftOrder || conv.draftOrder.items.length === 0) return;

    const brain = snapshotBrain();
    const branch = brain.branches.find((b) => b.name === conv.branch);
    const area = conv.entities?.deliveryArea
      ? brain.deliveryAreas.find((a) => a.name === conv.entities!.deliveryArea)
      : undefined;
    const customer = customers.find((c) => c.name === conv.customer);

    const order = useOrderStore.getState().createOrderFromDraft(
      {
        conversationId: conv.id,
        customerId: customer?.id,
        customerName: conv.customer,
        customerPhone: conv.phone,
        branchId: branch?.id,
        branchName: conv.branch,
        fulfillmentType: "delivery",
        deliveryAreaId: area?.id,
        draft: conv.draftOrder,
      },
      brain
    );

    convStore.attachOrder(conv.id, order.id);
    convStore.addSystemMessage(
      conv.id,
      `تم إنشاء الطلب #${order.orderNumber} بإجمالي ${order.total} ر.س. الخطوة التالية: إرسال رابط الدفع.`
    );
  }, []);

  // Primary flow: generate a working mock checkout link and post it to the chat.
  const sendPaymentLink = useCallback(() => {
    const o = useOrderStore.getState().getLatestOrderByConversation(useConversationStore.getState().selectedId);
    if (o) usePaymentStore.getState().sendPaymentLink(o.id, currentOrigin());
  }, []);

  // Admin override: mark paid directly (routes through the active session if any).
  const markPaid = useCallback(() => {
    const o = useOrderStore.getState().getLatestOrderByConversation(useConversationStore.getState().selectedId);
    if (!o) return;
    const sess = usePaymentStore.getState().getSessionByOrder(o.id);
    if (sess && isSessionActive(sess.status)) usePaymentStore.getState().simulateSuccess(sess.id, "card");
    else useOrderStore.getState().markPaid(o.id, "human");
  }, []);

  return {
    conversations,
    selectedId,
    selected,
    intentHistory,
    createdOrder,
    paymentSession,
    selectConversation,
    sendCustomer,
    sendHuman,
    takeover,
    returnToAi,
    confirmOrder,
    sendPaymentLink,
    markPaid,
  };
}
