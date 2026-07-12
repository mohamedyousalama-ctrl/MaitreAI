// ============================================================================
// MaitreAI — WO-LIVE6-DUP-ORDER-AWARENESS: the deterministic "refers to an order I
// already placed" detector.
//
// PURE (no I/O). Live dup (conv 68966859): #1009 registered 14:46:57; at 15:01:37 the
// customer abandoned a pizza add-on with «لاخلاص خلينا على طلبي القديم» ("no, forget it,
// let's keep my OLD order") — a REFERENCE to the already-registered #1009. Nothing surfaced
// that #1009 existed, so the model read it as a draft op, said the order "got deleted", and
// on a later «تأكيد الطلب» re-finalized an EXACT duplicate → #1010 (415 ج.م ×2).
//
// This detector recognizes ONLY an explicit reference to an EXISTING order — an
// "old/previous/first" qualifier bound to طلب/طلبي («طلبي القديم», «الطلب السابق»,
// «طلبي اللي فات», «نفس طلبي»). Bare «طلبي» is DELIBERATELY EXCLUDED (PM ruling): during a
// live build it means the draft being assembled («شيل من طلبي البيتزا»), not the committed
// order. Genuine REORDER intent («تاني», «كمان مرة», «أعيد», «جديد») is EXCLUDED too — a
// real new order must still be created (a missed bare-«طلبي» reference costs one clarifying
// turn, never a duplicate order). The caller additionally gates on a registered order
// actually existing this conversation, so the detector only ever fires with a real referent.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

// Reorder intent — a genuinely NEW order of the same/other items. If ANY of these is
// present, the message is NOT a reference-to-existing (it asks to place another order), so
// the intercept must NOT fire and the normal build/finalize path creates a new row.
const REORDER_INTENT_RE =
  /(?:تاني|ثاني|كمان\s*مره|مره\s*تانيه|مره\s*اخري|اعيد|اعاده|reorder|order\s*again|again)/;

// Explicit reference to an EXISTING order: طلب/طلبي/الطلب bound to an "old/previous/first"
// qualifier, or «نفس طلبي/نفس الطلب» ("same as my order"). Matched on normalizeAr'd text
// (ة→ه, ى→ي, أإآ→ا, tashkeel stripped, whitespace collapsed) so «القديم/السابق/الاولاني»
// and their unvowelled forms all resolve. «اللي فات» = the one that just passed.
const OLD_ORDER_REF_RE = new RegExp(
  [
    // طلبي القديم / الطلب السابق / طلبي الاولاني  (qualifier may carry the ال article)
    "(?:طلبي|طلبك|طلبنا|الطلب)\\s*(?:ال)?(?:قديم|سابق|اولاني)",
    // طلبي اللي فات / الطلب الي فات
    "(?:طلبي|طلبك|الطلب)\\s*(?:اللي|الي|اللى)\\s*فات",
    // نفس طلبي / نفس الطلب / نفس طلبك
    "نفس\\s*(?:طلبي|الطلب|طلبك)",
  ].join("|")
);

/**
 * True iff `text` explicitly refers to an order the customer ALREADY placed this
 * conversation (never a build/edit of the live draft, never a request to reorder).
 * Reorder intent disqualifies first; then an explicit old/existing-order reference matches.
 */
export function refersToRegisteredOrder(text: string): boolean {
  if (!text) return false;
  const n = normalizeAr(text);
  if (REORDER_INTENT_RE.test(n)) return false; // a genuine new order — never intercept
  return OLD_ORDER_REF_RE.test(n);
}
