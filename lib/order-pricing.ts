// ============================================================================
// MaitreAI — Authoritative order pricing
// SERVER ONLY. One calculator for storefront checkout and the WhatsApp Brain:
// item/variant/choice/modifier lines, delivery fee, tax snapshot, and total.
// ============================================================================

import "server-only";
import type { Branch, DeliveryArea, LocalOrderItem, MenuItem, Modifier } from "@/lib/types";
import { routeDeliveryPin, type RoutableBranch, type RoutableZone } from "./delivery/geo";

export type PricingFulfillment = "pickup" | "delivery";
export type PricingTaxMode = "inclusive" | "added" | string;

export interface PricingLineInput {
  itemId: string;
  quantity?: number;
  variantId?: string | null;
  variantName?: string | null;
  optionIds?: string[];
  choices?: { groupName: string; label: string }[];
  modifierIds?: string[];
  modifierNames?: string[];
}

export interface PricedVariant {
  name: string;
  price: number;
}

export interface PricedChoice {
  groupName: string;
  label: string;
  priceDelta: number;
}

export interface PricedModifier {
  name: string;
  priceImpact: number;
}

export interface PricedLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  variant?: PricedVariant;
  choices: PricedChoice[];
  modifiers: PricedModifier[];
  lineTotal: number;
  orderItem: LocalOrderItem;
  fingerprint: {
    i: string;
    q: number;
    v: string;
    o: string[];
    c: string[];
    m: string[];
  };
}

export interface RecomputeOrderPricingInput {
  menuItems: MenuItem[];
  modifiers: Modifier[];
  deliveryAreas: DeliveryArea[];
  lines: PricingLineInput[];
  fulfillment: PricingFulfillment;
  deliveryZoneId?: string | null;
  deliveryZoneName?: string | null;
  branchId?: string | null;
  // WO-LIVE4-F3 (geo-pin-wins) — when a delivery order carries a routed location
  // pin, the zone it geometrically falls in is authoritative over any typed area
  // name. `deliveryPin` is set ONLY when delivery_geo_routing is ON and the pin
  // matched a zone at ingestion, so its presence alone gates the precedence; a
  // pin-less input (all flag-off drafts, all typed-address orders) prices exactly
  // as before. `branches` feeds the overlap tie-break (nearest branch).
  deliveryPin?: { lat: number; lng: number } | null;
  branches?: Branch[];
  taxMode?: PricingTaxMode | null;
  taxRate?: number | null;
  currency: string;
}

export interface RecomputedOrderPricing {
  lines: PricedLine[];
  subtotal: number;
  deliveryFee: number;
  deliveryZone: DeliveryArea | null;
  taxAmount: number;
  taxRate: number;
  total: number;
  currency: string;
}

export function money(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100;
}

