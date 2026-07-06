// ============================================================================
// MaitreAI — Smart-menu conversation playbook (WO-MENU-PLAYBOOK, V1).
//
// A PERSONA-AGNOSTIC prompt-level overlay — it applies to BOTH personas (Karim /
// Egyptian and Khalid / Saudi) because menu conversation is engine behaviour, not
// a persona voice. Pure leaf, no I/O, imported by nothing yet (lands like the
// persona/allergen-vocab leaves before their wiring). Flag `menu_playbook`,
// default OFF; injection is a separate Core wiring PR.
//
// DIVISION OF LABOUR (binding): the HARD CAPS are engine-enforced deterministically
// by Core (max photos per turn, tool availability, money-from-tools, the allergen
// safety gate/law). THIS layer is the JUDGMENT that sits ABOVE those caps — WHEN to
// narrow instead of dump, HOW to classify a photo request, WHEN to pause media, WHAT
// the next-action question is. It never claims to change a fact, a price, availability,
// an allergen clearance, or a hard cap; it defers to the engine on all of those.
//
// This module ships as OVERLAY CONTENT (buildMenuPlaybook → a prompt section) plus a
// small, testable JUDGMENT helper (classifyPhotoRequest) that encodes the media-count
// decision so the eval suite can assert against it. Core owns the numeric enforcement.
// ============================================================================

/** Reserved feature flag (default OFF). Gates injection of the menu playbook overlay. */
export const MENU_PLAYBOOK_FLAG = "menu_playbook" as const;

type Dialect = "saudi" | "egyptian";
const asDialect = (d: string | null | undefined): Dialect => (d === "egyptian" ? "egyptian" : "saudi");

// --- Dialect anchors (both personas) — anchors, not scripts; vary the wording. -----
interface MenuAnchors {
  label: string;
  /** Browse → the narrowing question (never a 60-item dump). */
  browseNarrow: string;
  /** Recommend → hand-off to 2–3 ranked picks + one preference question. */
  recommendAsk: string;
  /** Full-menu photo request → offer a way to see it (category ask / web-menu link). */
  fullMenuOffer: string;
  /** The always-after-photos next-action question. */
  nextAction: string;
  /** Health caution appended to any diet/health claim. */
  healthCaution: string;
}
const ANCHORS: Record<Dialect, MenuAnchors> = {
  saudi: {
    label: "سعودي",
    browseNarrow: "تحب تشوف المنيو بأي طريقة؟ بالتصنيفات، ولا الأكثر طلباً، ولا العروض؟",
    recommendAsk: "أرشّح لك ثلاث أصناف طيبة — تميل للمشوي ولا المقلي؟",
    fullMenuOffer: "المنيو كامل كثير — تحب أبدأ بتصنيف معيّن، ولا أرسل لك رابط المنيو الكامل؟",
    nextAction: "تحب أضيف واحد منها للطلب، ولا أوريك غيرها؟",
    healthCaution: "للعلم، هذي معلومة عامة — لو عندك حمية طبية أو حالة صحية، تأكد مع المطعم/طبيبك.",
  },
  egyptian: {
    label: "مصري",
    browseNarrow: "تحب تشوف المنيو إزاي؟ بالتصنيفات، ولا الأكثر مبيعاً، ولا العروض؟",
    recommendAsk: "هرشّحلك تلات أصناف حلوين — بتحب المشوي ولا المقلي؟",
    fullMenuOffer: "المنيو كبير — تحب أبدأ بتصنيف معيّن، ولا أبعتلك لينك المنيو كامل؟",
    nextAction: "تحب أضيف واحد منهم للأوردر، ولا أوريك غيرهم؟",
    healthCaution: "للعلم، دي معلومة عامة — لو عندك نظام غذائي طبي أو حالة صحية، اتأكد مع المطعم/دكتورك.",
  },
};

