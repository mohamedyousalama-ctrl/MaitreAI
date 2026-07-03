// ============================================================================
// MaitreAI — R3 Handoff board bucketing (pure; browser+server safe)
// The Deyafa cutover board: every kitchen-bound order bucketed by its POS
// hand-off state (0051 pos_status), so staff can SEE which confirmed orders have
// not yet been re-entered into Deyafa (the not_entered warning bucket = the #1
// cutover danger). Pure: the route fetches eligible orders, this buckets them.
// ============================================================================

export type PosStatus = "not_entered" | "entered" | "sent_to_kitchen";

export interface HandoffOrder {
  id: string;
  order_number: string;
  order_status: string;
  pos_status: PosStatus;
  pos_reference: string | null;
  pos_entered_by: string | null;
  pos_entered_at: string | null;
  total: number;
  created_at: string;
}

export interface HandoffBoard {
  not_entered: HandoffOrder[];
  entered: HandoffOrder[];
  sent_to_kitchen: HandoffOrder[];
  counts: Record<PosStatus, number>;
}

const BUCKETS: readonly PosStatus[] = ["not_entered", "entered", "sent_to_kitchen"] as const;

/** Bucket rows by pos_status. Rows with an unrecognized pos_status default to
 *  not_entered (fail-SAFE: an unknown state surfaces in the warning bucket rather
 *  than silently vanishing from the board). Stable order within a bucket = input order. */
export function bucketHandoffBoard(rows: HandoffOrder[]): HandoffBoard {
  const board: HandoffBoard = {
    not_entered: [], entered: [], sent_to_kitchen: [],
    counts: { not_entered: 0, entered: 0, sent_to_kitchen: 0 },
  };
  for (const row of rows) {
    const bucket: PosStatus = BUCKETS.includes(row.pos_status) ? row.pos_status : "not_entered";
    board[bucket].push(row);
    board.counts[bucket]++;
  }
  return board;
}
