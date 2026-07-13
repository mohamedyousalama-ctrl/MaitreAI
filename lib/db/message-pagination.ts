// ============================================================================
// MaitreAI — WO-CONV-LIST-PAGINATION: generic range paginator (PURE, testable).
//
// PostgREST caps a single response at db-max-rows (Supabase default 1000). Any
// SELECT without .range() therefore returns at most the first 1000 rows — which,
// for the messages query ordered created_at ASC, is the OLDEST 1000, dropping the
// newest and freezing every conversation-list preview on a stale row.
//
// paginateRange loops an injected page-fetcher with .range() windows until a short
// page (history exhausted) or a hard max-page cap (the mandatory safety guard, so no
// pathological case spins forever against the live DB). Extracted pure — no `@/`
// value imports — so the red-first proof can drive the exact page-boundary and cap
// sequences deterministically, including the CONTROL that models the old capped
// single-shot returning a stale newest row.
// ============================================================================

export interface PaginateOptions {
  /** Rows per page — one PostgREST window (match the db-max-rows cap, default 1000). */
  pageSize: number;
  /** Hard cap on pages fetched (binding safety guard: bounds the loop no matter what). */
  maxPages: number;
}

/** Fetch every row by paging `fetchPage(from, toInclusive)` until a page returns fewer
 *  than `pageSize` rows (exhausted) or `maxPages` is reached (guard). Rows are returned
 *  in fetch order, so a caller whose pages are ordered ASC gets the newest row LAST. */
export async function paginateRange<T>(
  fetchPage: (from: number, toInclusive: number) => Promise<T[]>,
  opts: PaginateOptions,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < opts.maxPages; page++) {
    const from = page * opts.pageSize;
    const rows = await fetchPage(from, from + opts.pageSize - 1);
    out.push(...rows);
    if (rows.length < opts.pageSize) break; // short page ⇒ no more rows
  }
  return out;
}
