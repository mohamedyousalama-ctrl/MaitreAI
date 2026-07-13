// ============================================================================
// MaitreAI — WO-VOICE-DEEPGRAM-SPIKE: A/B report assembly (PURE, no I/O).
// The live A/B route runs the SAME archived golden clip through both STT adapters
// (groq current vs deepgram Nova-3 + keyterms), reduces each transcript to canonical
// slots, and this module assembles the per-clip verdict + the aggregate. Slot-level,
// never character-level (see slots.ts). No key, no network — unit-tested.
// ============================================================================

import { extractCanonicalSlots, compareSlots, type CanonicalSlots, type SlotComparison } from "../ai/stt/slots";

export interface AbAdapterRead {
  transcript: string;
  slots: CanonicalSlots;
  costUsd: number;
  confidence: number | null;
  durationSec: number | null;
}

export interface AbClipEntry {
  goldenId: string;
  conversationId: string;
  objectKey: string;
  groq: AbAdapterRead;
  deepgram: AbAdapterRead;
  agreement: SlotComparison;
}

/** One clip's A/B entry from the two adapters' raw results + the tenant menu. Pure. */
export function buildAbEntry(args: {
  goldenId: string;
  conversationId: string;
  objectKey: string;
  menuItemNames: Array<string | null | undefined>;
  groq: { text: string; costUsd?: number; confidence?: number; durationSec?: number };
  deepgram: { text: string; costUsd?: number; confidence?: number; durationSec?: number };
}): AbClipEntry {
  const read = (r: { text: string; costUsd?: number; confidence?: number; durationSec?: number }): AbAdapterRead => ({
    transcript: r.text,
    slots: extractCanonicalSlots(r.text, args.menuItemNames),
    costUsd: r.costUsd ?? 0,
    confidence: typeof r.confidence === "number" ? r.confidence : null,
    durationSec: typeof r.durationSec === "number" ? r.durationSec : null,
  });
  const groq = read(args.groq);
  const deepgram = read(args.deepgram);
  return {
    goldenId: args.goldenId,
    conversationId: args.conversationId,
    objectKey: args.objectKey,
    groq,
    deepgram,
    agreement: compareSlots(groq.slots, deepgram.slots),
  };
}

export interface AbSummary {
  clips: number;
  itemsAgree: number;
  quantityAgree: number;
  negationAgree: number;
  fullAgree: number;
  disagree: number;
  groqCostUsd: number;
  deepgramCostUsd: number;
}

/** Aggregate the per-clip entries — agreement counts + total cost per adapter. Pure. */
export function summarizeAb(entries: AbClipEntry[]): AbSummary {
  const s: AbSummary = {
    clips: entries.length, itemsAgree: 0, quantityAgree: 0, negationAgree: 0,
    fullAgree: 0, disagree: 0, groqCostUsd: 0, deepgramCostUsd: 0,
  };
  for (const e of entries) {
    if (e.agreement.items) s.itemsAgree++;
    if (e.agreement.quantity) s.quantityAgree++;
    if (e.agreement.negation) s.negationAgree++;
    if (e.agreement.all) s.fullAgree++; else s.disagree++;
    s.groqCostUsd += e.groq.costUsd;
    s.deepgramCostUsd += e.deepgram.costUsd;
  }
  s.groqCostUsd = Number(s.groqCostUsd.toFixed(6));
  s.deepgramCostUsd = Number(s.deepgramCostUsd.toFixed(6));
  return s;
}
