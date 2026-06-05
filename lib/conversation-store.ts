// ============================================================================
// MaitreAI — Conversation state engine (Zustand + localStorage persist)
// Holds the live conversations, messages, selection, owner (AI/human), and the
// intent history produced by the local mock AI engine. No backend, no network.
// ============================================================================

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChannelKey,
  ChatMessage,
  Conversation,
  IntentHistoryEntry,
} from "./types";
import { conversations as seedConversations } from "./mock-data";
import { newId } from "./store";

/** Local time string with western digits, e.g. "3:05 م". */
export function nowTime(): string {
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes();
  const mer = h < 12 ? "ص" : "م";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${mer}`;
}

const cloneSeed = (): Conversation[] => JSON.parse(JSON.stringify(seedConversations));

interface ConversationState {
  conversations: Conversation[];
  selectedId: string;
  intentHistory: IntentHistoryEntry[];

  selectConversation: (id: string) => void;
  findOrCreateByPhone: (args: {
    phone: string;
    name?: string;
    channel?: ChannelKey;
    branch?: string;
  }) => string;
  addCustomerMessage: (convId: string, text: string) => string;
  addHumanMessage: (convId: string, text: string) => void;
  addSystemMessage: (convId: string, text: string) => void;
  setStatus: (convId: string, status: Conversation["status"]) => void;
  attachOrder: (convId: string, orderId: string) => void;
  setTyping: (convId: string, value: boolean) => void;
  commitAiTurn: (
    convId: string,
    aiMessage: ChatMessage,
    patch: Partial<Conversation>,
    history: IntentHistoryEntry
  ) => void;
  takeoverToHuman: (convId: string) => void;
  returnToAi: (convId: string) => void;
  resetConversations: () => void;
}

const patchConv = (
  list: Conversation[],
  id: string,
  fn: (c: Conversation) => Conversation
): Conversation[] => list.map((c) => (c.id === id ? fn(c) : c));

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: cloneSeed(),
      selectedId: seedConversations[0]?.id ?? "",
      intentHistory: [],

      selectConversation: (id) => set({ selectedId: id }),

      // Match an existing conversation by phone (digits only) or create a new one.
      // Used by the messaging simulator + inbound webhook injection.
      findOrCreateByPhone: ({ phone, name, channel = "whatsapp", branch }) => {
        const digits = (p: string) => p.replace(/\D/g, "");
        const target = digits(phone);
        const existing = get().conversations.find((c) => digits(c.phone) === target);
        if (existing) {
          set({ selectedId: existing.id });
          return existing.id;
        }
        const id = newId("conv");
        const palette = ["#2563eb", "#9333ea", "#059669", "#f97316", "#06b6d4", "#db2777"];
        const conv: Conversation = {
          id,
          customer: name?.trim() || phone,
          phone,
          avatarColor: palette[Math.floor(Math.random() * palette.length)],
          channel,
          owner: "ai",
          status: "AI نشط",
          lastMessage: "",
          lastTime: nowTime(),
          unread: 0,
          branch: branch || "فرع الياسمين",
          messages: [],
        };
        set((s) => ({ conversations: [conv, ...s.conversations], selectedId: id }));
        return id;
      },

      addCustomerMessage: (convId, text) => {
        const id = newId("msg");
        const time = nowTime();
        set((s) => ({
          conversations: patchConv(s.conversations, convId, (c) => ({
            ...c,
            messages: [...c.messages, { id, sender: "customer", text, time }],
            lastMessage: text,
            lastTime: time,
            unread: 0,
          })),
        }));
        return id;
      },

      addHumanMessage: (convId, text) => {
        const time = nowTime();
        set((s) => ({
          conversations: patchConv(s.conversations, convId, (c) => ({
            ...c,
            messages: [...c.messages, { id: newId("msg"), sender: "human", text, time }],
            lastMessage: `موظف: ${text}`,
            lastTime: time,
          })),
        }));
      },

      addSystemMessage: (convId, text) => {
        const time = nowTime();
        set((s) => ({
          conversations: patchConv(s.conversations, convId, (c) => ({
            ...c,
            messages: [...c.messages, { id: newId("msg"), sender: "system", text, time }],
            lastMessage: text,
            lastTime: time,
          })),
        }));
      },

      setStatus: (convId, status) =>
        set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, status })) })),

      attachOrder: (convId, orderId) =>
        set((s) => ({
          conversations: patchConv(s.conversations, convId, (c) => ({
            ...c,
            linkedOrderId: orderId,
            draftOrder: undefined,
            status: "بانتظار الدفع",
          })),
        })),

      setTyping: (convId, value) =>
        set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, aiTyping: value })) })),

      commitAiTurn: (convId, aiMessage, patch, history) =>
        set((s) => ({
          conversations: patchConv(s.conversations, convId, (c) => ({
            ...c,
            messages: [...c.messages, aiMessage],
            aiTyping: false,
            lastMessage: aiMessage.text,
            lastTime: aiMessage.time,
            ...patch,
          })),
          intentHistory: [...s.intentHistory, history],
        })),

      takeoverToHuman: (convId) =>
        set((s) => ({
          conversations: patchConv(s.conversations, convId, (c) => ({
            ...c,
            owner: "human",
            status: "تم التحويل لموظف",
            aiTyping: false,
            messages: [
              ...c.messages,
              { id: newId("msg"), sender: "system", text: "تم تحويل المحادثة إلى موظف", time: nowTime() },
            ],
          })),
        })),

      returnToAi: (convId) =>
        set((s) => ({
          conversations: patchConv(s.conversations, convId, (c) => ({
            ...c,
            owner: "ai",
            status: "AI نشط",
            escalationReason: undefined,
            messages: [
              ...c.messages,
              { id: newId("msg"), sender: "system", text: "تمت إعادة المحادثة إلى الموظف الذكي", time: nowTime() },
            ],
          })),
        })),

      resetConversations: () => set({ conversations: cloneSeed(), intentHistory: [], selectedId: seedConversations[0]?.id ?? "" }),
    }),
    {
      name: "maitreai-conversations",
      version: 1,
    }
  )
);
