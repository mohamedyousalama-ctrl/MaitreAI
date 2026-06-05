// ============================================================================
// MaitreAI — Local order engine store (Zustand + localStorage persist)
// Turns conversation draft orders into real persisted orders, drives the
// Orders/Kitchen pages, and notifies the related conversation on status change.
// No backend, no payment provider, no network.
// ============================================================================

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newId } from "./store";
import { useConversationStore } from "./conversation-store";
import { buildSeedOrders } from "./order-seed";
import {
  buildOrderItems,
  computeTotals,
  orderStatusForKitchen,
  orderStatusMessage,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "./orders";
import type { Brain } from "./ai/engine";
import type {
  DraftOrder,
  FulfillmentKey,
  KitchenStatusKey,
  LocalOrder,
  OrderActor,
  OrderEvent,
  OrderStatusKey,
  PaymentStatusKey,
} from "./types";

export interface CreateOrderInput {
  conversationId?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  branchId?: string;
  branchName: string;
  fulfillmentType: FulfillmentKey;
  deliveryAreaId?: string;
  deliveryAddress?: string;
  notes?: string;
  draft: DraftOrder;
}

interface OrderState {
  orders: LocalOrder[];
  nextNumber: number;

  createOrderFromDraft: (input: CreateOrderInput, brain: Brain) => LocalOrder;
  updateOrderStatus: (id: string, status: OrderStatusKey, actor?: OrderActor) => void;
  updatePaymentStatus: (id: string, status: PaymentStatusKey, actor?: OrderActor) => void;
  updateKitchenStatus: (id: string, status: KitchenStatusKey, actor?: OrderActor) => void;
  cancelOrder: (id: string, actor?: OrderActor) => void;
  sendPaymentLinkMock: (id: string) => void;
  markPaid: (id: string, actor?: OrderActor) => void;
  addOrderEvent: (id: string, event: Omit<OrderEvent, "id" | "timestamp">) => void;
  getOrdersByConversation: (conversationId: string) => LocalOrder[];
  getLatestOrderByConversation: (conversationId: string) => LocalOrder | undefined;
  resetOrders: () => void;
}

const ev = (type: string, label: string, actor: OrderActor): OrderEvent => ({
  id: newId("ev"),
  type,
  label,
  timestamp: Date.now(),
  actor,
});

/** Add a system message to the linked conversation (if any). */
function notifyConversation(order: LocalOrder | undefined, text: string | undefined) {
  if (!order?.conversationId || !text) return;
  useConversationStore.getState().addSystemMessage(order.conversationId, text);
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: buildSeedOrders(),
      nextNumber: 1048,

      createOrderFromDraft: (input, brain) => {
        const items = buildOrderItems(input.draft, brain, () => newId("oi"));
        const area =
          input.fulfillmentType === "delivery" && input.deliveryAreaId
            ? brain.deliveryAreas.find((a) => a.id === input.deliveryAreaId)
            : undefined;
        const deliveryFee = area?.deliveryFee ?? 0;
        const { subtotal, total } = computeTotals(items, deliveryFee);
        const now = Date.now();
        const number = get().nextNumber;

        const order: LocalOrder = {
          id: newId("ord"),
          orderNumber: String(number),
          conversationId: input.conversationId,
          customerId: input.customerId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          source: "whatsapp",
          branchId: input.branchId,
          branchName: input.branchName,
          fulfillmentType: input.fulfillmentType,
          deliveryAreaId: input.deliveryAreaId,
          deliveryAddress: input.deliveryAddress,
          items,
          subtotal,
          deliveryFee,
          total,
          currency: "ر.س",
          paymentStatus: "unpaid",
          orderStatus: "pending_payment",
          kitchenStatus: "new",
          notes: input.notes,
          createdAt: now,
          updatedAt: now,
          events: [ev("created", "تم إنشاء الطلب من المحادثة", "ai")],
        };

        set((s) => ({ orders: [order, ...s.orders], nextNumber: s.nextNumber + 1 }));
        return order;
      },

      updateOrderStatus: (id, status, actor = "system") => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return;
        const event = ev("status", `الحالة: ${ORDER_STATUS_LABELS[status]}`, actor);
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, orderStatus: status, updatedAt: event.timestamp, events: [...o.events, event] } : o
          ),
        }));
        notifyConversation(order, orderStatusMessage(order, status));
        if (status === "delivered" && order.conversationId) {
          useConversationStore.getState().setStatus(order.conversationId, "طلب مكتمل");
        }
      },

      updatePaymentStatus: (id, status, actor = "system") => {
        const event = ev("payment", `الدفع: ${PAYMENT_STATUS_LABELS[status]}`, actor);
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, paymentStatus: status, updatedAt: event.timestamp, events: [...o.events, event] } : o
          ),
        }));
      },

      updateKitchenStatus: (id, status, actor = "human") => {
        const event = ev("kitchen", `المطبخ: ${status}`, actor);
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, kitchenStatus: status, updatedAt: event.timestamp, events: [...o.events, event] } : o
          ),
        }));
        // Keep order status in sync with kitchen progress (notifies conversation).
        get().updateOrderStatus(id, orderStatusForKitchen(status), actor);
      },

      cancelOrder: (id, actor = "human") => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return;
        const event = ev("status", "تم إلغاء الطلب", actor);
        const refunded: PaymentStatusKey = order.paymentStatus === "paid" ? "refunded" : order.paymentStatus;
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id
              ? { ...o, orderStatus: "cancelled", kitchenStatus: "completed", paymentStatus: refunded, updatedAt: event.timestamp, events: [...o.events, event] }
              : o
          ),
        }));
        notifyConversation(order, orderStatusMessage(order, "cancelled"));
      },

      sendPaymentLinkMock: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return;
        const event = ev("payment", "تم إرسال رابط دفع تجريبي", "human");
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, paymentStatus: "payment_link_sent", updatedAt: event.timestamp, events: [...o.events, event] } : o
          ),
        }));
        notifyConversation(order, `رابط الدفع التجريبي لطلب #${order.orderNumber}: pay.maitre.ai/${order.orderNumber}`);
      },

      markPaid: (id, actor = "human") => {
        const order = get().orders.find((o) => o.id === id);
        if (!order) return;
        const event = ev("payment", "تم استلام الدفع", actor);
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id
              ? { ...o, paymentStatus: "paid", orderStatus: "paid", kitchenStatus: "new", updatedAt: event.timestamp, events: [...o.events, event] }
              : o
          ),
        }));
        notifyConversation(order, `تم استلام الدفع لطلب #${order.orderNumber}. بدأ تجهيز الطلب.`);
      },

      addOrderEvent: (id, event) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, events: [...o.events, { ...event, id: newId("ev"), timestamp: Date.now() }] } : o
          ),
        })),

      getOrdersByConversation: (conversationId) => get().orders.filter((o) => o.conversationId === conversationId),

      getLatestOrderByConversation: (conversationId) =>
        get()
          .orders.filter((o) => o.conversationId === conversationId)
          .sort((a, b) => b.createdAt - a.createdAt)[0],

      resetOrders: () => set({ orders: buildSeedOrders(), nextNumber: 1048 }),
    }),
    {
      name: "maitreai-orders",
      version: 1,
    }
  )
);
