// ============================================================================
// MaitreAI — WO-SIMPLIFY (PART B): deterministic DRAFT LIFECYCLE.
//
// PURE (no I/O). Production, DB-proven: yesterday's abandoned «٢٠ بيتزا» draft resurfaced today,
// and old confirmed lines bled into a NEW order's recap. The in-progress cart lives in
// messages.meta.draft (no dedicated table); the loader decides, at turn start, whether to RESUME
// the most-recent draft or ARCHIVE it. This module owns that decision deterministically:
//
//   • FINALIZED draft            → the basket is CLOSED; a subsequent item-adding intent starts a
//                                  FRESH draft (confirmed lines never re-render).
//   • explicit RESET intent      → «طلب جديد» / «الغي الطلب كله» archives the open draft.
//   • age > 12h                  → hard archive (a stale open basket from a prior day is never
//                                  resumed — the ghost-draft fix).
//   • open, not finalized, fresh → RESUME (mid-order pause, within the resume window).
//   • open but past the resume window (and ≤ 12h) → ABANDONED (not resumed; emits the existing
//                                  abandonment record) — behaviour unchanged from before.
//
// Archiving needs NO schema migration: a not-resumed draft is superseded by the next turn's saved
// (empty) draft, so it can never resurface. This module is the single source of that truth.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

/** Resume window: an open draft newer than this is resumed as a mid-order pause (unchanged). */
export const DRAFT_RESUME_FRESHNESS_MS = 45 * 60 * 1000;
/** Hard-archive ceiling: an open draft older than this is ALWAYS archived (never resumed). */
export const DRAFT_ARCHIVE_MS = 12 * 60 * 60 * 1000;

// Explicit RESET intents — the customer wants to start over / cancel the whole order. Order-build
// verbs alone («عايز أطلب») are NOT resets; a reset needs an explicit new-order/cancel-all phrase.
const RESET_INTENT_RE =
  /(?:طلب|اوردر|أوردر|اردر)\s*(?:جديد|تاني|ثاني|من ?جديد)|(?:الغ[يى]|إلغاء|الغاء|امسح|إمسح|شيل|كنسل)\s*(?:الطلب|الاوردر|الأوردر|الاردر|الطلبيه|الطلبية|كل ?الطلب|الطلب ?كله)|(?:ابدأ|نبدأ|نبدا|ابدا)\s*(?:من ?(?:جديد|الاول|الأول|البدايه|البداية))|(?:طلب|اوردر)\s*(?:جديد|تاني)|\bnew order\b|\bstart over\b|\bcancel (?:the )?order\b/;

/** True iff the message is an explicit order-reset / start-over / cancel-all intent. Pure. */
export function isExplicitResetIntent(message: string | null | undefined): boolean {
  const n = normalizeAr(String(message ?? ""));
  if (!n) return false;
  return RESET_INTENT_RE.test(n) || /\bnew order\b|\bstart over\b|\bcancel (?:the )?order\b/i.test(String(message ?? ""));
}

export type DraftLifecycleAction = "none" | "resume" | "abandoned" | "archived_stale" | "reset" | "finalized";

export interface DraftLifecycleResult {
  /** True → resume the stored draft as initialDraft; false → start clean (archived/none). */
  resume: boolean;
  /** True → the open draft was deliberately archived this turn (reset OR >12h stale). */
  archived: boolean;
  action: DraftLifecycleAction;
}

/**
 * Decide the fate of the most-recent stored draft at turn start (pure). `ageMs` is the age of the
 * draft-carrying message; `resetIntent` is this turn's explicit reset. Order of precedence:
 * finalized → reset → stale(>12h) → fresh-resume(≤45m) → abandoned.
 */
export function decideDraftLifecycle(args: {
  finalized: boolean;
  lineCount: number;
  ageMs: number;
  resetIntent: boolean;
}): DraftLifecycleResult {
  if (args.finalized) return { resume: false, archived: false, action: "finalized" };
  if (args.lineCount <= 0) return { resume: false, archived: false, action: "none" };
  if (args.resetIntent) return { resume: false, archived: true, action: "reset" };
  if (args.ageMs > DRAFT_ARCHIVE_MS) return { resume: false, archived: true, action: "archived_stale" };
  if (args.ageMs <= DRAFT_RESUME_FRESHNESS_MS) return { resume: true, archived: false, action: "resume" };
  return { resume: false, archived: false, action: "abandoned" };
}
