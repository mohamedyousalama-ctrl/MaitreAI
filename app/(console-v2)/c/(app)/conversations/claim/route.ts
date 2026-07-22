import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClaimLostError, claimConversation } from "@/lib/console/conversation-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_NAME = "موظف";

type ConversationSnapshot = {
  id: string;
  ownership_state: string | null;
  control_epoch: number | string | null;
  assigned_member_id: string | null;
};

function readRenderedEpoch(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

async function currentMemberId(admin: SupabaseClient, userId: string, restaurantId: string): Promise<string | null> {
  const { data } = await admin
    .from("members")
    .select("id")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function memberName(admin: SupabaseClient, memberId: string | null): Promise<string | null> {
  if (!memberId) return null;
  const { data: m } = await admin.from("members").select("user_id").eq("id", memberId).maybeSingle();
  const userId = (m as { user_id?: string } | null)?.user_id;
  if (!userId) return FALLBACK_NAME;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.name === "string" ? meta.name.trim() : "";
    const email = data.user?.email ?? "";
    return name || (email ? email.split("@")[0] : "") || FALLBACK_NAME;
  } catch {
    return FALLBACK_NAME;
  }
}

function snapshotPayload(snapshot: ConversationSnapshot, ownerName: string | null) {
  return {
    ownershipState: snapshot.ownership_state,
    controlEpoch: Number(snapshot.control_epoch ?? 0),
    assignedMemberId: snapshot.assigned_member_id,
    ownerName,
  };
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
  const renderedEpoch = readRenderedEpoch(body.renderedEpoch);
  if (!conversationId || renderedEpoch == null) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const me = await currentMemberId(admin, tenant.userId, tenant.restaurantId);
  if (!me) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  const { data: current, error: readErr } = await admin
    .from("conversations")
    .select("id, ownership_state, control_epoch, assigned_member_id")
    .eq("id", conversationId)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const snapshot = current as ConversationSnapshot;
  const currentEpoch = Number(snapshot.control_epoch ?? 0);
  if (currentEpoch !== renderedEpoch) {
    return NextResponse.json(
      { error: "stale_epoch", current: snapshotPayload(snapshot, await memberName(admin, snapshot.assigned_member_id)) },
      { status: 409 },
    );
  }

  if (snapshot.assigned_member_id === me && snapshot.ownership_state === "HUMAN_ACTIVE") {
    return NextResponse.json({
      ok: true,
      currentMemberId: me,
      ownershipState: snapshot.ownership_state,
      controlEpoch: currentEpoch,
      assignedMemberId: me,
    });
  }

  try {
    const result = await claimConversation(admin, {
      conversationId,
      restaurantId: tenant.restaurantId,
      memberId: me,
    });
    return NextResponse.json({
      ok: true,
      currentMemberId: me,
      ownershipState: result.mode,
      controlEpoch: result.epoch,
      assignedMemberId: result.assignedMemberId ?? me,
    });
  } catch (error) {
    if (error instanceof ClaimLostError) {
      const ownerName = await memberName(admin, error.currentOwnerMemberId);
      return NextResponse.json(
        { error: "already_claimed", ownerId: error.currentOwnerMemberId, ownerName },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "claim_failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
