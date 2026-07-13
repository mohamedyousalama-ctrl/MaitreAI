// ============================================================================
// WO-IMAGE-BINDING (PURE, no I/O). The deterministic image→menu binding layer, mirroring
// the voice candidate matcher. FR-011 (conv b41988eb): the model affirmed availability
// («موجود») on an image turn BEFORE the image's referent was resolved against the menu —
// three live fails (promo ad, off-menu shrimp pizza, products photo). The prompt alone
// didn't hold, so this adds a deterministic backstop.
//
//   • isDeicticImageReference — «ده/دي/الصورة» with an image ⇒ the referent is THIS image.
//   • resolveImageMenuCandidates — reuse resolveVoiceCandidates on the vision READ (same
//     provenance «قراءة»; the allergen HARD LAW carries over unchanged — an allergen token
//     from a description is NEVER a candidate, so a «جمبري» image yields no shrimp match).
//   • imageAvailabilityGuard — the assertsAllergenSafety-style output guard: on an image
//     turn where the customer asks availability AND the model affirms it BUT no DISTINCTIVE
//     menu candidate resolved, rewrite to an honest no-match (never a false «موجود») + the
//     closest suggestion, and emit the measurement signal.
// ============================================================================

import { normalizeAr } from "./allergen-gate";
import { resolveVoiceCandidates, type VoiceCandidate } from "./voice-aliases";

/** «ده/دي/دى/الصورة/اللي في الصورة» — a deictic pointing at the turn's image. */
export function isDeicticImageReference(message: string): boolean {
  const n = normalizeAr(String(message ?? ""));
  return /(?<![ء-ي])(ده|دي|دى)(?![ء-ي])/.test(n) || /الصوره/.test(n) || /في الصوره|بالصوره/.test(n);
}

/** The customer asks whether something is available. */
export function asksImageAvailability(message: string): boolean {
  return /موجود|متوفر|متاح|عندكم|عندك|بتعملوا|تعملوا|بتوفروا/.test(normalizeAr(String(message ?? "")));
}

const AVAIL_POS = /موجود|متوفر|متاح|عندنا/;
const AVAIL_NEG = /مش موجود|مش متوفر|مش متاح|مو موجود|ما عندنا|ماعندنا|معندناش|مافيش/;
/** The model's reply AFFIRMS availability (positive, not a «مش موجود»/«ما عندناش» negation). */
export function affirmsAvailability(text: string): boolean {
  const n = normalizeAr(String(text ?? ""));
  return AVAIL_POS.test(n) && !AVAIL_NEG.test(n);
}

/** Ingredient / category tokens that match many items — an incidental match on these is
 *  NOT a confident resolution of "the item the customer wants from this image". */
const IMAGE_GENERIC_TOKENS: ReadonlySet<string> = new Set(
  ["بيتزا", "دجاج", "بطاطس", "قطع", "قطعه", "وجبه", "عرض", "لحم", "صلصه", "خبز", "جبنه",
   "ارز", "برجر", "صوص", "فراخ", "كاتشب", "مايونيز", "زيتون", "فلفل"].map(normalizeAr)
);

/** Image→menu candidates: reuse the voice matcher on the vision READ. Prepend an order-frame
 *  so the resolver's frame-gate opens for description text (same trick as slots.ts). The
 *  allergen HARD LAW lives inside resolveVoiceCandidates — allergen tokens are never returned. */
export function resolveImageMenuCandidates(
  description: string | null | undefined,
  menuItemNames: Array<string | null | undefined>
): VoiceCandidate[] {
  const d = String(description ?? "").trim();
  if (!d) return [];
  return resolveVoiceCandidates(`عايز ${d}`, { menuItemNames });
}

/** A CONFIDENT image→menu resolution: an exact/alias candidate matched on a DISTINCTIVE
 *  (≥3-char, non-generic) token — a bare «بيتزا»/«دجاج» ingredient match doesn't count. */
export function hasResolvedImageCandidate(
  description: string | null | undefined,
  menuItemNames: Array<string | null | undefined>
): boolean {
  return resolveImageMenuCandidates(description, menuItemNames).some(
    (c) => (c.source === "alias" || c.source === "menu_exact") &&
      normalizeAr(c.token).length >= 3 && !IMAGE_GENERIC_TOKENS.has(normalizeAr(c.token))
  );
}

/** The closest menu item to suggest in a no-match reply (top by confidence), or null. */
export function closestImageCandidate(
  description: string | null | undefined,
  menuItemNames: Array<string | null | undefined>
): string | null {
  return resolveImageMenuCandidates(description, menuItemNames)[0]?.item ?? null;
}

/** The honest no-match reply — never affirms availability; offers the closest when one exists. */
export function buildImageNoMatchReply(dialect: string, closest: string | null): string {
  const c = String(closest ?? "").trim();
  if (dialect === "egyptian") {
    return c
      ? `الصنف اللي في الصورة مش موجود عندنا بالظبط 🙏 بس أقرب حاجة عندنا «${c}» — تحبها؟`
      : `الصنف اللي في الصورة مش موجود عندنا حالياً 🙏 تحب أساعدك تختار من المنيو؟`;
  }
  return c
    ? `الصنف اللي في الصورة مو موجود عندنا بالضبط 🙏 بس أقرب شي عندنا «${c}» — تحبها؟`
    : `الصنف اللي في الصورة مو موجود عندنا حالياً 🙏 تحب أساعدك تختار من المنيو؟`;
}

export interface ImageGuardSignal {
  image_desc: string;
  affirmed_wrongly: boolean;
  resolved_candidate: string | null;
}
export interface ImageGuardResult {
  rewritten: string | null;
  signal: ImageGuardSignal | null;
}

/**
 * FR-011 availability guard (assertsAllergenSafety-style). On an image turn where the
 * customer asks availability AND the model AFFIRMS it BUT no distinctive menu candidate
 * resolved from the image, rewrite the reply to an honest no-match (never a false «موجود»)
 * + the closest suggestion, and emit the measurement signal. Otherwise no change. Pure.
 */
export function imageAvailabilityGuard(args: {
  customerMessage: string;
  replyText: string;
  description: string | null | undefined;
  menuItemNames: Array<string | null | undefined>;
  dialect: string;
}): ImageGuardResult {
  const desc = String(args.description ?? "").trim();
  if (!asksImageAvailability(args.customerMessage) || !affirmsAvailability(args.replyText)) {
    return { rewritten: null, signal: null };
  }
  if (hasResolvedImageCandidate(desc, args.menuItemNames)) return { rewritten: null, signal: null };
  const closest = closestImageCandidate(desc, args.menuItemNames);
  return {
    rewritten: buildImageNoMatchReply(args.dialect, closest),
    signal: { image_desc: desc, affirmed_wrongly: true, resolved_candidate: closest },
  };
}
