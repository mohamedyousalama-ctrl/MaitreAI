// ============================================================================
// MaitreAI — WO-LIVE6-REPLY-DAMPENER: silence a RUN of unclear-fragment replies.
//
// PURE (no I/O). Live (conv 68966859, 15:18–15:19): a burst of non-actionable fragments —
// single letters «د/سا/ب/ست/ا», punctuation «:(:$», emoji strings «😁🇮🇷💔😞✨» — each drew a
// chatty/«مش فاهم» reply, piling up 4+ «مش فاهم» in seconds. After 2 answered unclear replies,
// a 3rd+ unclear fragment in the same short window should get SILENCE; ANY meaningful message
// resets. Silence here is a deliberate drop of noise, NOT of a customer message — the caller
// MUST first let the allergen safety net + the human-request detector run (they never dampen),
// and any meaningful token makes the fragment answerable again (the live burst was immediately
// followed by a human request and a severe-allergy disclosure — both meaningful, both answered).
//
// SKIP-ON-DOUBT, treat as MEANINGFUL: only the UNMISTAKABLY non-actionable is ever unclear —
// emoji/punctuation/symbol-only, a lone character, or empty. ANY digit, or a residue of 2+
// letters, is meaningful (so a real 2–3 letter food word «رز»/«شاي»/«فول» is never silenced).
// The streak is DERIVED from the already-loaded recent messages — no schema, no migration.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

/** Dampen from the 3rd consecutive unclear fragment (2 answered replies = fair warning). */
export const DAMPEN_STREAK_THRESHOLD = 2;
/** The burst window — a streak older than this is stale and does NOT dampen. */
export const DAMPEN_WINDOW_MS = 5 * 60 * 1000;

// Common short words that ARE meaningful despite their length — assent / negation / greeting /
// courtesy. Matched on normalizeAr'd residue so unvowelled forms resolve.
const MEANINGFUL_SHORT = new Set([
  "اه", "اها", "ايوه", "ايوا", "اي", "ايه", "نعم", "لا", "لأ", "لاء", "مش",
  "اوك", "اوكي", "تمام", "ماشي", "اكيد", "طيب", "تم", "حسنا",
  "هلا", "هاي", "هالو", "مرحبا", "اهلا", "شكرا", "ثانكس", "ok", "no", "yes",
]);

/** Letters + digits only (drops emoji, symbols, punctuation, whitespace). normalizeAr first so
 *  the digit check + the short-word whitelist see a canonical form. */
function residueOf(text: string): string {
  return normalizeAr(text).replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * True iff `text` is an UNMISTAKABLY non-actionable fragment (skip-on-doubt: default meaningful).
 * Unclear: empty, emoji/punctuation/symbol-only, or a lone non-digit character. Meaningful:
 * anything with a digit, a known short word, or a residue of 2+ letters.
 */
export function isUnclearFragment(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return true; // nothing to answer
  const r = residueOf(text);
  if (r.length === 0) return true; // emoji / punctuation / symbol only
  if (/[0-9]/.test(r)) return false; // any digit → a quantity / price / phone → meaningful
  if (MEANINGFUL_SHORT.has(r)) return false; // assent / greeting / negation
  if (r.length === 1) return true; // a lone letter is not a message
  return false; // 2+ letters → skip-on-doubt → meaningful (never silence a real short word)
}

/**
 * Count the run of trailing customer messages (most-recent-first) that are unclear fragments
 * AND still inside the window. The run stops at the first meaningful / out-of-window message —
 * so any meaningful message RESETS the streak. Pure; `nowMs` is injected.
 */
export function trailingUnclearStreak(
  priorCustomerMsgs: { text: string; createdAtMs: number }[],
  nowMs: number,
  windowMs: number = DAMPEN_WINDOW_MS
): number {
  let n = 0;
  for (const m of priorCustomerMsgs) {
    if (nowMs - m.createdAtMs > windowMs) break; // stale → the burst ended here
    if (!isUnclearFragment(m.text)) break; // a meaningful message resets the streak
    n++;
  }
  return n;
}

/**
 * The dampen decision: the CURRENT inbound is an unclear fragment AND at least
 * DAMPEN_STREAK_THRESHOLD trailing unclear fragments already sit within the window. The caller
 * is responsible for the safety/human-request exemption (this never sees those) and the flag.
 */
export function shouldDampenReply(
  currentText: string,
  priorCustomerMsgs: { text: string; createdAtMs: number }[],
  nowMs: number,
  opts?: { windowMs?: number; threshold?: number }
): boolean {
  const windowMs = opts?.windowMs ?? DAMPEN_WINDOW_MS;
  const threshold = opts?.threshold ?? DAMPEN_STREAK_THRESHOLD;
  if (!isUnclearFragment(currentText)) return false;
  return trailingUnclearStreak(priorCustomerMsgs, nowMs, windowMs) >= threshold;
}
