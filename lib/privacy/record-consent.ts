// ============================================================================
// Kivo (KSA) — PDPL consent WRITER (server). The single tenant-scoped write that
// stamps a customer's consent flag + provenance (source + timestamp). Shared by
// the operator route (source='operator') and, later, the conversational capture
// path (source='conversation'). Audit is the CALLER's responsibility (the
// operator route records an audit_events row) so this stays a pure data write.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentKind, ConsentSource } from "@/lib/privacy/consent";

export interface RecordConsentArgs {
  restaurantId: string;
  customerId: string;
  kind: ConsentKind;
  granted: boolean;
  source: ConsentSource;
  /** Injected only to keep the write testable; defaults to now. */
  nowIso?: string;
}

/**
 * Write one consent flag + its provenance, EXPLICITLY scoped to (customer_id,
 * restaurant_id). Returns {ok} — never throws on a normal DB error (best-effort
 * for the conversational path; the operator route surfaces failures via its own
 * error handling). `granted=false` records a withdrawal (flag false) while
 * keeping the provenance of WHEN/HOW it was last changed.
 */
export async function recordConsent(
  admin: SupabaseClient,
  args: RecordConsentArgs,
): Promise<{ ok: boolean; error?: string }> {
  const at = args.nowIso ?? new Date().toISOString();
  const patch: Record<string, unknown> =
    args.kind === "marketing"
      ? { consent_marketing: args.granted, consent_marketing_at: at, consent_marketing_source: args.source }
      : { consent_health_notes: args.granted, consent_health_notes_at: at, consent_health_notes_source: args.source };

  const { error } = await admin
    .from("customers")
    .update(patch)
    .eq("id", args.customerId)
    .eq("restaurant_id", args.restaurantId);

  return error ? { ok: false, error: error.message } : { ok: true };
}
