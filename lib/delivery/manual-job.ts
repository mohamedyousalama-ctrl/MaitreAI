// ============================================================================
// Kivo Delivery Network — Day 1: manual delivery-job input core (PURE, no I/O).
//
// Tonight's field loop starts with the OPERATOR typing a job by hand (there is no
// upstream WhatsApp/storefront order). This module owns the input contract for
// that one action and nothing else:
//   • customer phone           — required, normalized to a sendable WhatsApp number
//   • destination              — an address line and/or a map pin (lat/lng)
//   • COD                      — optional; absent/0 means "nothing to collect"
//   • reference/note           — optional free text shown to the driver
//
// It is deliberately PURE so the rules are unit-testable without a database, and
// so the API route and the service layer share ONE definition of "valid job".
// Persistence lives in lib/db/delivery-job.ts.
// ============================================================================

import { isValidLat, isValidLng } from "./geo";

/** Raw, operator-typed job input (all fields arrive as untrusted strings/JSON). */
export interface ManualJobInput {
  customerPhone?: unknown;
  customerName?: unknown;
  address?: unknown;
  lat?: unknown;
  lng?: unknown;
  codAmount?: unknown;
  reference?: unknown;
}

/** A validated job, ready to persist. */
export interface NormalizedManualJob {
  /** E.164-ish digits from normalizePhone — never the raw typed string. */
  customerPhone: string;
  customerName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** null = no cash to collect (prepaid / already settled). */
  codAmount: number | null;
  reference: string | null;
}

export type ManualJobError =
  | "phone_required"
  | "phone_invalid"
  | "destination_required"
  | "bad_coords"
  | "bad_amount";

export type ManualJobValidation =
  | { ok: true; job: NormalizedManualJob }
  | { ok: false; error: ManualJobError };

/** Upper bound on a single COD amount — a typo guard, not a business rule. */
export const MAX_COD_AMOUNT = 100_000;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Validate + normalize one operator-typed delivery job.
 *
 * `normalize` is injected (rather than imported) so this module stays pure and the
 * caller supplies the tenant's country rule — lib/messaging/phone.normalizePhone
 * returns "" for an unmatched shape, which we surface as `phone_invalid` at entry
 * instead of storing a send-doomed number.
 *
 * DESTINATION RULE: a driver must be able to actually go somewhere, so we require
 * an address line OR a complete pin. A half pin (lat without lng, or a coordinate
 * out of range) is a hard reject — silently dropping it would strand the driver
 * with a map button that points nowhere.
 */
export function validateManualJob(
  input: ManualJobInput,
  normalize: (raw: string) => string
): ManualJobValidation {
  const rawPhone = text(input.customerPhone);
  if (!rawPhone) return { ok: false, error: "phone_required" };
  const customerPhone = normalize(rawPhone);
  if (!customerPhone) return { ok: false, error: "phone_invalid" };

  // Coordinates: both or neither, and each in range.
  const hasLat = input.lat !== null && input.lat !== undefined && input.lat !== "";
  const hasLng = input.lng !== null && input.lng !== undefined && input.lng !== "";
  let lat: number | null = null;
  let lng: number | null = null;
  if (hasLat !== hasLng) return { ok: false, error: "bad_coords" };
  if (hasLat && hasLng) {
    const nLat = Number(input.lat);
    const nLng = Number(input.lng);
    if (!isValidLat(nLat) || !isValidLng(nLng)) return { ok: false, error: "bad_coords" };
    lat = nLat;
    lng = nLng;
  }

  const address = text(input.address) || null;
  if (!address && lat === null) return { ok: false, error: "destination_required" };

  // COD: absent/empty/0 → null ("nothing to collect"). Anything present must be a
  // finite, non-negative, sane number — a bad amount is rejected, never coerced,
  // because this value becomes the cash the driver is accountable for.
  let codAmount: number | null = null;
  const rawCod = input.codAmount;
  if (rawCod !== null && rawCod !== undefined && rawCod !== "") {
    const n = Number(rawCod);
    if (!Number.isFinite(n) || n < 0 || n > MAX_COD_AMOUNT) return { ok: false, error: "bad_amount" };
    codAmount = n > 0 ? Math.round(n * 100) / 100 : null;
  }

  return {
    ok: true,
    job: {
      customerPhone,
      customerName: text(input.customerName) || null,
      address,
      lat,
      lng,
      codAmount,
      reference: text(input.reference) || null,
    },
  };
}
