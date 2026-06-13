// ============================================================================
// MaitreAI — In-chat promotion builder engine (Phase 1, §T forward) — pure logic
// The discount/price math is computed HERE (the "tool") — never written by the
// LLM. The Admin Agent only routes + drafts caption VOICE. A draft is filled one
// field at a time (deterministic chips = $0); the affected before/after prices
// are always recomputed from the live menu. Client-safe (no server-only).
// ============================================================================

import type { MenuItem } from "@/lib/types";

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
