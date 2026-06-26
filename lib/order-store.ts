// ============================================================================
// MaitreAI — Order engine store (Sprint 7 Pass 2)
// DB-backed when Supabase is configured: orders load from the tenant, mutations
// write through to Postgres, and realtime keeps every device in sync. Demo mode
// keeps the original seed + localStorage behavior. The event log is client-side
// (Pass 2); status/payment/totals/items are persisted.
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
import { createClient } from "./supabase/client";
import {
  ensureCustomerId,
  insertOrderDb,
  loadOrders,
  subscribeOrders,
  updateOrderDb,
} from "./db/orders";
import type { SupabaseClient } from "@supabase/supabase-js";
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

  _sb: SupabaseClient | null;
  _rid: string | null;
  dbReady: boolean;
  initFromDb: (restaurantId: string) => Promise<(() => void) | undefined>;
  reload: () => Promise<void>;

  createOrderFromDraft: (input: CreateOrderInput, brain: Brain) => LocalOrder;
  updateOrderStatus: (id: string, status: OrderStatusKey, actor?: OrderActor) => void;
  updatePaymentStatus: (id: string, status: PaymentStatusKey, actor?: OrderActor) => void;
  updateKitchenStatus: (id: string, status: KitchenStatusKey, actor?: OrderActor) => void;
  cancelOrder: (id: string, actor?: OrderActor) => void;
  markPaid: (id: string, actor?: OrderActor) => void;
  addOrderEvent: (id: string, event: Omit<OrderEvent, "id" | "timestamp">) => void;
  getOrdersByConversation: (conversationId: string) => LocalOrder[];
  getLatestOrderByConversation: (conversationId: string) => LocalOrder | undefined;
  resetOrders: () => void;
}

const fire = (p: PromiseLike<unknown>) => void Promise.resolve(p).then(undefined, (e) => console.error("[orders:db]", e));

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

let reloadTimer: ReturnType<typeof setTimeout> | undefined;

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: buildSeedOrders(),
      nextNumber: 1048,

      _sb: null,
      _rid: null,
      dbReady: false,

      initFromDb: async (restaurantId) => {
        const sb = createClient();
        if (!sb) return undefined;
        set({ _sb: sb, _rid: restaurantId });
        const orders = await loadOrders(sb, restaurantId);
        set({ orders, dbReady: true });
        return subscribeOrders(sb, restaurantId, () => {
          clearTimeout(reloadTimer);
          reloadTimer = setTimeout(() => fire(get().reload()), 200);
        });
      },

      reload: async () => {
        const { _sb, _rid } = get();
        if (!_sb || !_rid) return;
        const fresh = await loadOrders(_sb, _rid);
        // Keep any optimistic order not yet visible in the DB result.
        const freshIds = new Set(fresh.map((o) => o.id));
        const pending = get().orders.filter((o) => !freshIds.has(o.id) && o.createdAt > Date.now() - 5000);
        set({ orders: [...pending, ...fresh] });
      },

      createOrderFromDraft: (input, brain) => {
        const { _sb, _rid } = get();
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
          id: _sb ? crypto.randomUUID() : newId("ord"),
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
          currency: brain.profile?.currency || "ج.م",
          paymentStatus: "unpaid",
          paymentMethod: null, // unspecified until a method is recorded (read-only display elsewhere)
          orderStatus: "pending_payment",
          kitchenStatus: "new",
          notes: input.notes,
          createdAt: now,
          updatedAt: now,
          events: [ev("created", "تم إنشاء الطلب من المحادثة", "ai")],
        };

        set((s) => ({ orders: [order, ...s.orders], nextNumber: s.nextNumber + 1 }));

        if (_sb && _rid) {
          fire(
            ensureCustomerId(_sb, _rid, order.customerPhone, order.customerName).then((cid) =>
              insertOrderDb(_sb, _rid, order, cid)
            )
          );
        }
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
        const { _sb } = get();
        if (_sb) fire(updateOrderDb(_sb, id, { order_status: status }));
        notifyConversation(order, orderStatusMessage(order, status));
        if (status === "delivered") {
          if (order.conversationId) {
            useConversationStore.getState().setStatus(order.conversationId, "طلب مكتمل");
          }
          // COD capture: fire for unpaid delivery orders completed via the order screen.
          // The server route double-guards (fulfillment=delivery, payment_status!=paid).
          // captureCodOnDelivered is idempotent on order_id — safe if the driver dispatch
          // path already fired it (no double-capture).
          if (order.fulfillmentType === "delivery" && order.paymentStatus !== "paid") {
            fire(
              fetch("/api/cod/capture-delivered", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: id }),
              }).catch((e) => console.error("[order] COD capture error", e))
            );
          }
        }
      },

      updatePaymentStatus: (id, status, actor = "system") => {
        const event = ev("payment", `الدفع: ${PAYMENT_STATUS_LABELS[status]}`, actor);
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, paymentStatus: status, updatedAt: event.timestamp, events: [...o.events, event] } : o
          ),
        }));
        const { _sb } = get();
        if (_sb) fire(updateOrderDb(_sb, id, { payment_status: status }));
      },

      updateKitchenStatus: (id, status, actor = "human") => {
        const event = ev("kitchen", `المطبخ: ${status}`, actor);
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, kitchenStatus: status, updatedAt: event.timestamp, events: [...o.events, event] } : o
          ),
        }));
        // Keep order status in sync with kitchen progress (persists + notifies).
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
        const { _sb } = get();
        if (_sb) fire(updateOrderDb(_sb, id, { order_status: "cancelled", payment_status: refunded }));
        notifyConversation(order, orderStatusMessage(order, "cancelled"));
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
        const { _sb } = get();
        if (_sb) fire(updateOrderDb(_sb, id, { payment_status: "paid", order_status: "paid" }));
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
      partialize: (s) => ({ orders: s.orders, nextNumber: s.nextNumber }),
    }
  )
);