function norm(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function quantity(q: unknown): number {
  const n = Number(q);
  if (!Number.isFinite(n)) return 1;
  return Math.min(99, Math.max(1, Math.floor(n)));
}

function activeVariants(item: MenuItem) {
  return (item.variants ?? []).filter((v) => v.active);
}

function activeItemModifiers(item: MenuItem, modifiers: Modifier[]) {
  const allowed = new Set(item.modifierIds);
  return modifiers.filter((m) => m.active && allowed.has(m.id));
}

function resolveVariant(item: MenuItem, line: PricingLineInput): PricedVariant | undefined {
  const variants = activeVariants(item);
  if (!variants.length) {
    if (line.variantId || line.variantName) throw new Error("variant_invalid");
    return undefined;
  }
  const id = String(line.variantId ?? "").trim();
  const name = String(line.variantName ?? "").trim();
  const row = id
    ? variants.find((v) => v.id === id)
    : variants.find((v) => norm(v.name) === norm(name));
  if (!row) throw new Error(`variant_required:${item.name}`);
  return { name: row.name, price: Number(row.price) };
}

function resolveChoices(item: MenuItem, line: PricingLineInput): PricedChoice[] {
  const optionIds = new Set((line.optionIds ?? []).map((id) => String(id).trim()).filter(Boolean));
  const namedChoices = [...(line.choices ?? [])];
  const choices: PricedChoice[] = [];

  for (const group of (item.choiceGroups ?? []).filter((g) => g.options.some((o) => o.active))) {
    const byId = group.options.filter((o) => o.active && optionIds.has(o.id));
    const byName = namedChoices
      .filter((c) => norm(c.groupName) === norm(group.name))
      .map((c) => group.options.find((o) => o.active && norm(o.label) === norm(c.label)))
      .filter((o): o is NonNullable<typeof o> => !!o);
    const selected = [...new Map([...byId, ...byName].map((o) => [o.id, o])).values()];
    if (selected.length < group.minSelect || selected.length > group.maxSelect) {
      throw new Error(`choice_count_invalid:${item.name}:${group.name}`);
    }
    for (const option of selected) {
      choices.push({ groupName: group.name, label: option.label, priceDelta: Number(option.priceDelta) });
    }
  }

  const validOptionIds = new Set((item.choiceGroups ?? []).flatMap((g) => g.options.filter((o) => o.active).map((o) => o.id)));
  for (const id of optionIds) if (!validOptionIds.has(id)) throw new Error(`choice_invalid:${item.name}:${id}`);
  for (const choice of namedChoices) {
    const group = item.choiceGroups?.find((g) => norm(g.name) === norm(choice.groupName));
    const option = group?.options.find((o) => o.active && norm(o.label) === norm(choice.label));
    if (!group || !option) throw new Error(`choice_invalid:${item.name}:${choice.groupName}:${choice.label}`);
  }
  return choices;
}

function resolveModifiers(item: MenuItem, modifiers: Modifier[], line: PricingLineInput): PricedModifier[] {
  const allowed = activeItemModifiers(item, modifiers);
  const ids = new Set((line.modifierIds ?? []).map((id) => String(id).trim()).filter(Boolean));
  const names = (line.modifierNames ?? []).map((name) => String(name).trim()).filter(Boolean);
  const selected = [
    ...allowed.filter((m) => ids.has(m.id)),
    ...names.map((name) => {
      const row = allowed.find((m) => norm(m.name) === norm(name));
      if (!row) throw new Error(`modifier_invalid:${item.name}:${name}`);
      return row;
    }),
  ];
  return [...new Map(selected.map((m) => [m.id, m])).values()].map((m) => ({
    name: m.name,
    priceImpact: Number(m.priceImpact),
  }));
}

/** WO-LIVE4-F3 (geo-pin-wins): the delivery zone a routed pin geometrically falls
 *  in, or null when the pin lies outside every routable zone. PURE — reuses the geo
 *  core (routeDeliveryPin) so the match rule is identical to pin ingestion. This
 *  only picks WHICH zone; the fee is still copied off that zone's row (money law). */
function pinZone(
  pin: { lat: number; lng: number },
  areas: DeliveryArea[],
  branches: Branch[]
): DeliveryArea | null {
  const zones: RoutableZone[] = areas.map((a) => ({
    id: a.id,
    name: a.name,
    branchId: a.branchId,
    centerLat: a.centerLat,
    centerLng: a.centerLng,
    radiusKm: a.radiusKm,
    active: a.active,
  }));
  const routableBranches: RoutableBranch[] = branches.map((b) => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng }));
  const route = routeDeliveryPin(pin, zones, routableBranches);
  if (route.kind === "outside") return null;
  return areas.find((a) => a.id === route.zone.id) ?? null;
}

function resolveDeliveryZone(args: RecomputeOrderPricingInput, subtotal: number): DeliveryArea | null {
  if (args.fulfillment !== "delivery") return null;

  // WO-LIVE4-F3 (geo-pin-wins) — a routed pin's geometry is authoritative over any
  // typed area name the model supplied (live #1004: pin fell in «الجيزه كلها» fee 30,
  // yet the text name «العشرين» priced the order at 41). `deliveryPin` is present ONLY
  // for a flag-ON, matched pin, so this branch never runs for pin-less drafts →
  // flag-off pricing is byte-identical. A pin that now falls outside every zone (a
  // zone edited/deactivated mid-order) falls through to the id/name resolution below.
  if (args.deliveryPin) {
    const zone = pinZone(args.deliveryPin, args.deliveryAreas, args.branches ?? []);
    if (zone) {
      if (subtotal < Number(zone.minOrder)) throw new Error(`delivery_min_order:${zone.name}`);
      return zone;
    }
  }

  const zoneId = String(args.deliveryZoneId ?? "").trim();
  const zoneName = String(args.deliveryZoneName ?? "").trim();
  const branchId = String(args.branchId ?? "").trim();
  const zone = zoneId
    ? args.deliveryAreas.find((z) => z.active && z.id === zoneId)
    : args.deliveryAreas.find((z) => z.active && norm(z.name) === norm(zoneName)) ??
      args.deliveryAreas.find((z) => z.active && zoneName && (norm(z.name).includes(norm(zoneName)) || norm(zoneName).includes(norm(z.name))));
  if (!zone) throw new Error(`delivery_zone_invalid:${zoneName || zoneId}`);
  if (zone.branchId && branchId && zone.branchId !== branchId) throw new Error(`delivery_zone_branch_mismatch:${zone.name}`);
  if (subtotal < Number(zone.minOrder)) throw new Error(`delivery_min_order:${zone.name}`);
  return zone;
}

