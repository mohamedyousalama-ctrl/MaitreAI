"use client";

// ============================================================================
// MaitreAI — MO3 operator presence (ephemeral, realtime, NO DB).
//
// When an operator focuses a conversation, this hook joins a per-conversation
// Supabase Realtime Presence channel (presence:conv:{id}) and tracks an ephemeral
// entry {userId, name, state}. Other operators viewing the same conversation see
// «{name} بيشاهد» / «{name} بيكتب…». Presence auto-expires on disconnect (tab/laptop
// closed) — there is NO presence table/column; nothing is persisted.
//
// Identity: each client tracks its OWN session name (auth.getUser → user_metadata
// .name, the same source ProfileMenu uses) — authoritative for itself, never a
// client-supplied label for someone else. Self-exclusion is by auth user id.
//
// Advisory only: this is a soft anti-collision hint. It does NOT gate or block any
// action — MO2's atomic claim remains the authority.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type PresenceState = "viewing" | "typing";
export interface PresencePeer {
  userId: string;
  name: string;
  state: PresenceState;
}

const FALLBACK_NAME = "موظف";
const TYPING_IDLE_MS = 1500; // revert typing → viewing after this idle gap

interface PresenceMeta {
  userId?: string;
  name?: string;
  state?: string;
}

/**
 * Join the conversation's presence channel while `conversationId` is focused.
 * Returns the OTHER operators present (self excluded) and a throttled `setTyping`.
 */
export function useConversationPresence(conversationId: string | null): {
  others: PresencePeer[];
  setTyping: (typing: boolean) => void;
} {
  const [others, setOthers] = useState<PresencePeer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const selfRef = useRef<{ userId: string; name: string } | null>(null);
  const stateRef = useRef<PresenceState>("viewing");
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!conversationId) {
      setOthers([]);
      return;
    }
    const sb = createClient();
    if (!sb) return; // demo / unconfigured → presence inert

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      const { data } = await sb.auth.getUser();
      const user = data.user;
      if (!user || cancelled) return;
      const name =
        (typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim() : "") ||
        (user.email ? user.email.split("@")[0] : "") ||
        FALLBACK_NAME;
      const self = { userId: user.id, name };
      selfRef.current = self;
      stateRef.current = "viewing";

      channel = sb.channel(`presence:conv:${conversationId}`, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;

      const sync = () => {
        if (cancelled || !channel) return;
        const raw = channel.presenceState() as Record<string, PresenceMeta[]>;
        const peers: PresencePeer[] = [];
        for (const key of Object.keys(raw)) {
          if (key === self.userId) continue; // exclude myself
          const meta = raw[key]?.[0];
          if (!meta) continue;
          peers.push({
            userId: meta.userId ?? key,
            name: (meta.name && meta.name.trim()) || FALLBACK_NAME,
            state: meta.state === "typing" ? "typing" : "viewing",
          });
        }
        setOthers(peers);
      };

      channel
        .on("presence", { event: "sync" }, sync)
        .on("presence", { event: "join" }, sync)
        .on("presence", { event: "leave" }, sync)
        .subscribe((status) => {
          if (status === "SUBSCRIBED" && !cancelled && channel) {
            void channel.track({ userId: self.userId, name: self.name, state: "viewing" });
          }
        });
    })();

    return () => {
      cancelled = true;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      const ch = channelRef.current;
      channelRef.current = null;
      selfRef.current = null;
      stateRef.current = "viewing";
      setOthers([]);
      // untrack + remove → others see us leave immediately (no ghost viewer).
      if (ch) {
        void ch.untrack().finally(() => {
          void sb.removeChannel(ch);
        });
      }
    };
  }, [conversationId]);

  // Throttled: track "typing" once on entry (not per keystroke), and revert to
  // "viewing" after an idle gap. Repeated keystrokes only reset the idle timer.
  const setTyping = useCallback((typing: boolean) => {
    const ch = channelRef.current;
    const self = selfRef.current;
    if (!ch || !self || !typing) return;
    if (stateRef.current !== "typing") {
      stateRef.current = "typing";
      void ch.track({ userId: self.userId, name: self.name, state: "typing" });
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      stateRef.current = "viewing";
      if (channelRef.current && selfRef.current) {
        void channelRef.current.track({ userId: self.userId, name: self.name, state: "viewing" });
      }
    }, TYPING_IDLE_MS);
  }, []);

  return { others, setTyping };
}

/** Build the Arabic presence label, typing taking precedence over viewing. */
export function presenceLabel(others: PresencePeer[]): string | null {
  if (!others.length) return null;
  const typing = others.filter((o) => o.state === "typing");
  const group = typing.length ? typing : others;
  const names = group.map((o) => o.name).join("، ");
  const multi = group.length > 1;
  const verb = typing.length ? (multi ? "بيكتبوا…" : "بيكتب…") : multi ? "بيشاهدوا" : "بيشاهد";
  return `${names} ${verb}`;
}
