// ============================================================================
// Kivo — WO-5: template registry write-layer + CATEGORY-TRUTH LAW (server logic).
//
// The law (PM ruling, Campaigns audit): a WhatsApp template whose CONTENT carries
// an offer / discount / purchase-nudge is MARKETING — full stop. Trying to
// register such content as 'utility' (or 'authentication') is REFUSED at write
// time. Content decides the category, not the author's stated intent. This closes
// the abuse where a promo is mislabeled utility to slip past the marketing
// opt-in / 24h-window rules (and to dodge Meta's own re-categorization + quality
// penalties).
//
// Pure logic (no value imports beyond types) so the node proof harness can load
// it directly. The DB upsert helper takes an INJECTED admin client.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type TemplateCategory = "utility" | "marketing" | "authentication";
export type MetaStatus = "unknown" | "pending" | "approved" | "rejected" | "paused" | "disabled";
export type QualityRating = "unknown" | "green" | "yellow" | "red";

// ── Promotional markers (offer / discount / purchase-nudge). Arabic + English.
// Erring toward MARKETING is the safe direction: a false "promotional" only
// forces a stricter category, never the reverse. Word-ish substring match is
// intentional (Arabic has no reliable word boundaries in \b), tuned to avoid the
// obvious innocents.
const PROMO_MARKERS: string[] = [
  // Arabic — discount / offer / deal
  "خصم", "خصومات", "تخفيض", "تخفيضات", "عرض", "عروض", "صفقة", "كوبون", "قسيمة",
  // Arabic — free / gift
  "مجانا", "مجاناً", "مجانية", "هدية", "هدايا", "بلاش",
  // Arabic — save / cheapest / cashback
  "وفّر", "وفر", "استرداد", "كاش باك", "أرخص", "ارخص", "أقل سعر",
  // Arabic — purchase nudge
  "اطلب الآن", "اطلب الان", "احجز الآن", "احجز الان", "اشترِ", "اشتري", "سارع", "لفترة محدودة", "لفتره محدوده",
  // English — discount / offer / deal
  "discount", "sale", "offer", "deal", "coupon", "voucher", "promo", "promotion",
  // English — free / save / cashback
  "free", "save", "cashback",
  // English — purchase nudge
  "buy now", "order now", "shop now", "limited time", "hurry", "last chance", "% off", "off today",
];

// A bare percentage in the body ("خصم 30%", "30% off", "٥٠٪") reads as a discount.
const PERCENT = /(\d{1,3}\s*%|\d{1,3}\s*٪|[٠-٩]{1,3}\s*٪|[٠-٩]{1,3}\s*%)/;

export interface PromoScan {
  promotional: boolean;
  markers: string[];
}

/** Scan template text for promotional signals. Case-insensitive for Latin. */
export function classifyPromotional(...parts: Array<string | null | undefined>): PromoScan {
  const raw = parts.filter(Boolean).join("  ");
  const hay = raw.toLowerCase();
  const hits: string[] = [];
  for (const m of PROMO_MARKERS) {
    if (hay.includes(m.toLowerCase())) hits.push(m);
  }
  if (PERCENT.test(raw)) hits.push("%");
  return { promotional: hits.length > 0, markers: hits };
}

export interface CategoryTruthResult {
  ok: boolean;
  /** The category the content REQUIRES (only set when ok === false). */
  requiredCategory?: TemplateCategory;
  markers?: string[];
  error?: string;
}

/**
 * CATEGORY-TRUTH LAW. Given the requested category and the template's content,
 * refuse a non-marketing category for promotional content. Returns ok:false with
 * the required category + the offending markers so the caller can 4xx with a
 * clear reason. Non-promotional content passes at any category (utility default).
 */
export function assertCategoryTruth(
  category: TemplateCategory,
  ...text: Array<string | null | undefined>
): CategoryTruthResult {
  const scan = classifyPromotional(...text);
  if (scan.promotional && category !== "marketing") {
    return {
      ok: false,
      requiredCategory: "marketing",
      markers: scan.markers,
      error: "category_truth_violation",
    };
  }
  return { ok: true };
}

// ── Meta WABA field mappers (message_templates API → our enums) ──────────────
export function mapMetaCategory(raw: unknown): TemplateCategory {
  const v = String(raw ?? "").toLowerCase();
  if (v === "marketing") return "marketing";
  if (v === "authentication") return "authentication";
  return "utility";
}

export function mapMetaStatus(raw: unknown): MetaStatus {
  switch (String(raw ?? "").toUpperCase()) {
    case "APPROVED": return "approved";
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION": return "pending";
    case "REJECTED": return "rejected";
    case "PAUSED": return "paused";
    case "DISABLED":
    case "DELETED": return "disabled";
    default: return "unknown";
  }
}

export function mapQualityRating(raw: unknown): QualityRating {
  switch (String(raw ?? "").toUpperCase()) {
    case "GREEN": return "green";
    case "YELLOW": return "yellow";
    case "RED": return "red";
    default: return "unknown";
  }
}

export interface TemplateUpsertInput {
  name: string;
  language?: string;
  variant?: string;
  category: TemplateCategory;
  bodyText: string;
  metaStatus?: MetaStatus;
  qualityRating?: QualityRating;
  /** true when this write reflects a real Meta sync (stamps last_synced_at). */
  fromSync?: boolean;
}

export type TemplateUpsertResult =
  | { ok: true; name: string; category: TemplateCategory }
  | { ok: false; error: string; requiredCategory?: TemplateCategory; markers?: string[] };

/**
 * Upsert one template row AFTER enforcing the category-truth law. The admin
 * (service-role) client is injected. Scoped to (restaurant_id, name, language,
 * variant). A category-truth violation is refused BEFORE any DB write.
 */
export async function upsertTemplate(
  admin: SupabaseClient,
  restaurantId: string,
  input: TemplateUpsertInput
): Promise<TemplateUpsertResult> {
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "name_required" };

  const language = (input.language ?? "ar").trim() || "ar";
  const variant = (input.variant ?? "default").trim() || "default";
  const bodyText = input.bodyText ?? "";

  // LAW — refuse promotional content under a non-marketing category.
  const truth = assertCategoryTruth(input.category, name, bodyText);
  if (!truth.ok) {
    return { ok: false, error: truth.error!, requiredCategory: truth.requiredCategory, markers: truth.markers };
  }

  const row = {
    restaurant_id: restaurantId,
    name,
    language,
    variant,
    category: input.category,
    body_text: bodyText,
    meta_status: input.metaStatus ?? "unknown",
    quality_rating: input.qualityRating ?? "unknown",
    updated_at: new Date().toISOString(),
    ...(input.fromSync ? { last_synced_at: new Date().toISOString() } : {}),
  };

  const { error } = await admin
    .from("message_templates")
    .upsert(row, { onConflict: "restaurant_id,name,language,variant" });
  if (error) return { ok: false, error: "upsert_failed" };
  return { ok: true, name, category: input.category };
}
