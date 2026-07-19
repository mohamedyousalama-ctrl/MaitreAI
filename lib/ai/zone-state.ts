// ============================================================================
// WO-STATE-TRUTH (PART A) — the persisted delivery-zone SELECTION.
//
// Production bug (DB-proven): a zone-ambiguous written address made
// set_delivery_address (address_flow_v2) emit an address_zone_ambiguous question.
// The customer's NEXT reply picked one of the offered candidate zones
// («المطبعة محولات» → «المطبعة والمحولات هرم»), the recap even priced its fee (38),
// but the CHOSEN ZONE was never persisted onto the draft. So the ambiguity
// re-detected every later turn, the stale question re-asked, and finalize
// re-validated the RAW address text (no zone) → «مش ضمن مناطق التوصيل», contradicting
// the recap that had already quoted the fee.
//
// This module is the deterministic zone-truth. The offered candidates are
// RE-DERIVED from the (persisted) address — no cross-turn candidate state is needed —
// and the reply is matched against ONLY those candidates. On a single confident pick
// it persists {zoneId, zoneName, deliveryFee} onto the draft. Once persisted,
// ambiguity detection stays silent and finalize validates against the persisted zone
// instead of re-matching raw text; changing the address text clears it.
//
// Pure, deterministic string/geometry ops — no model calls. The draft field is
// additive + optional: a draft that never selects a zone has no `zone` key and
// serializes byte-identically (no schema change).
// ============================================================================

import type { DeliveryArea } from "../types";
import type { OrderDraft } from "./tools";
import { matchAddressToZones } from "../delivery/address";

export interface PersistedZone {
  zoneId: string | null;
  zoneName: string;
  deliveryFee: number;
}

/** True when the draft carries a confidently-selected (persisted) delivery zone. */
export function hasPersistedZone(draft: OrderDraft): boolean {
  return (
    !!draft.zone &&
    typeof draft.zone.zoneName === "string" &&
    draft.zone.zoneName.trim().length > 0
  );
}

/** Persist a confidently-resolved zone as the draft's zone-of-truth AND mirror it onto
 *  the legacy deliveryZone/deliveryFee fields the pricer already reads. */
export function persistZoneToDraft(draft: OrderDraft, zone: DeliveryArea): void {
  const fee = Number(zone.deliveryFee) || 0;
  draft.zone = { zoneId: zone.id ?? null, zoneName: zone.name, deliveryFee: fee };
  draft.deliveryZone = zone.name;
  draft.deliveryFee = fee;
}

/** Clear the persisted zone (address text changed / fulfillment reset). Deletes the key
 *  so a draft that never carried a zone serializes byte-identically (no `"zone":null`). */
export function clearPersistedZone(draft: OrderDraft): void {
  if ("zone" in draft) delete (draft as { zone?: unknown }).zone;
}

/** Given the customer's reply and the address that produced a pending ambiguity, return
 *  the single offered candidate zone the reply confidently selects — or null when the
 *  reply is a non-answer (matches several of, or none of, the offered candidates).
 *
 *  The candidate set is RE-DERIVED from the stored address, so this stays purely a
 *  function of persisted state. The reply is matched against ONLY those candidates
 *  (never the full zone list), so a stray token can never resolve to an un-offered zone. */
export function selectZoneFromReply(
  reply: string,
  storedAddress: string,
  zones: DeliveryArea[]
): DeliveryArea | null {
  if (!reply.trim() || !storedAddress.trim()) return null;
  const ambiguity = matchAddressToZones(storedAddress, zones);
  if (ambiguity.kind !== "ambiguous") return null;
  const candidateZones = ambiguity.candidates.map((c) => c.zone);
  const pick = matchAddressToZones(reply, candidateZones);
  return pick.kind === "unique" ? pick.zone : null;
}
