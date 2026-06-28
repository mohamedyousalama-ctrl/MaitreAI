"use client";

// ============================================================================
// MaitreAI — DLV5 audible console alerts (additive client-side output layer).
//
// Three distinct synthesized tones (Web Audio, no external fetch) for the events
// Mohamed chose: new order / new customer WhatsApp message / escalation-to-human.
// Mounted layout-level (ConsoleAlerts) so it fires on ANY console page.
//
// It does NOT change the realtime subscriptions or any data/write path — it only
// OBSERVES the two stores (zustand .subscribe) and chimes. Anti-spam: silent on
// the initial hydrate (seed seen-sets), freshness window, global throttle, and it
// never chimes the operator's own actions (inbound-only messages; →SYSTEM_HOLD /
// needs-human only — never the operator's own takeover). Audio stays silent until
// a user gesture unlocks the AudioContext (autoplay policy); blocked audio never
// crashes. Mute is per-operator (localStorage — a UI preference, the one allowed use).
// ============================================================================

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";

// ── per-operator mute preference (localStorage — UI pref only, not app data) ──
interface AlertSoundState {
  muted: boolean;
  toggle: () => void;
}
export const useAlertSoundStore = create<AlertSoundState>()(
  persist(
    (set, get) => ({ muted: false, toggle: () => set({ muted: !get().muted }) }),
    { name: "maitreai-alert-sound" } // default: enabled (muted=false)
  )
);

type AlertKind = "order" | "message" | "escalation";

const FRESH_MS = 3 * 60 * 1000; // only chime for rows newer than this
const THROTTLE_MS = 2000; // ≤ 1 chime / 2s (coalesces bursts)
const NEEDS_HUMAN = "يحتاج تدخل موظف";

// ── Web Audio synthesized tones (no bundled files, no fetch) ─────────────────
let audioCtx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      audioCtx = new AC();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function beep(ctx: AudioContext, freq: number, startAt: number, dur: number, peak = 0.08, type: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // short attack/decay envelope so tones are soft, not jarring clicks
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

/** Play a distinct tone per event. No-op (silent) if audio is unavailable/blocked. */
function playKind(kind: AlertKind): void {
  const ctx = ensureCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // Not yet unlocked by a gesture → resume attempt; if it stays suspended the
    // scheduled tones simply don't sound. Never throws to the caller.
    void ctx.resume().catch(() => {});
  }
  const t = ctx.currentTime + 0.01;
  if (kind === "order") {
    // rising two-note — "something arrived" (positive)
    beep(ctx, 660, t, 0.13, 0.09);
    beep(ctx, 990, t + 0.14, 0.18, 0.09);
  } else if (kind === "message") {
    // single soft mid beep — lightest of the three
    beep(ctx, 520, t, 0.14, 0.06);
  } else {
    // escalation — urgent triple, higher + sharper (needs attention now)
    beep(ctx, 940, t, 0.1, 0.1, "triangle");
    beep(ctx, 940, t + 0.13, 0.1, 0.1, "triangle");
    beep(ctx, 1180, t + 0.26, 0.2, 0.11, "triangle");
  }
}

let gestureUnlockBound = false;
function bindGestureUnlock(): void {
  if (gestureUnlockBound || typeof window === "undefined") return;
  gestureUnlockBound = true;
  const unlock = () => {
    const ctx = ensureCtx();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  };
  // Resume on the first (and subsequent, harmlessly) user gestures anywhere.
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

/**
 * Layout-level alert-sound observer. Mount once (ConsoleAlerts). Returns nothing.
 */
export function useConsoleAlerts(): void {
  const muted = useAlertSoundStore((s) => s.muted);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const seeded = useRef(false);
  const seenOrders = useRef<Set<string>>(new Set());
  const seenMsgs = useRef<Set<string>>(new Set());
  const convPrev = useRef<Map<string, { own?: string; status?: string }>>(new Map());
  const mountAt = useRef(0);
  const lastChimeAt = useRef(0);

  useEffect(() => {
    bindGestureUnlock();
    mountAt.current = Date.now();

    // Seed seen-sets from the CURRENT snapshot so the initial hydrate/backfill is
    // SILENT — we only chime for things that appear after this point.
    const seed = () => {
      for (const o of useOrderStore.getState().orders) seenOrders.current.add(o.id);
      for (const c of useConversationStore.getState().conversations) {
        convPrev.current.set(c.id, { own: c.ownershipState, status: c.status });
        for (const m of c.messages) seenMsgs.current.add(m.id);
      }
      seeded.current = true;
    };
    seed();

    const chime = (kind: AlertKind) => {
      if (mutedRef.current) return;
      const now = Date.now();
      if (now - lastChimeAt.current < THROTTLE_MS) return; // throttle + coalesce
      lastChimeAt.current = now;
      playKind(kind);
    };

    const onOrders = () => {
      if (!seeded.current) return;
      let fire = false;
      for (const o of useOrderStore.getState().orders) {
        if (seenOrders.current.has(o.id)) continue;
        seenOrders.current.add(o.id);
        // New order rows are created server-side (webhook/storefront), never by the
        // operator in-console, so a new id is genuinely external. Freshness-gated.
        if (o.createdAt >= mountAt.current - 5000 && Date.now() - o.createdAt < FRESH_MS) fire = true;
      }
      if (fire) chime("order");
    };

    const onConvs = () => {
      if (!seeded.current) return;
      let newMessage = false;
      let escalation = false;
      for (const c of useConversationStore.getState().conversations) {
        const prev = convPrev.current.get(c.id);
        // New INBOUND (customer) messages only — an operator's own send is 'human'
        // (outbound), so this never chimes for the operator's own reply.
        for (const m of c.messages) {
          if (seenMsgs.current.has(m.id)) continue;
          seenMsgs.current.add(m.id);
          const inbound = m.sender === "customer";
          const fresh = m.createdAtMs ? Date.now() - m.createdAtMs < FRESH_MS : true;
          if (inbound && fresh) newMessage = true;
        }
        // Escalation = a TRANSITION into SYSTEM_HOLD (allergy/safety) or needs-human
        // (AI handoff). The operator's own takeover sets HUMAN_ACTIVE / status
        // "تم التحويل لموظف" — neither matches, so own actions never chime.
        const isHold = c.ownershipState === "SYSTEM_HOLD";
        const wasHold = prev?.own === "SYSTEM_HOLD";
        const isNeeds = c.status === NEEDS_HUMAN;
        const wasNeeds = prev?.status === NEEDS_HUMAN;
        if (prev && ((isHold && !wasHold) || (isNeeds && !wasNeeds))) escalation = true;
        convPrev.current.set(c.id, { own: c.ownershipState, status: c.status });
      }
      // Priority: escalation (most urgent) > new customer message.
      if (escalation) chime("escalation");
      else if (newMessage) chime("message");
    };

    const unsubOrders = useOrderStore.subscribe(onOrders);
    const unsubConvs = useConversationStore.subscribe(onConvs);
    return () => {
      unsubOrders();
      unsubConvs();
    };
  }, []);
}