// ---------------------------------------------------------------------------
// JUDGMENT HELPER — classify a photo request into the INTENDED media plan.
// This encodes the WO media rule. It is the judgment; Core enforces the numeric cap
// (e.g. a hard max of 4 per turn) on top of `plannedPhotos`. Pure + deterministic.
// ---------------------------------------------------------------------------
export type PhotoRequestKind = "none" | "specific" | "category" | "full_menu" | "more";

export interface PhotoPlan {
  kind: PhotoRequestKind;
  /** Intended number of photos BEFORE Core's hard cap clamps it. full_menu = 0 (ask/link first). */
  plannedPhotos: number;
  /** full_menu → true: ask which category or offer the web-menu link before any photos. */
  needsCategoryAskOrLink: boolean;
  /** "more" after a batch → send the next batch then offer the web-menu link. */
  offerWebMenuLink: boolean;
  /** After ANY photos are sent, a next-action question is always appended. */
  appendNextAction: boolean;
}

const PHOTO_INTENT_RE = /صور[ةه]?|صور|شكل|أشكال|اشكال|بالصور|ورّ?يني|ورني|أشوف شكل|اشوف شكل|شكلها|شكله/;
const FULL_MENU_RE = /(?:المنيو|القائم[ةه]|الليست|الكتالوج)\s*(?:كامل[ةه]?|كل[ةه]?|بالكامل|كله|كلها|كامل)|كل\s+الأصناف|كل\s+الاصناف|جميع\s+الأصناف/;
const CATEGORY_RE = /العروض|المشروبات|الحلا|الحلويات|المقبلات|التحلي[ةه]|تصنيف|قسم|صنف\s+ال|الساندويتشات|البيتزا|الأطباق|الاطباق|المشاوي|الوجبات/;
const MORE_RE = /كمان|زياد[ةه]|غيرها|غيره|باقي|المزيد|زودني|ورّ?يني كمان/;

/**
 * Classify a customer message's photo request into the intended media plan.
 * Precedence: full-menu → more → category → specific → none. `afterPhotos` = a photo
 * batch was already shown this chat (biases a bare "more" and forces appendNextAction).
 * NOTE: judgment only — Core clamps plannedPhotos to the hard per-turn cap.
 */
export function classifyPhotoRequest(text: string, afterPhotos = false): PhotoPlan {
  const s = String(text ?? "");
  const hasPhotoIntent = PHOTO_INTENT_RE.test(s);
  const base = (kind: PhotoRequestKind, plannedPhotos: number, extra: Partial<PhotoPlan> = {}): PhotoPlan => ({
    kind,
    plannedPhotos,
    needsCategoryAskOrLink: false,
    offerWebMenuLink: false,
    appendNextAction: plannedPhotos > 0,
    ...extra,
  });

  if (!hasPhotoIntent && !(afterPhotos && MORE_RE.test(s))) return base("none", 0);

  // FULL MENU → 0 photos first: ask a category or offer the web-menu link.
  if (FULL_MENU_RE.test(s)) {
    return base("full_menu", 0, { needsCategoryAskOrLink: true, appendNextAction: false });
  }
  // MORE (after a prior batch) → next batch of 3, then offer the web-menu link.
  if (MORE_RE.test(s) && (afterPhotos || hasPhotoIntent)) {
    return base("more", 3, { offerWebMenuLink: true, appendNextAction: true });
  }
  // CATEGORY / offers → a small sample (3).
  if (CATEGORY_RE.test(s)) {
    return base("category", 3);
  }
  // A specific item was named → exactly 1.
  return base("specific", 1);
}

/** Conversation states in which ALL media is PAUSED (existing engine law). */
export const MEDIA_PAUSED_STATES = ["safety", "allergy", "complaint", "payment"] as const;
export type ConversationState = (typeof MEDIA_PAUSED_STATES)[number] | "browsing" | "ordering" | "normal";
/** True when media must be suppressed regardless of the request (safety/complaint/payment). */
export function mediaPaused(state: ConversationState): boolean {
  return (MEDIA_PAUSED_STATES as readonly string[]).includes(state);
}

