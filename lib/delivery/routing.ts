// ============================================================================
// MaitreAI — WO-DELIVERY-D1: apply pin→zone routing to an order draft (spec §2).
//
// Pure glue between the geo core (lib/delivery/geo.ts) and the agent draft. It maps
// the app-facing DeliveryArea/Branch onto the router's RoutableZone/RoutableBranch,
// decides the outcome, and produces (a) the deterministic draft mutation and (b) the
// Arabic DIRECTIVE the model must relay. NO LLM math: the delivery fee is copied
// straight off the matched zone's data (money law — engine, never model).
//
// No I/O, no server-only imports → unit-testable in isolation.
// ============================================================================

import type { DeliveryArea, Branch } from "@/lib/types";
import type { OrderDraft } from "@/lib/ai/tools";
import { routeDeliveryPin, type LatLng, type RoutableZone, type RoutableBranch } from "./geo";

export interface InboundPin {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

function toRoutableZone(a: DeliveryArea): RoutableZone {
  return {
    id: a.id,
    name: a.name,
    branchId: a.branchId,
    centerLat: a.centerLat,
    centerLng: a.centerLng,
    radiusKm: a.radiusKm,
    active: a.active,
  };
}
function toRoutableBranch(b: Branch): RoutableBranch {
  return { id: b.id, name: b.name, lat: b.lat, lng: b.lng };
}

/** A human, PII-free label for a pin's address on the order (finalize needs an
 *  address for delivery; the pin IS the address). Prefers the pin's own label. */
export function pinAddressLabel(pin: InboundPin): string {
  const parts = [pin.name, pin.address].filter((s): s is string => !!s && s.trim().length > 0);
  if (parts.length) return `📍 ${parts.join(" — ")}`;
  return `📍 موقع محدد على الخريطة (${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)})`;
}

export type PinRoutingOutcome =
  | {
      kind: "matched";
      draft: OrderDraft;
      zoneName: string;
      branchId: string | null;
      branchName: string | null;
      deliveryFee: number;
      via: "single" | "nearest_branch";
      /** Directive the model MUST relay: confirm the zone/branch + fee, then proceed. */
      directive: string;
    }
  | {
      kind: "outside";
      /** The unchanged draft (no zone applied). */
      draft: OrderDraft;
      /** Soft message the model MUST relay verbatim (spec §2 — never a hard reject). */
      directive: string;
      /** zone_miss insight row payload (logged by the caller). */
      miss: { pinLat: number; pinLng: number; nearestZoneId: string | null; nearestDistanceKm: number | null };
    };

/**
 * Decide + apply routing for an inbound delivery pin. Returns a NEW draft (the input
 * is never mutated) plus the directive/insight the caller wires up. The exact soft
 * message for the outside case is the spec's ratified wording.
 */
export function applyPinRouting(
  pin: InboundPin,
  draft: OrderDraft,
  areas: DeliveryArea[],
  branches: Branch[]
): PinRoutingOutcome {
  const route = routeDeliveryPin(
    { lat: pin.lat, lng: pin.lng } as LatLng,
    areas.map(toRoutableZone),
    branches.map(toRoutableBranch)
  );

  if (route.kind === "outside") {
    return {
      kind: "outside",
      draft,
      directive:
        "التوجيه (لازم): موقع العميل خارج كل مناطق التوصيل. ابعتله بالنص ده بالظبط بدون أي تعديل ولا أرقام: " +
        "«للأسف موقعك خارج نطاق التوصيل حالياً 🙏 تقدر تستلم من أقرب فرع؟» ثم اعرض عليه الاستلام من الفرع (اسأله أي فرع أقرب له واعرض الفروع). متأكدش على أي منطقة أو رسوم توصيل.",
      miss: {
        pinLat: pin.lat,
        pinLng: pin.lng,
        nearestZoneId: route.nearestZoneId,
        nearestDistanceKm: route.nearestDistanceKm,
      },
    };
  }

  // Matched — apply deterministically. Fee comes from the zone's data (money law).
  const zone = areas.find((a) => a.id === route.zone.id);
  const branch = route.branchId ? branches.find((b) => b.id === route.branchId) : undefined;
  const fee = zone ? zone.deliveryFee : 0;
  const next: OrderDraft = {
    ...draft,
    fulfillment: "delivery",
    deliveryZone: route.zone.name,
    deliveryFee: fee,
    address: pinAddressLabel(pin),
    branchId: route.branchId,
    deliveryPin: { lat: pin.lat, lng: pin.lng },
  };
  const branchLine = branch ? ` فرع ${branch.name}` : "";
  return {
    kind: "matched",
    draft: next,
    zoneName: route.zone.name,
    branchId: route.branchId,
    branchName: branch?.name ?? null,
    deliveryFee: fee,
    via: route.via,
    directive:
      `التوجيه (لازم): موقع العميل اتحدد داخل منطقة «${route.zone.name}»${branchLine}. ` +
      `تم ضبط التوصيل ورسومه تلقائياً من بيانات المنطقة (متحسبش أنت أي رسوم). ` +
      `أكّد للعميل المنطقة${branchLine ? " والفرع" : ""} باختصار وكمّل الطلب (اعرض الملخص والتأكيد). متطلبش منه عنوان مكتوب.`,
  };
}
