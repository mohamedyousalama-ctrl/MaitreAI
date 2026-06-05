// ============================================================================
// MaitreAI — Local mock payment store (Zustand + localStorage persist)
// Simulates a payment provider: sessions, a working local checkout link, and
// a simulated success/failure/expiry "callback" that updates the order and
// notifies the conversation. NO real provider, NO real webhooks, NO network.
// ============================================================================

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newId } from "./store";
import { useOrderStore } from "./order-store";
import { useConversationStore } from "./conversation-store";
import { sendOutbound } from "./messaging/service";
import { DEFAULT_EXPIRY_MS, isSessionActive } from "./payments";
import type { PaymentEvent, PaymentEventActor, PaymentMethodKey, PaymentSession } from "./types";

// Server-side fallback only — checkout links are generated in the browser, so
// in production this resolves to window.location.origin (the deployed URL).
// NEXT_PUBLIC_APP_URL lets a deploy override the non-browser fallback.
const DEFAULT_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export function currentOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : DEFAULT_ORIGIN;
}

const pev = (type: string, label: string, actor: PaymentEventActor): PaymentEvent => ({
  id: newId("pev"),
  type,
  label,
  timestamp: Date.now(),
  actor,
});

interface PaymentState {
  sessions: PaymentSession[];

  createPaymentSession: (orderId: string, origin?: string) => PaymentSession | undefined;
  sendPaymentLink: (orderId: string, origin?: string) => PaymentSession | undefined;
  markOpened: (sessionId: string) => void;
  simulateSuccess: (sessionId: string, method?: PaymentMethodKey) => void;
  simulateFailure: (sessionId: string) => void;
  expireSession: (sessionId: string) => void;
  cancelSession: (sessionId: string) => void;
  refundSession: (sessionId: string) => void;
  getSession: (sessionId: string) => PaymentSession | undefined;
  getSessionByOrder: (orderId: string) => PaymentSession | undefined;
  getLatestSessionByConversation: (conversationId: string) => PaymentSession | undefined;
  addPaymentEvent: (sessionId: string, event: Omit<PaymentEvent, "id" | "timestamp">) => void;
  sweepExpired: () => void;
}

const patch = (
  list: PaymentSession[],
  id: string,
  fn: (s: PaymentSession) => PaymentSession
): PaymentSession[] => list.map((s) => (s.id === id ? fn(s) : s));

function notify(conversationId: string | undefined, text: string) {
  if (!conversationId) return;
  useConversationStore.getState().addSystemMessage(conversationId, text);
}

