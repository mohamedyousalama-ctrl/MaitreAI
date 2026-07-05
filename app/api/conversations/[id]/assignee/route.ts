// ============================================================================
// MaitreAI — conversation named-ownership claim (MO1 + MO2) — SERVER ONLY.
//
// MO1 stamped WHICH member owns a conversation. MO2 makes the takeover an ATOMIC
// CLAIM: the write is a SINGLE conditional UPDATE whose WHERE carries the
// precondition (optimistic concurrency), so two operators racing to take the same
// conversation in the same instant can't both win — exactly one row is updated,
// the loser gets 0 rows and is told «{name} تولّاها بالفعل» instead of silently
// stealing ownership. Mirrors conversation_locks' INSERT…ON CONFLICT atomicity.
//
// The acting member is resolved AUTHORITATIVELY from the session (getServerTenant →
// that user's members row for THIS restaurant) — NEVER from a client-supplied id.
// The write runs through the service-role admin client, scoped to the authorized
// restaurant_id + conversation id.
//
// State machine: the claim's WHERE restricts to the LEGAL predecessors of
// HUMAN_ACTIVE per lib/db/ownership.ts (AI_ACTIVE, HUMAN_IDLE, SYSTEM_HOLD) — the
// transition map is unchanged, the DB just enforces it inline. is_safety_hold is
// deliberately NOT touched: a SYSTEM_HOLD can be taken over (as today) but the hold
// flag persists — it can't be "claimed-around"; only a deliberate return-to-Karim
// clears it.
// ============================================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/db/audit";

export const runtime = "nodejs";

const FALLBACK = "موظف";

// Legal predecessors of HUMAN_ACTIVE (lib/db/ownership.ts LEGAL_TRANSITIONS).
const CLAIMABLE_FROM = ["AI_ACTIVE", "HUMAN_IDLE", "SYSTEM_HOLD"] as const;

/** Resolve a member's display name from the auth user (members has no name column). */
async function resolveMemberName(admin: SupabaseClient, memberId: string): Promise<string> {
  const { data: m } = await admin.from("members").select("user_id").eq("id", memberId).maybeSingle();
  const userId = (m as { user_id?: string } | null)?.user_id;
  if (!userId) return FALLBACK;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.name === "string" ? meta.name.trim() : "";
    const email = data.user?.email ?? "";
    return name || (email ? email.split("@")[0] : "") || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  if (action !== "claim" && action !== "release") {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  // ── release: clear named ownership (return-to-Karim / close). Not the contended
  // race; a plain tenant-scoped clear is sufficient. ──────────────────────────────
  if (action === "release") {
    const { error } = await admin
      .from("conversations")
      .update({ assigned_member_id: null })
      .eq("id", params.id)
      .eq("restaurant_id", tenant.restaurantId);
    if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });
    // MO4 — audit the deliberate release. `reason` distinguishes return-to-Karim
    // vs close (the ownership_state flip itself happens on the browser spine path).
    const reason = String(body.reason ?? "");
    if (reason === "returned" || reason === "closed") {
      await recordAuditEvent(admin, {
        restaurantId: tenant.restaurantId,
        userId: tenant.userId,
        role: tenant.role,
        action: reason === "closed" ? "conversation_closed" : "conversation_returned",
        entityType: "conversation",
        entityId: params.id,
      });
    }
    return NextResponse.json({ ok: true, assignedMemberId: null });
  }

  // ── claim: resolve the acting member from the session (never client input). ──────
  const { data: member } = await admin
    .from("members")
    .select("id")
    .eq("user_id", tenant.userId)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  const me = (member as { id: string }).id;

  // ATOMIC CLAIM — a single conditional UPDATE. The precondition lives in the WHERE
  // (no separate SELECT-then-UPDATE), so the DB serializes concurrent claims:
  //   id = :id AND restaurant_id = :rid
  //   AND ownership_state IN ('AI_ACTIVE','HUMAN_IDLE','SYSTEM_HOLD')  -- legal & claimable
  //   AND (assigned_member_id IS NULL OR assigned_member_id = :me)     -- not already someone else's
  // 1 row → we won; 0 rows → lost the race / not claimable.
  const { data: claimed, error: claimErr } = await admin
    .from("conversations")
    .update({ assigned_member_id: me, ownership_state: "HUMAN_ACTIVE", owner: "human", status: "تم التحويل لموظف" })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .in("ownership_state", CLAIMABLE_FROM as unknown as string[])
    .or(`assigned_member_id.is.null,assigned_member_id.eq.${me}`)
    .select("id");
  if (claimErr) return NextResponse.json({ error: "update_failed" }, { status: 502 });

  if (claimed && claimed.length === 1) {
    // MO4 — audit the takeover (actor = the server-resolved acting member).
    await recordAuditEvent(admin, {
      restaurantId: tenant.restaurantId,
      userId: tenant.userId,
      role: tenant.role,
      memberId: me,
      action: "conversation_claimed",
      entityType: "conversation",
      entityId: params.id,
    });
    return NextResponse.json({ ok: true, assignedMemberId: me });
  }

  // 0 rows — find out why: already owned (by me = idempotent, or by someone else =
  // lost race), or not in a claimable state (e.g. CLOSED).
  const { data: cur } = await admin
    .from("conversations")
    .select("assigned_member_id, ownership_state")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ownerId = (cur as { assigned_member_id: string | null }).assigned_member_id;

  // Idempotent: I already own it → treat as success (e.g. double-click).
  if (ownerId && ownerId === me) {
    return NextResponse.json({ ok: true, assignedMemberId: me });
  }

  // Lost the race to another member → tell the loser who owns it (no overwrite).
  if (ownerId) {
    const ownerName = await resolveMemberName(admin, ownerId);
    return NextResponse.json({ error: "already_claimed", ownerId, ownerName }, { status: 409 });
  }

  // Unowned but not claimable (e.g. CLOSED) — surface generically; the client refreshes.
  return NextResponse.json({ error: "already_claimed" }, { status: 409 });
}
