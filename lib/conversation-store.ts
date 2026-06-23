// ============================================================================
// MaitreAI — Conversation state engine (Sprint 7 Pass 2)
// DB-backed when Supabase is configured: loads the tenant's conversations,
// writes messages/status through to Postgres, and stays in sync via realtime.
// Demo mode keeps the original seed + localStorage behavior. Ephemeral AI
// working state (draftOrder/entities/typing) lives client-side only.
// ============================================================================

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChannelKey, ChatMessage, Conversation, IntentHistoryEntry } from "./types";
import { conversations as seedConversations } from "./mock-data";
import { newId } from "./store";
import { createClient } from "./supabase/client";
import {
  ensureConversationDb,
  insertMessageDb,
  loadConversations,
  subscribeConversations,
  updateConversationDb,
} from "./db/conversations";
import { setOwnershipState } from "./db/ownership";
import { normalizePhone } from "./messaging/phone";
import type { SupabaseClient } from "@supabase/supabase-js";

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
const fire = (p: PromiseLike<unknown>) => void Promise.resolve(p).then(undefined, (e) => console.error("[conv:db]", e));
const digits = (p: string) => p.replace(/\D/g, "");

/** Push an operator/takeover message onto the real WhatsApp transport (S9-1).
 *  Server-side it no-ops gracefully in test mode / non-WhatsApp channels. */
const sendOverWhatsApp = (conversationId: string, messageId: string, text: string) =>
  fetch("/api/whatsapp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, messageId, text }),
  });

interface ConversationState {
  conversations: Conversation[];
  selectedId: string;
  intentHistory: IntentHistoryEntry[];

  _sb: SupabaseClient | null;
  _rid: string | null;
  dbReady: boolean;
  initFromDb: (restaurantId: string) => Promise<(() => void) | undefined>;
  reload: () => Promise<void>;

  selectConversation: (id: string) => void;
  findOrCreateByPhone: (args: { phone: string; name?: string; channel?: ChannelKey; branch?: string }) => string;
  addCustomerMessage: (convId: string, text: string) => string;
  addHumanMessage: (convId: string, text: string) => void;
  addSystemMessage: (convId: string, text: string) => void;
  setStatus: (convId: string, status: Conversation["status"]) => void;
  attachOrder: (convId: string, orderId: string) => void;
  setTyping: (convId: string, value: boolean) => void;
  commitAiTurn: (convId: string, aiMessage: ChatMessage, patch: Partial<Conversation>, history: IntentHistoryEntry) => void;
  takeoverToHuman: (convId: string) => void;
  returnToAi: (convId: string, note?: string) => void;
  resetConversations: () => void;
}

const patchConv = (list: Conversation[], id: string, fn: (c: Conversation) => Conversation): Conversation[] =>
  list.map((c) => (c.id === id ? fn(c) : c));

