// ============================================================================
// WO-CONV-LIST-PAGINATION — red-first proof. The conversation-list previews froze on
// OLD messages: loadConversations fetched ALL tenant messages in ONE un-ranged SELECT
// (created_at ASC), so PostgREST's 1000-row cap dropped the newest rows and
// messages[last] resolved to a stale message. The fix pages with .range() until a short
// page (or a hard cap). This drives the extracted PURE paginator so the exact
// page-boundary, newest-row, and cap-guard behaviours are deterministic — INCLUDING the
// CONTROL that models the old capped single-shot returning a STALE lastMessage.
//   • >1000 messages: paginated load surfaces the NEWEST as lastMessage (the bug fixed).
//   • CONTROL: the old un-ranged 1000-cap single-shot yields a STALE lastMessage.
//   • page boundaries at EXACTLY 1000 and EXACTLY 2000 (no drop / no duplicate / no spin).
//   • the binding max-pages guard bounds the loop (no unbounded pull on a huge tenant).
// Run: node --experimental-strip-types scripts/proof-conv-list-pagination.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { paginateRange } from "../lib/db/message-pagination.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const PAGE = 1000, MAX_PAGES = 20;

// A tenant's messages for ONE conversation, ordered created_at ASC (id tiebreaker),
// so index i is the i-th oldest and the LAST element is the NEWEST. text = `msg-${i}`.
function seed(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `m${String(i).padStart(6, "0")}`, text: `msg-${i}` }));
}
const newestText = (n: number) => `msg-${n - 1}`;

// A PostgREST-like page fetcher over a seeded store: .range(from,to) returns that slice.
const pagedFetcher = (rows: Array<{ id: string; text: string }>) =>
  async (from: number, toInclusive: number) => rows.slice(from, toInclusive + 1);

// The OLD path modelled: a single un-ranged SELECT that PostgREST caps at `PAGE` rows
// (the OLDEST 1000, since ordered ASC). lastMessage is then the stale 1000th row.
const legacySingleShot = (rows: Array<{ id: string; text: string }>) => rows.slice(0, PAGE);

// helper: run the paginator and derive lastMessage the way loadConversations does.
async function loadedLast(rows: Array<{ id: string; text: string }>) {
  const all = await paginateRange(pagedFetcher(rows), { pageSize: PAGE, maxPages: MAX_PAGES });
  return { all, last: all[all.length - 1] };
}

// --- THE BUG FIXED: >1000 messages → newest surfaces --------------------------------
{
  const rows = seed(1165);
  const { all, last } = await loadedLast(rows);
  check("paginated load returns ALL 1165 messages (past the 1000 cap)", all.length === 1165);
  check("BUG FIXED: lastMessage is the NEWEST message (msg-1164), not a stale one", last.text === newestText(1165));

  // CONTROL — the OLD un-ranged single-shot: capped at 1000 (oldest), lastMessage stale.
  const legacy = legacySingleShot(rows);
  const legacyLast = legacy[legacy.length - 1];
  check("CONTROL: the OLD single-shot returns only 1000 rows (the cap)", legacy.length === 1000);
  check("CONTROL: the OLD lastMessage is STALE (msg-999, the newest that fit under the cap)", legacyLast.text === "msg-999");
  check("CONTROL: stale ≠ newest — this is exactly the reported bug", legacyLast.text !== newestText(1165));
  check("the fix lands the newest where the OLD model was stale", last.text !== legacyLast.text && last.text === newestText(1165));
}

// --- PAGE BOUNDARIES: exactly 1000 and exactly 2000 (no drop / dup / spin) ------------
{
  const { all, last } = await loadedLast(seed(1000));
  check("boundary 1000: returns exactly 1000 (a full page then an empty page stops it)", all.length === 1000);
  check("boundary 1000: lastMessage is the newest (msg-999)", last.text === newestText(1000));
  // no duplication at the boundary: every id is unique
  check("boundary 1000: no row duplicated across pages", new Set(all.map((r) => r.id)).size === 1000);
}
{
  const { all, last } = await loadedLast(seed(2000));
  check("boundary 2000: returns exactly 2000 (two full pages then an empty page)", all.length === 2000);
  check("boundary 2000: lastMessage is the newest (msg-1999)", last.text === newestText(2000));
  check("boundary 2000: no row dropped or duplicated across the two page seams", new Set(all.map((r) => r.id)).size === 2000);
}
{
  // one row over a boundary — the classic off-by-one page-seam case.
  const { all, last } = await loadedLast(seed(1001));
  check("boundary 1001: page0=1000 + page1=1 → all 1001 loaded", all.length === 1001);
  check("boundary 1001: lastMessage is the newest (msg-1000)", last.text === newestText(1001));
}

// --- REFINEMENT 1 (binding): the max-pages guard bounds the loop ----------------------
{
  const rows = seed(25000); // beyond launch scale — must NOT pull unbounded, must NOT spin
  let calls = 0;
  const counting = async (from: number, to: number) => { calls++; return rows.slice(from, to + 1); };
  const all = await paginateRange(counting, { pageSize: PAGE, maxPages: MAX_PAGES });
  check("guard: fetch is called at MOST maxPages (20) times — the loop is bounded", calls === MAX_PAGES);
  check("guard: at most maxPages*pageSize (20k) rows returned, not all 25k", all.length === MAX_PAGES * PAGE);
  check("guard: with the cap engaged the tail is bounded (msg-19999) — trigger for WO-CONV-LIST-SCALE", all[all.length - 1].text === "msg-19999");
}

// --- empty + single-page sanity ------------------------------------------------------
{
  const empty = await paginateRange(pagedFetcher([]), { pageSize: PAGE, maxPages: MAX_PAGES });
  check("empty tenant: returns [] and stops after one short page", empty.length === 0);
  const { all, last } = await loadedLast(seed(3));
  check("tiny tenant (3): one short page, all returned, newest last", all.length === 3 && last.text === "msg-2");
}

// --- wiring (source): loadConversations uses the paginator, guard, and stable order ---
const conv = read("lib/db/conversations.ts");
check("(src) loadAllMessages routes through paginateRange", /paginateRange<MsgRow>\(/.test(conv));
check("(src) the messages query now uses .range(from, toInclusive) — not un-ranged", /\.range\(from, toInclusive\)/.test(conv));
check("(src) page size is 1000 (the PostgREST cap)", /MESSAGES_PAGE\s*=\s*1000/.test(conv));
check("(src) the binding max-pages guard is 20", /MESSAGES_MAX_PAGES\s*=\s*20/.test(conv));
check("(src) stable total order: created_at ASC + id tiebreaker (safe paging)",
  /order\("created_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)/.test(conv));
check("(src) lastMessage still derives from messages[last] (output shape unchanged)",
  /const last = messages\[messages\.length - 1\];/.test(conv) && /lastMessage: last\?\.text/.test(conv));
check("(src) the conversations query is untouched (still order updated_at desc)",
  /\.order\("updated_at", \{ ascending: false \}\)/.test(conv));
check("(src) paginateRange breaks on a short page (exhausted) — no over-fetch",
  /if \(rows\.length < opts\.pageSize\) break;/.test(read("lib/db/message-pagination.ts")));

console.log(`\nCONV-LIST-PAGINATION PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
