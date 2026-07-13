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
import type { ChannelKey, ChatMessage, Conversation, ConversationStage, IntentHistoryEntry } from "./types";
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

/** MO1 — clear named ownership server-side (member resolution is server-side; the
 *  release simply nulls assigned_member_id for the tenant's conversation). */
const releaseAssignee = (conversationId: string, reason?: "returned" | "closed"): Promise<unknown> =>
  fetch(`/api/conversations/${conversationId}/assignee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "release", reason }),
  });
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
  // Returns the WhatsApp wire outcome so the console can surface an HONEST failure
  // (FR-005): `code` is the /api/whatsapp/send code ("outside_24h_window" | "send_failed").
  // null → no wire attempt (test/demo mode, or no persisted row); callers may ignore it.
  addHumanMessage: (convId: string, text: string) => Promise<{ ok: boolean; code?: string } | null>;
  addSystemMessage: (convId: string, text: string) => void;
  setStatus: (convId: string, status: Conversation["status"]) => void;
  setStage: (convId: string, stage: ConversationStage) => Promise<boolean>;
  setStaffNote: (convId: string, note: string) => Promise<boolean>;
  attachOrder: (convId: string, orderId: string) => void;
  setTyping: (convId: string, value: boolean) => void;
  commitAiTurn: (convId: string, aiMessage: ChatMessage, patch: Partial<Conversation>, history: IntentHistoryEntry) => void;
  takeoverToHuman: (convId: string) => Promise<{ ok: boolean; code?: string; conflictName?: string }>;
  returnToAi: (convId: string, note?: string) => void;
  // R5 — return-to-Karim chooser: park with the team (HUMAN_IDLE) / close (CLOSED).
  // Return the REAL server result so the caller can surface it via R1.
  setConversationIdle: (convId: string) => Promise<boolean>;
  closeConversation: (convId: string) => Promise<boolean>;
  resetConversations: () => void;
}

const patchConv = (list: Conversation[], id: string, fn: (c: Conversation) => Conversation): Conversation[] =>
  list.map((c) => (c.id === id ? fn(c) : c));

let reloadTimer: ReturnType<typeof setTimeout> | undefined;

// WB-FIX-1 — per-conversation monotonic sequence for staff-note saves, so a stale
// (superseded) request's failure rollback can never revert a newer save's state.
const staffNoteSeq = new Map<string, number>();

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
          const normalized = normalizePhone(phone);
          const target = normalized || digits(phone);
          const existing = get().conversations.find((c) => (normalizePhone(c.phone) || digits(c.phone)) === target);
          if (existing) {
            set({ selectedId: existing.id });
            return existing.id;
          }
          // WO-RACE-1 (FR-014) — an un-normalizable phone is send-doomed (Meta #131030). Don't
          // create a broken conversation; return "" so the caller surfaces it to the operator.
          if (!normalized) return "";
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

        addHumanMessage: async (convId, text) => {
          const id = msgId();
          const time = nowTime();
          set((s) => ({
            conversations: patchConv(s.conversations, convId, (c) => ({
              ...c,
              // T8 — optimistic render stays instant; status starts "sending" so a
              // failed wire send no longer looks identical to a delivered one. The
              // realtime reload then reflects the real sent/failed from the DB.
              messages: [...c.messages, { id, sender: "human", text, time, status: "sending" }],
              lastMessage: `موظف: ${text}`,
              lastTime: time,
            })),
          }));
          const { _sb, _rid } = get();
          // Persist first, then put it on the WhatsApp wire (so the send route
          // can reconcile the row by id). No-ops in test/non-WhatsApp mode → null.
          if (!_sb || !_rid) return null;
          // Return the wire outcome (FR-005) so the console can show an honest
          // failure (e.g. outside the 24h window) instead of a silent send.
          try {
            await insertMessageDb(_sb, _rid, convId, { id, sender: "human", text });
            const res = await sendOverWhatsApp(convId, id, text);
            const j = (await res.json().catch(() => ({}))) as { code?: string };
            return { ok: res.ok, code: j.code };
          } catch (e) {
            console.error("[conv:db]", e);
            return { ok: false };
          }
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

        // WB2 — set the conversation sales stage via the validated server route
        // (NOT a direct DB write — the route validates + audits who/when). Optimistic
        // local set; revert on failure. Returns ok so callers can show feedback.
        setStage: async (convId, stage) => {
          const prev = get().conversations.find((c) => c.id === convId)?.stage;
          set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, stage })) }));
          try {
            const res = await fetch(`/api/conversations/${convId}/stage`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }),
            });
            if (!res.ok) {
              set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, stage: prev })) }));
              return false;
            }
            return true;
          } catch {
            set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, stage: prev })) }));
            return false;
          }
        },

        // WB-FIX-1 — internal staff note. Staff-only; persisted via the server route
        // (never customer/Karim-facing). Optimistic local set; revert on failure —
        // but ONLY if this is still the most-recent in-flight save for the
        // conversation, so an out-of-order/superseded failure can't clobber a newer
        // save (or a newer realtime value).
        setStaffNote: async (convId, note) => {
          const prev = get().conversations.find((c) => c.id === convId)?.staffNotes ?? null;
          const next = note.trim() || null;
          const mySeq = (staffNoteSeq.get(convId) ?? 0) + 1;
          staffNoteSeq.set(convId, mySeq);
          set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, staffNotes: next })) }));
          // Revert to prev ONLY when this request is still the latest one in flight.
          const rollbackIfCurrent = () => {
            if (staffNoteSeq.get(convId) !== mySeq) return; // a newer save superseded us
            set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, staffNotes: prev })) }));
          };
          try {
            const res = await fetch(`/api/conversations/${convId}/notes`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
            });
            if (!res.ok) { rollbackIfCurrent(); return false; }
            return true;
          } catch {
            rollbackIfCurrent();
            return false;
          }
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

        takeoverToHuman: async (convId) => {
          // A GENUINE takeover is one where we're not already the active human owner.
          // We must NOT trust local `owner === "human"` as proof of ownership: a
          // teammate-held (HUMAN_ACTIVE) or parked (HUMAN_IDLE) conversation also reads
          // owner==="human" locally, and the old shortcut let the caller bypass the
          // server claim — so two operators could both "own" it and both send. The
          // server claim is the ONLY ownership proof now (a teammate's chat 409s). We
          // still skip the duplicate "تم تحويل" system message on an idempotent
          // re-claim of our OWN already-active conversation (genuine === false).
          const genuine = get().conversations.find((c) => c.id === convId)?.ownershipState !== "HUMAN_ACTIVE";
          const id = msgId();
          const applyLocal = () =>
            set((s) => ({
              conversations: patchConv(s.conversations, convId, (c) => ({
                ...c,
                owner: "human",
                status: "تم التحويل لموظف",
                ownershipState: "HUMAN_ACTIVE",
                aiTyping: false,
                ...(genuine
                  ? { messages: [...c.messages, { id, sender: "system", text: "تم تحويل المحادثة إلى موظف", time: nowTime() }] }
                  : {}),
              })),
            }));
          const { _sb, _rid } = get();
          // Demo mode (no DB): local-only optimistic takeover.
          if (!_sb || !_rid) { applyLocal(); return { ok: true }; }

          // MO2 — ATOMIC CLAIM. The server performs a SINGLE conditional UPDATE (the
          // ownership_state flip + the assignee stamp, with the precondition in the
          // WHERE) and reports whether we won. PESSIMISTIC: flip local state only on a
          // win, so a lost race never shows a false "you own it". This replaces the old
          // browser setOwnershipState takeover write — the state-machine legality is now
          // enforced inline by the claim's WHERE (same legal predecessors).
          let res: Response;
          try {
            res = await fetch(`/api/conversations/${convId}/assignee`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "claim" }),
            });
          } catch {
            return { ok: false };
          }
          if (res.ok) {
            const j = (await res.json().catch(() => ({}))) as { assignedMemberId?: string | null };
            applyLocal();
            if (j.assignedMemberId) {
              set((s) => ({ conversations: patchConv(s.conversations, convId, (c) => ({ ...c, assignedMemberId: j.assignedMemberId })) }));
            }
            // Persist the system takeover message only on a genuine takeover (not on an
            // idempotent re-claim of our own already-active conversation).
            if (genuine) fire(insertMessageDb(_sb, _rid, convId, { id, sender: "system", text: "تم تحويل المحادثة إلى موظف" }));
            return { ok: true };
          }
          // Lost the race / not claimable → refresh to show the REAL current owner and
          // surface the result (the UI shows «{name} تولّاها بالفعل»). No overwrite.
          const j = (await res.json().catch(() => ({}))) as { error?: string; ownerName?: string };
          fire(get().reload());
          return { ok: false, code: j.error, conflictName: j.ownerName };
        },

        returnToAi: (convId, note) => {
          // Idempotent: if already AI-owned in local state (e.g. operator double-click
          // on "Return to AI"), skip the duplicate "تمت إعادة" message and DB write.
          // A new/different allergen escalation still fires normally — the guard only
          // fires when owner is already 'ai', which is only possible after a prior
          // returnToAi() call updated local state. #87 is unaffected: the gate,
          // setOwnershipState, and is_safety_hold reset paths are unchanged.
          if (get().conversations.find((c) => c.id === convId)?.owner === "ai") return;
          // HX3 — capture the PRE-handback hold state. A SYSTEM_HOLD / safety-held
          // thread must NEVER auto-resume Karim (#87): the deliberate release below
          // returns ownership but the active-handback trigger is suppressed for holds.
          const prev = get().conversations.find((c) => c.id === convId);
          const wasHold = prev?.ownershipState === "SYSTEM_HOLD" || prev?.isSafetyHold === true;
          const id = msgId();
          const summary = note?.trim();
          const sysText = summary ? `تمت إعادة المحادثة إلى المساعد · ملخص: ${summary}` : "تمت إعادة المحادثة إلى المساعد";
          set((s) => ({
            conversations: patchConv(s.conversations, convId, (c) => ({
              ...c,
              owner: "ai",
              status: "AI نشط",
              escalationReason: undefined,
              // MO1 — no longer owned by a person.
              assignedMemberId: null,
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
            const ownWrite = setOwnershipState(_sb, convId, "AI_ACTIVE", { extra: { owner: "ai", status: "AI نشط", escalation_reason: null, handover_note: summary || null, is_safety_hold: false } });
            fire(ownWrite);
            fire(insertMessageDb(_sb, _rid, convId, { id, sender: "system", text: sysText }));
            // MO1 — return-to-Karim clears named ownership server-side. MO4 — audited.
            fire(releaseAssignee(convId, "returned"));
            // HX3 — active handback: once the state has flipped to AI_ACTIVE, ask the
            // server to answer a pending customer message with ONE Karim turn. Chained
            // off the ownership write so the resume route reads AI_ACTIVE. SUPPRESSED
            // for a hold (deliberate release never auto-resumes — #87); the server route
            // also fail-safe-bails if it still sees a hold.
            if (!wasHold) {
              fire(
                Promise.resolve(ownWrite).then(() =>
                  fetch(`/api/conversations/${convId}/resume`, { method: "POST" })
                )
              );
            }
          }
        },

        // R5 — «استنى»: park the thread with the team (HUMAN_IDLE) — human still owns,
        // Karim stays paused. Write FIRST (setOwnershipState validates the transition;
        // SYSTEM_HOLD→HUMAN_IDLE is illegal and would throw), then update local state +
        // log a system note — so a failed write never leaves a false "waiting" state.
        setConversationIdle: async (convId) => {
          const conv = get().conversations.find((c) => c.id === convId);
          if (!conv) return false;
          const id = msgId();
          const text = "المحادثة مستنية مع الفريق — كريم متوقف.";
          // The «مستنية» label is derived from ownershipState=HUMAN_IDLE (page ownLabel);
          // the status column keeps a valid ConversationStatus ("تم التحويل لموظف").
          const apply = () =>
            set((s) => ({
              conversations: patchConv(s.conversations, convId, (c) => ({
                ...c,
                owner: "human",
                ownershipState: "HUMAN_IDLE",
                status: "تم التحويل لموظف",
                aiTyping: false,
                messages: [...c.messages, { id, sender: "system", text, time: nowTime() }],
              })),
            }));
          const { _sb, _rid } = get();
          if (!_sb || !_rid) { apply(); return true; } // demo: local-only
          try {
            await setOwnershipState(_sb, convId, "HUMAN_IDLE", { extra: { owner: "human", status: "تم التحويل لموظف" } });
          } catch {
            return false; // illegal/failed write → no local change, no false state
          }
          apply();
          fire(insertMessageDb(_sb, _rid, convId, { id, sender: "system", text }));
          return true;
        },

        // R5 — «اقفل المحادثة»: CLOSED. Write FIRST, then local + system note. (The UI
        // only offers this from a human-owned thread, never a SYSTEM_HOLD, so a safety
        // hold can't be closed-around; setOwnershipState also enforces legality.)
        closeConversation: async (convId) => {
          const conv = get().conversations.find((c) => c.id === convId);
          if (!conv) return false;
          const id = msgId();
          const text = "تم إقفال المحادثة.";
          // The «مقفولة» label is derived from ownershipState=CLOSED (page ownLabel/view);
          // status keeps its existing valid ConversationStatus value.
          const apply = () =>
            set((s) => ({
              conversations: patchConv(s.conversations, convId, (c) => ({
                ...c,
                ownershipState: "CLOSED",
                // MO1 — a closed conversation is no longer owned by a person.
                assignedMemberId: null,
                aiTyping: false,
                messages: [...c.messages, { id, sender: "system", text, time: nowTime() }],
              })),
            }));
          const { _sb, _rid } = get();
          if (!_sb || !_rid) { apply(); return true; } // demo: local-only
          try {
            // WO-1: close is now a server action (commits → CLOSED, then emits the
            // outcome). Replaces the direct client-side setOwnershipState write.
            const res = await fetch(`/api/conversations/${convId}/close`, { method: "POST" });
            if (!res.ok) return false;
          } catch {
            return false;
          }
          apply();
          fire(insertMessageDb(_sb, _rid, convId, { id, sender: "system", text }));
          // MO1 — closing clears named ownership server-side. MO4 — audited.
          fire(releaseAssignee(convId, "closed"));
          return true;
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