export const usePaymentStore = create<PaymentState>()(
  persist(
    (set, get) => ({
      sessions: [],

      createPaymentSession: (orderId, origin = currentOrigin()) => {
        const order = useOrderStore.getState().orders.find((o) => o.id === orderId);
        if (!order) return undefined;

        // Reuse an existing active session for this order.
        const existing = get()
          .sessions.filter((s) => s.orderId === orderId && isSessionActive(s.status))
          .sort((a, b) => b.createdAt - a.createdAt)[0];
        if (existing) return existing;

        const now = Date.now();
        const id = newId("pay");
        const session: PaymentSession = {
          id,
          orderId,
          orderNumber: order.orderNumber,
          conversationId: order.conversationId,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          amount: order.total,
          currency: order.currency,
          status: "created",
          provider: "mock",
          checkoutUrl: `${origin}/checkout/${id}`,
          expiresAt: now + DEFAULT_EXPIRY_MS,
          createdAt: now,
          updatedAt: now,
          events: [pev("created", "تم إنشاء جلسة الدفع", "system")],
        };
        set((s) => ({ sessions: [session, ...s.sessions] }));
        return session;
      },

      sendPaymentLink: (orderId, origin = currentOrigin()) => {
        const session = get().createPaymentSession(orderId, origin);
        if (!session) return undefined;
        const event = pev("link_sent", "تم إرسال رابط الدفع", "system");
        set((s) => ({
          sessions: patch(s.sessions, session.id, (x) => ({
            ...x,
            status: "link_sent",
            updatedAt: event.timestamp,
            events: [...x.events, event],
          })),
        }));
        // Sync order + conversation.
        useOrderStore.getState().updatePaymentStatus(session.orderId, "payment_link_sent");
        if (session.conversationId) {
          useConversationStore.getState().setStatus(session.conversationId, "بانتظار الدفع");
        }
        const linkText = `رابط الدفع لطلب #${session.orderNumber}:\n${session.checkoutUrl}`;
        notify(session.conversationId, linkText);

        // Also route the link through the messaging adapter so the outbound log
        // records it as a channel message. No real send unless WhatsApp is
        // configured — otherwise the adapter returns a "skipped" result.
        const conv = session.conversationId
          ? useConversationStore.getState().conversations.find((c) => c.id === session.conversationId)
          : undefined;
        void sendOutbound({
          channel: conv?.channel ?? "whatsapp",
          to: session.customerPhone,
          text: linkText,
          kind: "payment_link",
          metadata: { url: session.checkoutUrl, orderNumber: session.orderNumber, sessionId: session.id },
        });

        return { ...session, status: "link_sent" };
      },

      markOpened: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session || !isSessionActive(session.status) || session.status === "opened") return;
        const event = pev("opened", "تم فتح صفحة الدفع", "customer");
        set((s) => ({
          sessions: patch(s.sessions, sessionId, (x) => ({ ...x, status: "opened", updatedAt: event.timestamp, events: [...x.events, event] })),
        }));
      },

      simulateSuccess: (sessionId, method = "mada") => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session || !isSessionActive(session.status)) return;
        const event = pev("paid", "تمت عملية الدفع بنجاح", "mock_provider");
        set((s) => ({
          sessions: patch(s.sessions, sessionId, (x) => ({
            ...x,
            status: "paid",
            method,
            paidAt: event.timestamp,
            updatedAt: event.timestamp,
            events: [...x.events, event],
          })),
        }));
        // Provider "callback" → order becomes paid (this also notifies the conversation).
        useOrderStore.getState().markPaid(session.orderId, "system");
      },

      simulateFailure: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session || !isSessionActive(session.status)) return;
        const event = pev("failed", "فشلت عملية الدفع", "mock_provider");
        set((s) => ({
          sessions: patch(s.sessions, sessionId, (x) => ({ ...x, status: "failed", updatedAt: event.timestamp, events: [...x.events, event] })),
        }));
        useOrderStore.getState().updatePaymentStatus(session.orderId, "failed");
        notify(session.conversationId, `لم تكتمل عملية الدفع لطلب #${session.orderNumber}. يمكنك المحاولة مرة أخرى.`);
      },

      expireSession: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session || !isSessionActive(session.status)) return;
        const event = pev("expired", "انتهت صلاحية رابط الدفع", "system");
        set((s) => ({
          sessions: patch(s.sessions, sessionId, (x) => ({ ...x, status: "expired", updatedAt: event.timestamp, events: [...x.events, event] })),
        }));
        useOrderStore.getState().updatePaymentStatus(session.orderId, "unpaid");
        notify(session.conversationId, `انتهت صلاحية رابط الدفع لطلب #${session.orderNumber}. يمكننا إرسال رابط جديد.`);
      },

      cancelSession: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) return;
        const event = pev("cancelled", "تم إلغاء جلسة الدفع", "human");
        set((s) => ({
          sessions: patch(s.sessions, sessionId, (x) => ({ ...x, status: "cancelled", updatedAt: event.timestamp, events: [...x.events, event] })),
        }));
        useOrderStore.getState().updatePaymentStatus(session.orderId, "unpaid");
      },

      refundSession: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) return;
        const event = pev("refunded", "تمت معالجة استرجاع المبلغ", "human");
        set((s) => ({
          sessions: patch(s.sessions, sessionId, (x) => ({ ...x, status: "refunded", updatedAt: event.timestamp, events: [...x.events, event] })),
        }));
        useOrderStore.getState().updatePaymentStatus(session.orderId, "refunded");
        notify(session.conversationId, `تمت معالجة استرجاع المبلغ لطلب #${session.orderNumber}.`);
      },

      getSession: (sessionId) => get().sessions.find((s) => s.id === sessionId),
      getSessionByOrder: (orderId) =>
        get().sessions.filter((s) => s.orderId === orderId).sort((a, b) => b.createdAt - a.createdAt)[0],
      getLatestSessionByConversation: (conversationId) =>
        get().sessions.filter((s) => s.conversationId === conversationId).sort((a, b) => b.createdAt - a.createdAt)[0],

      addPaymentEvent: (sessionId, event) =>
        set((s) => ({
          sessions: patch(s.sessions, sessionId, (x) => ({
            ...x,
            events: [...x.events, { ...event, id: newId("pev"), timestamp: Date.now() }],
          })),
        })),

      // Auto-expire active sessions whose time has elapsed (called on render).
      sweepExpired: () => {
        const now = Date.now();
        const due = get().sessions.filter((s) => isSessionActive(s.status) && now > s.expiresAt);
        due.forEach((s) => get().expireSession(s.id));
      },
    }),
    {
      name: "maitreai-payments",
      version: 1,
    }
  )
);
