// ============================================================================
// MaitreAI — Conversation engine hook
// Bridges the conversation store, the restaurant brain store, and the local
// mock AI engine. Simulates "AI thinking" with a timeout — no network at all.
// ============================================================================

"use client";

import { useCallback } from "react";
import { useConversationStore, nowTime } from "../conversation-store";
import { useRestaurantStore, newId } from "../store";
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
      const result = analyzeMessage(trimmed, brain);
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

  return {
    conversations,
    selectedId,
    selected,
    intentHistory,
    selectConversation,
    sendCustomer,
    sendHuman,
    takeover,
    returnToAi,
  };
}
