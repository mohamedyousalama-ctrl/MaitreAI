// ============================================================================
// WO-CALLBACK — server-side callback_requests helpers — SERVER ONLY.
// Capture (agent path), listing (console GET), status transitions (console route),
// and the staff WhatsApp alert. Writes go through the service-role admin client;
// the staff alert reuses the existing staff_command_channel sender and is gated on
// the SAME staff_command_channel flag (§3a).
// ============================================================================
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStaffNumbers } from "@/lib/staff/command-channel";
import { sendWhatsAppText } from "@/lib/messaging/outbound";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import {
  buildStaffCallbackAlert,
  isLegalCallbackTransition,
  isValidCallbackStatus,
  type CallbackStatus,
  type PreferredWindow,
} from "@/lib/ai/callback-trigger";

export interface CallbackRow {
  id: string;
  restaurant_id: string;
  conversation_id: string | null;
  customer_phone: string;
  preferred_window: string;
  reason: string;
  status: string;
  created_at: string;
  handled_by: string | null;
  handled_at: string | null;
}

/** Persist a new callback request (status 'open'). Service-role write, tenant-scoped. */
export async function createCallbackRequest(
  admin: SupabaseClient,
  input: {
    restaurantId: string;
    conversationId: string | null;
    customerPhone: string;
    preferredWindow: PreferredWindow;
    reason: string;
  }
): Promise<{ ok: true; row: CallbackRow } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("callback_requests")
    .insert({
      restaurant_id: input.restaurantId,
      conversation_id: input.conversationId,
      customer_phone: input.customerPhone,
      preferred_window: input.preferredWindow,
      reason: input.reason,
      status: "open",
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: "insert_failed" };
  return { ok: true, row: data as CallbackRow };
}

/** Open callbacks for a tenant, newest first (console rail). */
export async function listOpenCallbacks(admin: SupabaseClient, restaurantId: string): Promise<CallbackRow[]> {
  const { data } = await admin
    .from("callback_requests")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  return (data ?? []) as CallbackRow[];
}

/**
 * Transition a callback's status (console route). Validates the transition against the
 * legal map (illegal → refused, never a half-write) and stamps handled_by/handled_at.
 * Tenant-scoped on id AND restaurant_id so one tenant can never touch another's row.
 */
export async function updateCallbackStatus(
  admin: SupabaseClient,
  input: { restaurantId: string; id: string; status: string; handledBy: string | null }
): Promise<{ ok: true; row: CallbackRow } | { ok: false; error: string; code: number }> {
  if (!isValidCallbackStatus(input.status)) return { ok: false, error: "bad_status", code: 400 };
  const { data: cur } = await admin
    .from("callback_requests")
    .select("status")
    .eq("id", input.id)
    .eq("restaurant_id", input.restaurantId)
    .maybeSingle();
  if (!cur) return { ok: false, error: "not_found", code: 404 };
  const from = (cur as { status: string }).status as CallbackStatus;
  const to = input.status as CallbackStatus;
  if (!isLegalCallbackTransition(from, to)) return { ok: false, error: "illegal_transition", code: 409 };

  const { data, error } = await admin
    .from("callback_requests")
    .update({ status: to, handled_by: input.handledBy, handled_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("restaurant_id", input.restaurantId)
    .select("*")
    .single();
  if (error) return { ok: false, error: "update_failed", code: 502 };
  return { ok: true, row: data as CallbackRow };
}

/**
 * Send the staff WhatsApp callback alert (§3a) to the tenant's staff numbers. Gated on
 * the SAME staff_command_channel flag as the rest of the staff channel — OFF → no send
 * (the request is still captured; only the WA nudge is suppressed). Best-effort: a send
 * failure never throws the capture.
 */
export async function sendStaffCallbackAlert(
  admin: SupabaseClient,
  input: {
    restaurantId: string;
    country: string | null;
    featureFlags: Record<string, unknown> | null;
    name: string | null;
    phone: string;
    window: PreferredWindow;
    reason: string;
  }
): Promise<{ sent: number; skipped: string | null }> {
  if (!isFeatureExplicitlyEnabled("staff_command_channel", input.featureFlags)) {
    return { sent: 0, skipped: "staff_channel_off" };
  }
  const text = buildStaffCallbackAlert({ name: input.name, phone: input.phone, window: input.window, reason: input.reason });
  const staff = await loadStaffNumbers(admin, input.restaurantId, input.country);
  let sent = 0;
  for (const phone of staff.keys()) {
    try {
      const r = await sendWhatsAppText({ to: phone, text });
      if (r.status === "sent" || r.status === "skipped") sent++;
    } catch {
      // best-effort — never throw the capture on a staff-alert failure
    }
  }
  return { sent, skipped: null };
}
