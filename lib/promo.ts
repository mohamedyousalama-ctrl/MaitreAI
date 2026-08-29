// ============================================================================
// MaitreAI — In-chat promotion builder engine (Phase 1, §T forward) — pure logic
// The discount/price math is computed HERE (the "tool") — never written by the
// LLM. The Admin Agent only routes + drafts caption VOICE. A draft is filled one
// field at a time (deterministic chips = $0); the affected before/after prices
// are always recomputed from the live menu. Client-safe (no server-only).
// ============================================================================

import type { MenuItem, OperatorPromotion } from "@/lib/types";

export type PromoOfferType = "percent_off" | "amount_off" | "fixed_price" | "bogo";
export type PromoScopeType = "item" | "category" | "all";

export interface PromoDraft {
  scopeType?: PromoScopeType;
  scopeRef?: string; // item id or category name
  scopeLabel?: string; // display label
  offerType?: PromoOfferType;
  amount?: number; // percent (20) | amount off | fixed price; unused for bogo
  durationDays?: number;
  caption?: string;
  name?: string;
}

export interface AffectedItem {
  name: string;
  before: number;
  after: number;
}

export type PromoStep = "scope" | "offer" | "amount" | "duration" | "caption" | "review";

export const OFFER_LABELS: Record<PromoOfferType, string> = {
  percent_off: "خصم نسبة",
  amount_off: "خصم مبلغ",
  fixed_price: "سعر ثابت",
  bogo: "اشترِ 1 واحصل على 1",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Resolve the menu items a draft's scope applies to (available items only). */
export function scopeItems(menu: MenuItem[], d: PromoDraft): MenuItem[] {
  const avail = menu.filter((i) => i.available);
  if (d.scopeType === "all") return avail;
  if (d.scopeType === "category") return avail.filter((i) => i.category === d.scopeRef);
  if (d.scopeType === "item") return avail.filter((i) => i.id === d.scopeRef);
  return [];
}

/** TOOL: compute before/after prices for the draft from the live menu. */
export function computeAffected(menu: MenuItem[], d: PromoDraft): AffectedItem[] {
  if (!d.offerType) return [];
  return scopeItems(menu, d).map((i) => {
    const before = i.price;
    let after = before;
    if (d.offerType === "percent_off" && d.amount != null) after = before * (1 - d.amount / 100);
    else if (d.offerType === "amount_off" && d.amount != null) after = Math.max(0, before - d.amount);
    else if (d.offerType === "fixed_price" && d.amount != null) after = d.amount;
    // bogo: per-unit price unchanged (the deal is 2-for-1, expressed in the caption).
    return { name: i.name, before: round2(before), after: round2(after) };
  });
}

/** First unfilled step (bogo skips the amount step). */
export function nextStep(d: PromoDraft): PromoStep {
  if (!d.scopeType) return "scope";
  if (!d.offerType) return "offer";
  if (d.offerType !== "bogo" && d.amount == null) return "amount";
  if (d.durationDays == null) return "duration";
  if (!d.caption) return "caption";
  return "review";
}

export function isComplete(d: PromoDraft): boolean {
  return nextStep(d) === "review";
}

/** A short human summary of the offer terms (computed, not LLM). */
export function offerSummary(d: PromoDraft, currency: string): string {
  switch (d.offerType) {
    case "percent_off":
      return `خصم ${d.amount}% على ${d.scopeLabel}`;
    case "amount_off":
      return `خصم ${d.amount} ${currency} على ${d.scopeLabel}`;
    case "fixed_price":
      return `${d.scopeLabel} بسعر ${d.amount} ${currency}`;
    case "bogo":
      return `اشترِ 1 واحصل على 1 — ${d.scopeLabel}`;
    default:
      return d.scopeLabel ?? "";
  }
}

/** Map a draft to the DB promotions row shape (type + config + schedule). */
export function draftToRow(d: PromoDraft): { type: string; config: Record<string, unknown>; schedule: Record<string, unknown>; name: string } {
  const typeMap: Record<PromoOfferType, string> = {
    percent_off: "percent_off",
    amount_off: "amount_off",
    fixed_price: "combo",
    bogo: "bogo",
  };
  const start = new Date();
  const end = new Date(Date.now() + (d.durationDays ?? 7) * 86400000);
  return {
    name: d.name || offerSummary(d, ""),
    type: d.offerType ? typeMap[d.offerType] : "percent_off",
    config: { scopeType: d.scopeType, scopeRef: d.scopeRef, scopeLabel: d.scopeLabel, amount: d.amount, caption: d.caption },
    schedule: { start: start.toISOString(), end: end.toISOString(), durationDays: d.durationDays },
  };
}

// --- live (customer-agent) helpers ------------------------------------------
/** A promo is shown to customers only when it is state='active' AND the current
 *  time is inside its schedule window. Paused/expired/scheduled promos never
 *  reach كريم. */
export function isPromoActiveNow(p: OperatorPromotion, now: number = Date.now()): boolean {
  if (p.state !== "active") return false;
  const s = (p.schedule ?? {}) as { start?: string; end?: string };
  const start = s.start ? Date.parse(s.start) : NaN;
  const end = s.end ? Date.parse(s.end) : NaN;
  if (!Number.isNaN(start) && now < start) return false;
  if (!Number.isNaN(end) && now > end) return false;
  return true;
}

/** Plain-Arabic one-line description of a promo's discount, from REAL row fields
 *  only (config.amount / scopeLabel / type) — never invented. */
export function promoDescription(p: OperatorPromotion, currency: string): string {
  const c = (p.config ?? {}) as { amount?: number; scopeLabel?: string };
  const scope = c.scopeLabel?.trim() ? ` على ${c.scopeLabel.trim()}` : "";
  const a = c.amount;
  if (p.type === "percent_off" && a != null) return `خصم ${a}%${scope}`;
  if (p.type === "amount_off" && a != null) return `خصم ${a} ${currency}${scope}`;
  if ((p.type === "combo" || p.type === "fixed_price") && a != null) return `${c.scopeLabel ?? ""} بسعر ${a} ${currency}`.trim();
  if (p.type === "bogo") return `اشترِ ١ واحصل على ١${scope}`;
  return p.name;
}

/** The line the AGENT is shown for one active promo — the whole truth, not just the
 *  headline.
 *
 *  `promoDescription` alone gives «خصم 15% على كل الطلبات», and that is what the customer
 *  agent was being handed. It omits two things that decide whether the customer actually
 *  gets the money off:
 *
 *    1. THE CODE. Every promo in production carries one («AHLAN15», «OPEN15»). A coded
 *       promo is redeemed, not automatic — so an agent that announces the discount and
 *       never mentions the code has told the customer something they cannot act on.
 *    2. WHETHER ANYTHING APPLIES IT. Nothing does: lib/order-pricing.ts contains no
 *       discount arithmetic at all, `orders.discount_total` is written 0 on every row,
 *       and demo order #1004 closed at full price minutes after the agent promised 15%
 *       off. Until a redemption engine exists, the agent must never imply the total it
 *       reads back is discounted.
 *
 *  Deliberately NOT solved by auto-applying these promos: they are code-gated, some are
 *  category-scoped with minimum-spend conditions, and one tenant's caption («على أول
 *  طلب») contradicts its own scopeLabel («كل الطلبات»). Applying them automatically would
 *  hand out discounts nobody qualified for — a money bug in the other direction. */
export function promoPromptLine(p: OperatorPromotion, currency: string): string {
  const parts = [promoDescription(p, currency)];
  const code = (p.code ?? "").trim();
  if (code) parts.push(`يُستخدم بكود «${code}»`);
  parts.push("غير مطبَّق تلقائياً على الإجمالي");
  return parts.join(" — ");
}

/** Real numeric amounts a promo introduces (its discount amount + every affected
 *  before/after price), so the money-truth guard recognizes them as legitimate
 *  data and never blocks كريم for quoting a real promo figure. */
export function promoKnownAmounts(p: OperatorPromotion): number[] {
  const c = (p.config ?? {}) as { amount?: number; affected?: { before?: number; after?: number }[] };
  const out: number[] = [];
  if (typeof c.amount === "number") out.push(c.amount);
  for (const a of c.affected ?? []) {
    if (typeof a.after === "number") out.push(a.after);
    if (typeof a.before === "number") out.push(a.before);
  }
  return out;
}
