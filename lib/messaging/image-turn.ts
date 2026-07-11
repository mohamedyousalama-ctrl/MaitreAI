// ============================================================================
// WO-MEDIA-INBOUND — pure helpers for the inbound-image turn (media_turn_trigger).
//
// No node-only / server-only deps: safe to unit-test and to import from both the
// server pipeline and the test harness. The LLM vision READ itself lives in the
// server-only lib/ai/image-perception.ts; everything here is deterministic string
// shaping so the red-first proofs run against the mock adapter with zero network.
//
// PROVENANCE LAW (PM condition 1): a vision-derived description is a MODEL READ,
// never the customer's words. It is:
//   • persisted under messages.meta.image.description with derived:true (data), and
//   • injected into LATER-turn history ONLY behind an explicit «قراءة الصورة (ليست
//     من العميل)» marker — so no downstream consumer (or the model) can mistake it
//     for customer-typed text, and so it NEVER becomes the deterministic allergen
//     gate's input (the gate reads the CURRENT turn's userMessage, i.e. the customer
//     caption or the 📷 placeholder — never this description).
// ============================================================================

/** The customer-side placeholder text stored for an image that carried NO caption.
 *  It is the current-turn userMessage for an image-only turn — deliberately benign
 *  so the deterministic allergen gate never fires on the image itself (a derived
 *  description with an allergen word can NEVER reach the gate through this path). */
export const IMAGE_PLACEHOLDER = "📷";

/** The provenance marker prefixing a vision read wherever it is shown to the model.
 *  Explicitly labels the text as a READ of the image, NOT the customer's words. */
export const IMAGE_READ_MARKER = "👀 قراءة الصورة (ليست من العميل)";

export interface ImageTurnContext {
  /** The customer's own caption text (their words), if the image carried one. */
  caption: string | null;
  /** The MODEL-DERIVED vision description (a read), or null when unavailable
   *  (no caption-independent read, vision error/timeout, or test/mock adapter). */
  description: string | null;
}

/**
 * The LATER-turn history content for a persisted image message. The base text is the
 * customer's caption (their words) or the 📷 placeholder; the vision read, when
 * present, is appended ONLY behind the provenance marker. Pure string shaping.
 *
 * This is what lets a following turn "see" the image — as clearly-labelled context,
 * never as customer input, and never as allergen-gate input (history is not gated).
 */
export function imageHistoryContent(baseText: string, description: string | null | undefined): string {
  const base = (baseText ?? "").trim();
  const desc = (description ?? "").trim();
  if (!desc) return base || IMAGE_PLACEHOLDER;
  const head = base && base !== IMAGE_PLACEHOLDER ? `${base}\n` : "";
  return `${head}«${IMAGE_READ_MARKER}: ${desc}»`;
}

/**
 * The per-turn system directive appended for a turn whose inbound was an image
 * (mirrors WO-DELIVERY-D1's geoDirective). NEVER empty → the customer is never met
 * with silence (PM condition 4), even when the vision read failed. It is always a
 * READ, never a fact: the model is told not to invent prices/items and to fall back
 * to a warm question when the image is unclear. It does NOT touch the deterministic
 * allergen gate, which runs on the customer's own text independently and earlier.
 */
export function buildImageDirective(ctx: ImageTurnContext): string {
  const desc = (ctx.description ?? "").trim();
  if (desc) {
    return [
      "## 👀 صورة من العميل (قراءة داخلية — ليست حقيقة)",
      `العميل بعت صورة. قراءة بصرية بتوصفها: «${desc}».`,
      "اتعامل معاها طبيعي: لو عرض/كتيبة أو صنف واضح، اربطه بالمنيو الحقيقي وأكمّل بدفء (مثال: «شفت الصورة 👀 ده عرض الكتيبة — موجود! تحبه؟»).",
      "ممنوع تماماً: تخترع سعر أو صنف مش موجود فعلاً في المنيو؛ أو تأكّد توفّر حاجة من غير ما تتأكد منها. القراءة دي مجرد وصف — لو مش متطابقة مع المنيو، اسأل توضيحاً.",
      "لو الصورة مش واضحة أو مش متعلّقة بالأكل/الطلب، اسأل العميل بلطف محتاج إيه بالظبط. ممنوع الصمت أو تجاهل الصورة.",
    ].join("\n");
  }
  // Vision read unavailable (error/timeout/test mode) — warm fallback, never silence.
  return [
    "## 👀 صورة من العميل",
    "العميل بعت صورة اتعذّر قراءتها آلياً. رحّب بيه واسأله بدفء يقول محتاج إيه أو يكتب سؤاله — من غير ما تخمّن محتوى الصورة. ممنوع الصمت.",
  ].join("\n");
}
