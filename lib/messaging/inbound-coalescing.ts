// ============================================================================
// MaitreAI — WO-LIVE4-F2: per-conversation inbound coalescing (PURE core)
//
// Meta delivers each inbound WhatsApp message as its OWN webhook POST, and the
// bridge answers only the newest customer row — so a burst of rapid messages (or
// a pin-then-text) becomes N Brain turns = N replies (the live double-reply on
// #1004), and any burst message that ISN'T the newest never reaches the gated
// `userMessage` — so its safety text (e.g. an allergy) bypasses the deterministic
// allergen INPUT gate, which only ever scans the current turn's userMessage.
//
// This module is PURE (no I/O, no DB): given the conversation's recent rows + a
// watermark (the created_at of the newest ALREADY-answered customer message) +
// the flag, it decides the ONE coalesced turn:
//   • the unanswered burst = every customer message strictly newer than the
//     watermark (NULL watermark → the whole thread's unanswered tail),
//   • merged into one gated text (chronological, newline-joined) — so ALL burst
//     text, wherever the safety word sits, flows through the input gate,
//   • answered ONCE; the caller then advances the watermark to the newest row it
//     covered. A later webhook whose message is at/under the watermark sees an
//     EMPTY burst → the caller stays silent (no double reply). A message that
//     landed mid-turn is strictly newer than the watermark → its own turn, never
//     dropped.
//
// Flag OFF (or the watermark column absent) → `enabled:false` → the burst is just
// the newest customer row and the merged text is exactly that row's text: the
// caller's existing single-message path is byte-identical.
// ============================================================================

export interface CoalesceRow {
  sender: string;
  text: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

export interface CoalescedInbound {
  /** The newest customer row in the burst — the anchor for the per-turn signals
   *  that are inherently single-message (interactive tap id, voice/STT provenance,
   *  the reply's lastInboundAtMs). */
  anchor: CoalesceRow;
  /** How many customer messages were merged into this turn (≥ 1). */
  count: number;
  /** The gated turn text: the burst's texts joined chronologically. For a single
   *  message or flag-OFF this is exactly the anchor's trimmed text. */
  mergedText: string;
  /** created_at (ms) of the anchor — the watermark the caller persists after the
   *  turn so the next webhook coalesces or skips correctly. */
  maxCreatedAtMs: number;
  /** The newest burst message carrying a location pin, if any (a pin anywhere in
   *  the burst is honored, not just on the newest message). */
  pinRow: CoalesceRow | null;
  /** The newest burst message carrying an inbound image, if any. */
  imageRow: CoalesceRow | null;
}

function hasLocation(r: CoalesceRow): boolean {
  return !!(r.meta as { location?: unknown } | null)?.location;
}
function hasImage(r: CoalesceRow): boolean {
  return !!(r.meta as { image?: unknown } | null)?.image;
}

/**
 * Decide the one coalesced inbound turn. `rows` is the recent window in CHRONOLOGICAL
 * order (oldest → newest); only `sender === "customer"` rows are considered.
 * Returns null when there is no customer message to answer — for `enabled:true`
 * that includes the "everything is already at/under the watermark" case, which is
 * exactly how the second webhook of a burst produces NO extra reply.
 */
export function coalesceInbound(
  rows: CoalesceRow[],
  opts: { enabled: boolean; watermarkMs: number | null }
): CoalescedInbound | null {
  const customers = rows.filter((r) => r.sender === "customer");
  if (customers.length === 0) return null;

  // Flag OFF (or column absent) → single-message, byte-identical to the legacy path:
  // the "burst" is just the newest customer row.
  if (!opts.enabled) {
    const anchor = customers[customers.length - 1];
    return {
      anchor,
      count: 1,
      mergedText: (anchor.text ?? "").trim(),
      maxCreatedAtMs: Date.parse(anchor.created_at),
      pinRow: hasLocation(anchor) ? anchor : null,
      imageRow: hasImage(anchor) ? anchor : null,
    };
  }

  // Flag ON → the unanswered burst is every customer message strictly newer than the
  // FLOOR. When the watermark is set, the floor IS the watermark — exact, and race-safe:
  // a message that landed mid-turn is strictly newer than the just-answered watermark and
  // gets its own turn (never dropped), while the burst's own messages are at/under it so
  // the second webhook sees an empty burst and stays silent. When the watermark is NULL
  // (coalescing just enabled on an existing thread, or a brand-new thread) the floor falls
  // back to the last outbound REPLY — so a cold start gathers only the trailing UNanswered
  // tail, never re-answers already-replied history; with no reply yet the floor is -∞ (the
  // whole thread is unanswered). After this turn the caller stamps the watermark, so every
  // subsequent turn uses the exact (race-safe) path.
  const wm = opts.watermarkMs;
  let floorMs: number;
  if (wm != null) {
    floorMs = wm;
  } else {
    const lastReply = [...rows].reverse().find((r) => r.sender === "ai" || r.sender === "human");
    floorMs = lastReply ? Date.parse(lastReply.created_at) : -Infinity;
  }
  const burst = customers.filter((r) => Date.parse(r.created_at) > floorMs);
  if (burst.length === 0) return null; // already answered → caller stays silent (no 2nd reply)

  const newest = burst[burst.length - 1];
  const mergedText = burst.map((r) => (r.text ?? "").trim()).filter((t) => t.length > 0).join("\n");
  // A pin/image ANYWHERE in the burst is honored — take the newest burst row carrying each.
  const pinRow = [...burst].reverse().find(hasLocation) ?? null;
  const imageRow = [...burst].reverse().find(hasImage) ?? null;

  return {
    anchor: newest,
    count: burst.length,
    mergedText,
    maxCreatedAtMs: Date.parse(newest.created_at),
    pinRow,
    imageRow,
  };
}
