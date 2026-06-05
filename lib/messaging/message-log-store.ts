// ============================================================================
// MaitreAI — Messaging log store (Sprint 6, Zustand + localStorage persist)
// Records every simulated/real outbound send and every locally-injected inbound
// message so Settings + the simulator can show a live channel activity log.
// Client-side only; the server webhook route does NOT write here (no DB yet).
// ============================================================================

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newId } from "../store";
import type { ChannelKey, InboundMessage, OutboundKind, OutboundMessage, SendResult } from "./types";

export interface OutboundLogEntry {
  id: string;
  timestamp: number;
  channel: ChannelKey;
  to: string;
  text: string;
  kind: OutboundKind;
  status: SendResult["status"];
  externalMessageId?: string;
  error?: string;
}

export interface InboundLogEntry {
  id: string;
  timestamp: number;
  channel: ChannelKey;
  from: string;
  customerName?: string;
  text: string;
}

const MAX_ENTRIES = 100;

interface MessageLogState {
  outbound: OutboundLogEntry[];
  inbound: InboundLogEntry[];

  logOutbound: (message: OutboundMessage, result: SendResult) => OutboundLogEntry;
  logInbound: (message: InboundMessage) => InboundLogEntry;
  clear: () => void;
}

export const useMessageLogStore = create<MessageLogState>()(
  persist(
    (set) => ({
      outbound: [],
      inbound: [],

      logOutbound: (message, result) => {
        const entry: OutboundLogEntry = {
          id: newId("out"),
          timestamp: Date.now(),
          channel: message.channel,
          to: message.to,
          text: message.text,
          kind: message.kind ?? "text",
          status: result.status,
          externalMessageId: result.externalMessageId,
          error: result.error,
        };
        set((s) => ({ outbound: [entry, ...s.outbound].slice(0, MAX_ENTRIES) }));
        return entry;
      },

      logInbound: (message) => {
        const entry: InboundLogEntry = {
          id: newId("in"),
          timestamp: message.timestamp || Date.now(),
          channel: message.channel,
          from: message.from,
          customerName: message.customerName,
          text: message.text,
        };
        set((s) => ({ inbound: [entry, ...s.inbound].slice(0, MAX_ENTRIES) }));
        return entry;
      },

      clear: () => set({ outbound: [], inbound: [] }),
    }),
    {
      name: "maitreai-message-log",
      version: 1,
    }
  )
);
