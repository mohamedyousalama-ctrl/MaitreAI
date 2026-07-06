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

  const { data, error } = await admin
    .from("customers")
    .update(patch)
    .eq("id", args.customerId)
    .eq("restaurant_id", args.restaurantId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  // A stale / deleted / cross-tenant id matches zero rows WITHOUT a DB error —
  // treat that as a failure so the API + audit trail never report a lawful-basis
  // change that didn't happen.
  if (!data || data.length === 0) return { ok: false, error: "customer_not_found" };

  // WITHDRAWAL is immediate: revoking health-notes consent must also SCRUB any
  // health content already persisted to memory (operator-visible via customer-
  // memory), not wait for the next rebuild. Best-effort — the consent write is
  // the source of truth and has already succeeded.
  if (args.kind === "health_notes" && args.granted === false) {
    const { data: mem } = await admin
      .from("customer_memory")
      .select("inferred")
      .eq("restaurant_id", args.restaurantId)
      .eq("customer_id", args.customerId)
      .maybeSingle();
    const inferred = (mem?.inferred as Record<string, unknown> | null) ?? null;
    if (inferred && Array.isArray(inferred.allergy_notes) && inferred.allergy_notes.length > 0) {
      await admin
        .from("customer_memory")
        .update({ inferred: { ...inferred, allergy_notes: [] } })
        .eq("restaurant_id", args.restaurantId)
        .eq("customer_id", args.customerId);
    }
  }

  return { ok: true };
}
