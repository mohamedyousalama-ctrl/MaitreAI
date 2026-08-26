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
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { ClaimActorError, ClaimLostError, claimConversation, type ControlMode } from "@/lib/console/conversation-control";

export const runtime = "nodejs";

const FALLBACK = "موظف";

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
    try {
      await mustWrite<{ id: string }>(
        admin
          .from("conversations")
          .update({ assigned_member_id: null })
          .eq("id", params.id)
          .eq("restaurant_id", tenant.restaurantId)
          .select("id"),
        "conversations.assignee.release",
        { exactRows: 1 },
      );
    } catch (error) {
      if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ error: "update_failed" }, { status: 502 });
    }
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

  // Idempotent already-mine check first: control_claim intentionally excludes
  // HUMAN_ACTIVE so normal send-on-owned does not create duplicate claim events.
  const { data: cur } = await admin
    .from("conversations")
    .select("assigned_member_id, ownership_state, control_epoch")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const current = cur as { assigned_member_id: string | null; ownership_state: string | null; control_epoch?: number | string | null };
  const ownerId = current.assigned_member_id;

  // Idempotent: I already own it → treat as success (e.g. double-click).
  if (ownerId === me && current.ownership_state === "HUMAN_ACTIVE") {
    return NextResponse.json({ ok: true, assignedMemberId: me, ownershipState: "HUMAN_ACTIVE", controlEpoch: Number(current.control_epoch ?? 0) });
  }

  // ATOMIC CLAIM — migration 0108's kv_control_claim performs the ownership
  // transition, bumps control_epoch, and lets the DB trigger append the assignment
  // event. No ownership column is written directly in this claim path.
  //
  // It runs through the caller's own session: the acting member is resolved from the
  // JWT subject, and EXECUTE is granted to `authenticated` only. `admin` stays for
  // the reads above and the auth.admin name lookup below.
  //
  // `current` is passed so the pure canClaim guard runs before the RPC —
  // kv_control_claim, unlike the control_claim it replaced, does not itself refuse a
  // teammate-owned HUMAN_IDLE or SYSTEM_HOLD row.
  const asUser = createUserClient();
  if (!asUser) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  try {
    const result = await claimConversation(asUser, {
      conversationId: params.id,
      restaurantId: tenant.restaurantId,
      memberId: me,
      current: {
        ownershipState: (current.ownership_state as ControlMode | null) ?? null,
        assignedMemberId: current.assigned_member_id,
      },
    });
    return NextResponse.json({ ok: true, assignedMemberId: result.assignedMemberId ?? me, ownershipState: result.mode, controlEpoch: result.epoch });
  } catch (error) {
    // Same split as the console-v2 route: an impermissible ACTOR is a 403 with a
    // stable code, not a 502 that reads as a server fault.
    if (error instanceof ClaimActorError) {
      return NextResponse.json({ error: "actor_not_permitted" }, { status: 403 });
    }
    if (!(error instanceof ClaimLostError)) {
      return NextResponse.json({ error: "update_failed" }, { status: 502 });
    }
    const lostOwnerId = error.currentOwnerMemberId;
    if (lostOwnerId) {
      const ownerName = await resolveMemberName(admin, lostOwnerId);
      return NextResponse.json({ error: "already_claimed", ownerId: lostOwnerId, ownerName }, { status: 409 });
    }
  }

  // Lost the race to another member → tell the loser who owns it (no overwrite).
  if (ownerId) {
    const ownerName = await resolveMemberName(admin, ownerId);
    return NextResponse.json({ error: "already_claimed", ownerId, ownerName }, { status: 409 });
  }

  // Unowned but not claimable (e.g. CLOSED) — surface generically; the client refreshes.
  return NextResponse.json({ error: "already_claimed" }, { status: 409 });
}
