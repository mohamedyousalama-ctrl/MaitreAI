// ============================================================================
// MaitreAI — Item 10 (Approvals): knowledge change-request CORE (pure; no DB).
//
// Two safety boundaries live here, unit-tested in isolation:
//
//  1) THE STATE MACHINE — nextStatus(from, action). proposed→approved→applied is the
//     only apply path; apply is IDEMPOTENT (re-applying an already-applied request is a
//     no-op, never a second write); every other transition is illegal and refused.
//
//  2) THE FIELD ALLOWLIST — buildPatch(targetType, field, newValue). The ONLY
//     (target_type, field) pairs that may ever reach a truth table, each with strict
//     type/bounds coercion. Anything else is refused BEFORE any write, so a forged or
//     malformed change-request can never write an arbitrary column. The returned patch
//     is exactly the Partial<> the existing DB helper expects — no new column is
//     invented here.
//
// Pure so the route and its harness share one source of truth.
// ============================================================================

export type CrStatus = "proposed" | "approved" | "rejected" | "applied";
export type CrAction = "approve" | "reject" | "apply";
export type CrTargetType = "menu_item" | "delivery_zone" | "policy";

export const CR_TARGET_TYPES: readonly CrTargetType[] = ["menu_item", "delivery_zone", "policy"];
export const CR_ACTIONS: readonly CrAction[] = ["approve", "reject", "apply"];

export function isTargetType(v: unknown): v is CrTargetType {
  return typeof v === "string" && (CR_TARGET_TYPES as readonly string[]).includes(v);
}
export function isAction(v: unknown): v is CrAction {
  return typeof v === "string" && (CR_ACTIONS as readonly string[]).includes(v);
}

export type TransitionResult =
  | { ok: true; to: CrStatus; noop: boolean }
  | { ok: false; reason: string };

/** The state machine. The ONLY legal advances:
 *   approve: proposed → approved
 *   reject:  proposed → rejected
 *   apply:   approved → applied   (and applied → applied as an idempotent NO-OP)
 * Everything else is refused. */
export function nextStatus(from: CrStatus, action: CrAction): TransitionResult {
  switch (action) {
    case "approve":
      return from === "proposed" ? { ok: true, to: "approved", noop: false } : { ok: false, reason: `cannot approve a ${from} request` };
    case "reject":
      return from === "proposed" ? { ok: true, to: "rejected", noop: false } : { ok: false, reason: `cannot reject a ${from} request` };
    case "apply":
      if (from === "applied") return { ok: true, to: "applied", noop: true }; // idempotent — no second write
      return from === "approved" ? { ok: true, to: "applied", noop: false } : { ok: false, reason: `cannot apply a ${from} request` };
  }
}

export type PatchResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; reason: string };

// Only fields the APPLY step can write through an existing helper AND re-read to
// confirm EXACTLY are allowlisted — so buildPatch and the apply verifier stay in
// lockstep (a field that can be filed can always be verified). estimatedTime is
// deliberately excluded: the zone helper stores it as a lossy minutes conversion, so
// the written value can't be confirmed byte-for-byte (it stays a SOON edit in Knowledge).
const MENU_FIELDS = new Set(["price", "description"]);
const ZONE_FIELDS = new Set(["deliveryFee", "name", "active"]);
const POLICY_FIELDS = new Set(["refund", "cancellation", "delivery", "replacement", "payment"]);

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Validate + coerce ONE (target_type, field, newValue) into the exact Partial<> the
 * existing DB helper writes. Refuses any unknown field or wrong-typed/out-of-bounds
 * value — the allowlist is the write boundary, so nothing outside it can be applied.
 */
export function buildPatch(targetType: CrTargetType, field: string, newValue: unknown): PatchResult {
  switch (targetType) {
    case "menu_item": {
      if (!MENU_FIELDS.has(field)) return { ok: false, reason: `menu_item field not allowed: ${field}` };
      if (field === "price") {
        const n = num(newValue);
        if (n === null || n < 0 || n > 10_000_000) return { ok: false, reason: "price must be a number in [0, 10,000,000]" };
        return { ok: true, patch: { price: n } };
      }
      const s = str(newValue);
      if (s === null || s.length > 600) return { ok: false, reason: "description must be a string ≤ 600 chars" };
      return { ok: true, patch: { description: s } };
    }
    case "delivery_zone": {
      if (!ZONE_FIELDS.has(field)) return { ok: false, reason: `delivery_zone field not allowed: ${field}` };
      if (field === "deliveryFee") {
        const n = num(newValue);
        if (n === null || n < 0 || n > 1_000_000) return { ok: false, reason: "deliveryFee must be a number in [0, 1,000,000]" };
        return { ok: true, patch: { deliveryFee: n } };
      }
      if (field === "active") {
        if (typeof newValue !== "boolean") return { ok: false, reason: "active must be a boolean" };
        return { ok: true, patch: { active: newValue } };
      }
      const s = str(newValue);
      if (s === null || !s.trim() || s.length > 120) return { ok: false, reason: `${field} must be a non-empty string ≤ 120 chars` };
      return { ok: true, patch: { [field]: s.trim() } };
    }
    case "policy": {
      if (!POLICY_FIELDS.has(field)) return { ok: false, reason: `policy field not allowed: ${field}` };
      const s = str(newValue);
      if (s === null || s.length > 4000) return { ok: false, reason: "policy text must be a string ≤ 4000 chars" };
      return { ok: true, patch: { [field]: s } };
    }
  }
}