// WO-VAT-1: the VAT base is subtotal + deliveryFee. A delivery charge the
// restaurant bills the customer is part of the taxable supply under KSA VAT, so
// it bears the rate too (the pass-through exemption fits agency arrangements we
// don't have). delivery taxable per PM ruling 5 Jul — tenant accountant may
// confirm at onboarding. EG tenants (rate 0) are unaffected.
function computeTax(base: number, taxMode: PricingTaxMode | null | undefined, rawRate: number | null | undefined) {
  const rate = Number(rawRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return { taxAmount: 0, taxRate: 0 };
  if (taxMode === "added") return { taxAmount: money(base * (rate / 100)), taxRate: rate };
  return { taxAmount: money(base * (rate / (100 + rate))), taxRate: rate };
}

export function recomputeOrderPricing(args: RecomputeOrderPricingInput): RecomputedOrderPricing {
  const lines = args.lines.map((line, index): PricedLine => {
    const item = args.menuItems.find((row) => row.id === line.itemId);
    if (!item) throw new Error(`menu_item_missing:${line.itemId}`);
    if (!item.available) throw new Error(`menu_item_unavailable:${item.name}`);
    const q = quantity(line.quantity);
    const variant = resolveVariant(item, line);
    const choices = resolveChoices(item, line);
    const selectedModifiers = resolveModifiers(item, args.modifiers, line);
    const unitPrice = money(
      Number(variant?.price ?? item.price) +
        choices.reduce((sum, choice) => sum + Number(choice.priceDelta), 0) +
        selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.priceImpact), 0)
    );
    const lineTotal = money(unitPrice * q);
    const choiceLabels = choices.map((c) => `${c.groupName}: ${c.label}`);
    const modifierLabels = selectedModifiers.map((m) => m.name);
    return {
      itemId: item.id,
      name: item.name,
      quantity: q,
      unitPrice,
      variant,
      choices,
      modifiers: selectedModifiers,
      lineTotal,
      orderItem: {
        id: `${item.id}-${index}`,
        menuItemId: item.id,
        name: item.name,
        quantity: q,
        unitPrice,
        variant: variant?.name,
        choices: choiceLabels,
        modifiers: modifierLabels,
        total: lineTotal,
      },
      fingerprint: {
        i: item.id,
        q,
        v: String(line.variantId ?? variant?.name ?? ""),
        o: [...new Set((line.optionIds ?? []).map(String))].sort(),
        c: choices.map((c) => `${c.groupName}:${c.label}`).sort(),
        m: [...new Set([...(line.modifierIds ?? []).map(String), ...modifierLabels])].sort(),
      },
    };
  });
  const subtotal = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const deliveryZone = resolveDeliveryZone(args, subtotal);
  const deliveryFee = args.fulfillment === "delivery" && deliveryZone ? money(deliveryZone.deliveryFee) : 0;
  // WO-VAT-1: delivery is part of the taxable supply → the VAT base includes it.
  const taxBase = money(subtotal + deliveryFee);
  const { taxAmount, taxRate } = computeTax(taxBase, args.taxMode, args.taxRate);
  const total =
    args.taxMode === "added"
      ? money(subtotal + deliveryFee + taxAmount)
      : money(subtotal + deliveryFee);
  return { lines, subtotal, deliveryFee, deliveryZone, taxAmount, taxRate, total, currency: args.currency };
}