let reloadTimer: ReturnType<typeof setTimeout> | undefined;

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => {
      const msgId = () => (get()._sb ? crypto.randomUUID() : newId("msg"));
      const aiMeta = (m: ChatMessage) => ({
        confidence: m.confidence,
        intent: m.intent,
        sources: m.sources,
        suggestedAction: m.suggestedAction,
      });

      return {
        conversations: cloneSeed(),
        selectedId: seedConversations[0]?.id ?? "",
        intentHistory: [],

        _sb: null,
        _rid: null,
        dbReady: false,

        initFromDb: async (restaurantId) => {
          const sb = createClient();
          if (!sb) return undefined;
          set({ _sb: sb, _rid: restaurantId });
          const convs = await loadConversations(sb, restaurantId);
          set({ conversations: convs, selectedId: convs[0]?.id ?? "", dbReady: true });
          return subscribeConversations(sb, restaurantId, () => {
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => fire(get().reload()), 250);
          });
        },

        reload: async () => {
          const { _sb, _rid } = get();
          if (!_sb || !_rid) return;
          const fresh = await loadConversations(_sb, _rid);
          const cur = new Map(get().conversations.map((c) => [c.id, c]));
          // Preserve ephemeral client-only working state across reloads.
          const merged = fresh.map((f) => {
            const e = cur.get(f.id);
            return e
              ? { ...f, draftOrder: e.draftOrder, entities: e.entities, aiTyping: e.aiTyping, linkedOrderId: e.linkedOrderId ?? f.linkedOrderId, suggestedAction: e.suggestedAction ?? f.suggestedAction }
              : f;
          });
          set({ conversations: merged });
        },

        selectConversation: (id) => set({ selectedId: id }),

        findOrCreateByPhone: ({ phone, name, channel = "whatsapp", branch }) => {
          // Match on the canonical (normalized) form so a re-typed local number
          // (01030036000) finds the existing conversation stored canonically
          // (201030036000) instead of forking a duplicate thread.
          const target = normalizePhone(phone) || digits(phone);
          const existing = get().conversations.find((c) => (normalizePhone(c.phone) || digits(c.phone)) === target);
          if (existing) {
            set({ selectedId: existing.id });
            return existing.id;
          }
          const { _sb, _rid } = get();
          const id = _sb ? crypto.randomUUID() : newId("conv");
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
            branch: branch || "",
            messages: [],
          };
          set((s) => ({ conversations: [conv, ...s.conversations], selectedId: id }));
          if (_sb && _rid) fire(ensureConversationDb(_sb, _rid, id, { phone, name, channel }));
          return id;
        },

        addCustomerMessage: (convId, text) => {
          const id = msgId();
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
          const { _sb, _rid } = get();
          if (_sb && _rid) fire(insertMessageDb(_sb, _rid, convId, { id, sender: "customer", text }));
          return id;
        },

        addHumanMessage: (convId, text) => {
          const id = msgId();
          const time = nowTime();
          set((s) => ({
            conversations: patchConv(s.conversations, convId, (c) => ({
              ...c,
              messages: [...c.messages, { id, sender: "human", text, time }],
              lastMessage: `موظف: ${text}`,
              lastTime: time,
            })),
          }));
          const { _sb, _rid } = get();
          // Persist first, then put it on the WhatsApp wire (so the send route
          // can reconcile the row by id). No-ops in test/non-WhatsApp mode.
          if (_sb && _rid)
            fire(insertMessageDb(_sb, _rid, convId, { id, sender: "human", text }).then(() => sendOverWhatsApp(convId, id, text)));
        },

        addSystemMessage: (convId, text) => {
          const id = msgId();
          const time = nowTime();
          set((s) => ({
            conversations: patchConv(s.conversations, convId, (c) => ({
              ...c,
              messages: [...c.messages, { id, sender: "system", text, time }],
              lastMessage: text,
              lastTime: time,
            })),
          }));
          const { _sb, _rid } = get();
          if (_sb && _rid) fire(insertMessageDb(_sb, _rid, convId, { id, sender: "system", text }));
        },

        setStatus: (convId, status) => {
          set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, status })) }));
          const { _sb } = get();
          if (_sb) fire(updateConversationDb(_sb, convId, { status }));
        },

        attachOrder: (convId, orderId) => {
          set((s) => ({
            conversations: patchConv(s.conversations, convId, (c) => ({
              ...c,
              linkedOrderId: orderId,
              draftOrder: undefined,
              status: "بانتظار الدفع",
            })),
          }));
          const { _sb } = get();
          if (_sb) fire(updateConversationDb(_sb, convId, { status: "بانتظار الدفع" }));
        },

        setTyping: (convId, value) =>
          set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, aiTyping: value })) })),

        commitAiTurn: (convId, aiMessage, patch, history) => {
          const id = msgId();
          const msg = { ...aiMessage, id };
          set((s) => ({
            conversations: patchConv(s.conversations, convId, (c) => ({
              ...c,
              messages: [...c.messages, msg],
              aiTyping: false,
              lastMessage: msg.text,
              lastTime: msg.time,
              ...patch,
            })),
            intentHistory: [...s.intentHistory, history],
          }));
          const { _sb, _rid } = get();
          if (_sb && _rid) {
            fire(insertMessageDb(_sb, _rid, convId, { id, sender: "ai", text: msg.text, meta: aiMeta(msg) }));
            fire(
              updateConversationDb(_sb, convId, {
                status: patch.status,
                owner: patch.owner,
                last_intent: patch.currentIntent ?? null,
                confidence: patch.aiConfidence ?? null,
                escalation_reason: patch.escalationReason ?? null,
              })
            );
          }
        },

        takeoverToHuman: (convId) => {
          // Idempotent: if already human-owned in local state (e.g. operator double-click
          // while the Brain's automatic escalation already flipped ownership), skip the
          // duplicate "تم تحويل" message and DB write. A genuinely new takeover on an
          // AI-owned conversation still goes through normally.
          if (get().conversations.find((c) => c.id === convId)?.owner === "human") return;
          const id = msgId();
          set((s) => ({
            conversations: patchConv(s.conversations, convId, (c) => ({
              ...c,
              owner: "human",
              status: "تم التحويل لموظف",
              aiTyping: false,
              messages: [...c.messages, { id, sender: "system", text: "تم تحويل المحادثة إلى موظف", time: nowTime() }],
            })),
          }));
          const { _sb, _rid } = get();
          if (_sb && _rid) {
            // Ownership axis (spine Step 1): UI takeover → HUMAN_ACTIVE, dual-writing
            // the legacy owner/status via `extra`.
            fire(setOwnershipState(_sb, convId, "HUMAN_ACTIVE", { extra: { owner: "human", status: "تم التحويل لموظف" } }));
            fire(insertMessageDb(_sb, _rid, convId, { id, sender: "system", text: "تم تحويل المحادثة إلى موظف" }));
          }
        },

        returnToAi: (convId, note) => {
          // Idempotent: if already AI-owned in local state (e.g. operator double-click
          // on "Return to AI"), skip the duplicate "تمت إعادة" message and DB write.
          // A new/different allergen escalation still fires normally — the guard only
          // fires when owner is already 'ai', which is only possible after a prior
          // returnToAi() call updated local state. #87 is unaffected: the gate,
          // setOwnershipState, and is_safety_hold reset paths are unchanged.
          if (get().conversations.find((c) => c.id === convId)?.owner === "ai") return;
          const id = msgId();
          const summary = note?.trim();
          const sysText = summary ? `تمت إعادة المحادثة إلى المساعد · ملخص: ${summary}` : "تمت إعادة المحادثة إلى المساعد";
          set((s) => ({
            conversations: patchConv(s.conversations, convId, (c) => ({
              ...c,
              owner: "ai",
              status: "AI نشط",
              escalationReason: undefined,
              messages: [...c.messages, { id, sender: "system", text: sysText, time: nowTime() }],
            })),
          }));
          const { _sb, _rid } = get();
          if (_sb && _rid) {
            // §E7: persist the handover summary so the Brain honors it on resume.
            // Ownership axis (spine Step 1): a deliberate human release → AI_ACTIVE
            // (the ONLY way SYSTEM_HOLD legally returns to the AI).
            // Safety-hold clearance: a deliberate Return-to-AI is the human's explicit
            // release of a safety hold, so reset is_safety_hold=false in the SAME write
            // that flips ownership — otherwise the flag stays stale (the server-side
            // canonicalization guard only resets it on the owner='ai'+SYSTEM_HOLD mismatch
            // path, which never fires when this browser write succeeds). #87 holds: this
            // ONLY runs on the deliberate operator action, never automatically and never on
            // a live hold where owner is still 'human'.
            fire(setOwnershipState(_sb, convId, "AI_ACTIVE", { extra: { owner: "ai", status: "AI نشط", escalation_reason: null, handover_note: summary || null, is_safety_hold: false } }));
            fire(insertMessageDb(_sb, _rid, convId, { id, sender: "system", text: sysText }));
          }
        },

        resetConversations: () =>
          set({ conversations: cloneSeed(), intentHistory: [], selectedId: seedConversations[0]?.id ?? "" }),
      };
    },
    {
      name: "maitreai-conversations",
      version: 1,
      partialize: (s) => ({ conversations: s.conversations, selectedId: s.selectedId, intentHistory: s.intentHistory }),
    }
  )
);
