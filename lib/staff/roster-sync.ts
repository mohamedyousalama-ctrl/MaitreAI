// ============================================================================
// MaitreAI — WO-MANAGER-RECOGNITION: staff-roster sync (SERVER ONLY).
// Mohamed's note 45: a MANAGER added in Settings/Team is auto-recognized on the
// staff command/status channel — their WhatsApp number becomes a staff command
// number so الحالة / وقف / 86 work from their phone without separate registration.
//
// This module owns ONLY the roster membership sync. The command grammar + the
// HARD LINE (a roster number is parsed ONLY for the known commands; any non-command
// gets a bounded reply and NEVER reaches runCustomerTurn / the customer Brain) are
// already enforced in lib/staff/command-channel.ts + the webhook router — this file
// does not touch that path; it only decides WHO is on the roster.
//
// Storage: the existing staff_numbers table (0062) — its natural home. member_id is
// the OPTIONAL audit link; wa_phone is the canonical number; unique(restaurant_id,
// wa_phone). No members migration, no new column.
//
// Flag-gated by the CALLER on `manager_command_recognition` (default OFF); enabling
// per prod tenant is propose→GO.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/messaging/phone";

export interface SyncManagerArgs {
  restaurantId: string;
  /** The member row id (audit-attribution link on staff_numbers.member_id). */
  memberId: string;
  /** The manager's WhatsApp number as entered in Settings/Team. */
  phone: string;
  /** Tenant country (restaurants.country) for E.164 normalization. */
  country: string | null;
  label?: string;
}

export type RosterSyncResult =
  | { ok: true; wa_phone: string }
  | { ok: false; reason: "no_phone" | "db_error" };

/**
 * Add (or reactivate + relink) a manager's number on the tenant's staff command
 * roster. Upsert on unique(restaurant_id, wa_phone): a fresh number is inserted;
 * an already-registered number is reactivated and linked to this member for audit.
 * Only the provided columns are written — pending_command/pending_at are untouched.
 * Idempotent. Returns no_phone when the number normalizes to empty (nothing written).
 */
export async function syncManagerToRoster(
  admin: SupabaseClient,
  args: SyncManagerArgs
): Promise<RosterSyncResult> {
  const wa = normalizePhone(args.phone ?? "", args.country);
  if (!wa) return { ok: false, reason: "no_phone" };
  const { error } = await admin
    .from("staff_numbers")
    .upsert(
      {
        restaurant_id: args.restaurantId,
        member_id: args.memberId,
        wa_phone: wa,
        active: true,
        label: args.label ?? "manager",
      },
      { onConflict: "restaurant_id,wa_phone" }
    );
  if (error) return { ok: false, reason: "db_error" };
  return { ok: true, wa_phone: wa };
}

/**
 * Remove a member from the roster by DEACTIVATING their entries (active=false) —
 * not deleting — so the audit trail survives. Scoped to the tenant + member.
 *
 * READY-TO-WIRE: nothing calls this yet. It is the hook for a manager→operation
 * DOWNGRADE or a member REMOVAL. Those endpoints do not exist today (the only team
 * surface is team/invite); they are scoped to a follow-up **WO-MEMBER-LIFECYCLE**
 * (PATCH role + DELETE member, with the last-manager guard + audit + RLS). Until
 * that ships, a downgraded manager stays on the roster — an acceptable V1 gap ONLY
 * because enabling manager_command_recognition is per-tenant propose→GO and rosters
 * are small and operator-visible. WO-MEMBER-LIFECYCLE MUST call this on downgrade
 * and on removal.
 */
export async function removeMemberFromRoster(
  admin: SupabaseClient,
  args: { restaurantId: string; memberId: string }
): Promise<{ ok: boolean }> {
  const { error } = await admin
    .from("staff_numbers")
    .update({ active: false })
    .eq("restaurant_id", args.restaurantId)
    .eq("member_id", args.memberId);
  return { ok: !error };
}
