// ============================================================================
// MaitreAI — WO-LIVE-3: customer media-intent detectors (PURE, no I/O).
// Two deterministic reads of the customer's inbound message that shape media
// disposal (both consulted ONLY when the media_guard flag is ON):
//
//   • asksForMorePhotos — the customer explicitly wants MORE / ALL photos. Raises
//     the per-message photo cap from the default 2 to the ceiling 3 (Mohamed's
//     LIVE-3 rule §3). High-precision: an "amount/more" marker MUST co-occur with a
//     show/photo/items marker, so a plain order («عايز اتنين بروست») never fires.
//   • asksForMenuLink — the customer explicitly wants the MENU / a LINK. Legitimises
//     an INTENTIONAL web-menu-link send (§5, not a budget fallback). An explicit
//     «رابط»/«لينك»/"link" fires alone; the softer «المنيو»/«القائمة» needs a
//     request/show verb so a passing mention doesn't trip it.
//
// Arabic matching goes through normalizeAr (shared with the allergen gate) so it is
// robust to tashkeel / alef-ya-ta variants. Latin is lowercased by normalizeAr too.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

// "more / all / the rest / another batch" — an amount marker.
const MORE_RE = /اكتر|اكثر|المزيد|مزيد|باقي|بقيه|كله|الكل|كامل|كامله|جميع|كل ?الاصناف|كل ?الصور|كمان ?صور|زياده/;
// "photos / items / show me" — a show-media marker. NOTE: literals are in normalizeAr
// form (ئ→ي, ى→ي, ة→ه) since matching runs on the normalized string — «قائمة»→«قايمه».
const SHOW_MEDIA_RE = /صور|صوره|اصناف|منيو|مينيو|قايمه|كتالوج|اشوف|شوف|ورني|وريني|ورينا|فرجيني/;

/** True iff the customer explicitly asks to see MORE / ALL photos this turn. Pure. */
export function asksForMorePhotos(text: string): boolean {
  const n = normalizeAr(text);
  if (!n) return false;
  return MORE_RE.test(n) && SHOW_MEDIA_RE.test(n);
}

// An explicit LINK ask always counts (a link is unambiguous).
const LINK_WORD_RE = /رابط|لينك|link/;
// The menu/catalogue words — softer, need a request/show verb to count. Normalized
// forms (ئ→ي, ة→ه): «القائمة»→«القايمه».
const MENU_WORD_RE = /المنيو|المينيو|القايمه|الكتالوج|\bmenu\b/;
// Request / show framing that turns a menu MENTION into a menu ASK. Normalized forms
// (ى→ي): «ابغى»→«ابغي».
const MENU_REQUEST_RE = /ابعت|ارسل|بعتلي|ابعتلي|هات|وري|ورني|ورينا|عايز|عاوز|ابغي|ابي|ممكن|اشوف|شوف|عندكم|عندك|في|فيه|فين|اطلع|افتح|share|send/;

/** True iff the customer explicitly asks for the MENU or a LINK this turn. Pure. */
export function asksForMenuLink(text: string): boolean {
  const n = normalizeAr(text);
  if (!n) return false;
  if (LINK_WORD_RE.test(n)) return true;
  return MENU_WORD_RE.test(n) && MENU_REQUEST_RE.test(n);
}