// ---------------------------------------------------------------------------
// OVERLAY BUILDER — the prompt section (the judgment, in words).
// ---------------------------------------------------------------------------
export interface MenuPlaybookCtx {
  dialect?: string | null;
  /** Whether a browseable web-menu link exists for this tenant (Core-provided). Default false. */
  hasWebMenuLink?: boolean;
}

export function buildMenuPlaybook(ctx: MenuPlaybookCtx = {}): string {
  const d = asDialect(ctx.dialect);
  const a = ANCHORS[d];
  const linkClause = ctx.hasWebMenuLink
    ? "if a web-menu link is available, offering it is the right move for a full-menu request"
    : "if NO web-menu link exists, ask a narrowing question instead of a link (never invent a link)";

  return `

## قائمة الطعام الذكية (menu conversation playbook — ${a.label} · judgment ABOVE the engine's hard caps)
*(This layer is JUDGMENT only. The engine still enforces the HARD CAPS deterministically —
the max photos per turn, which tools exist, money-from-tools, and the allergy safety law.
Never contradict a fact, price, availability, allergen clearance, or a cap; defer to the engine.)*

### موجّه النية (intent router — read what the customer is really asking, then behave)
- BROWSE ("وش عندكم / المنيو / إيه عندكو"): do NOT dump 60 items. Ask ONE structured narrowing question that
  offers real ways to look — «${a.browseNarrow}» — then SHOW the chosen slice (present_menu / the real category).
  This is a STRUCTURED narrowing, NOT a content-free deflection («اختار اللي يعجبك» is still forbidden).
- RECOMMEND ("وش تنصحني / رشّحلي"): give **2–3 RANKED picks** by signature + honest sensory truth from the real
  item data, then ONE preference question — «${a.recommendAsk}». Never a single take-it-or-leave-it, never the
  whole list.
- CONSTRAINT (price / spice / kids / diet): return **filtered picks** that meet the constraint from the real menu
  (e.g. "under X", "not spicy", "kids"), and for any DIET/HEALTH claim append the caution line — «${a.healthCaution}».
  Never assert medical suitability (that's a forbidden claim); the caution is mandatory on diet answers.
- COMPARE ("إيش الفرق بين X و Y"): answer the **plain difference** from the item data (size, protein, spice,
  price) in one clear line — help them choose, don't upsell the pricier one dishonestly.
- AVAILABILITY ("عندكم X؟ / X خلص؟"): answer from ENGINE TRUTH ONLY (the live menu/86 state). If unavailable →
  acknowledge-then-pivot to a real alternative. Never guess availability.
- ALLERGY (any allergy / «حساسية» / symptom): SAFETY FLOW takes over — **ALL selling and ALL media PAUSE**
  (existing law). Acknowledge the allergen, follow the deterministic gate, never upsell, never send a photo. Menu
  judgment yields entirely to safety.

### قواعد الوسائط (media rules — classify the photo request, then act)
- SPECIFIC item named → send **that item's** photo (1), if it has one.
- CATEGORY / offers → a small **sample of ~3** standout items from that section.
- FULL MENU ("صور المنيو كامل") → **0 photos first**: ${linkClause}. «${a.fullMenuOffer}» Then send the chosen
  slice. Never answer a full-menu photo request with a wall of images.
- MORE ("كمان / غيرها") → send the **next few (~3)**, then offer the web-menu link if one exists.
- AFTER ANY PHOTOS → ALWAYS end with a next-action question — «${a.nextAction}» — never drop a batch of images and
  go silent.
- NEVER send media during **safety / allergy / complaint / payment** — those states pause all media until resolved.
- NO GOOD PHOTO ("photo: not available" / none exist) → **describe the item honestly** in words; NEVER send an
  unapproved or substitute image, and never claim a photo exists when it doesn't.
- The engine caps the number of images per turn — stay within it; these numbers are the INTENT, the engine is the
  enforcer.`;
}
