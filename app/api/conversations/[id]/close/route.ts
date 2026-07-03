// ============================================================================
// MaitreAI — server-authoritative conversation CLOSE (WO-1) — SERVER ONLY.
// Closing is now a server action so the outcome writer (service-role + LLM) can
// run at the ONE true terminal — the ownership_state → CLOSED transition, the
// same event outcome_coverage counts. Same member-auth posture as the sibling
// routes (assignee/notes/resume/stage).
//
// ORDER OF OPERATIONS (WO-1 §2):
//   1) commit the → CLOSED transition FIRST (durable),
//   2) THEN emit the outcome (flag-gated, retry+alert on failure).
// The emit NEVER fails the close: emitConversationOutcome never throws, and a
// classifier failure is a logged gap (system_alerts), not a close failure.
//
// SAFETY (#87): a SYSTEM_HOLD / safety-held thread is NEVER closed-around — it
// requires deliberate release, mirroring the client which only offers close from
// a human-owned thread. We reject the close here rather than transitioning.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setOwnershipState } from "@/lib/db/ownership";
import { emitConversationOutcome } from "@/lib/intelligence/conversation-outcomes";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Tenant-scoped read (code carries the isolation).
  const { data: conv, error: readErr } = await admin
    .from("conversations")
    .select("id, ownership_state, is_safety_hold")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  if (!conv) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });

  const state = (conv as { ownership_state: string | null }).ownership_state;
  const safetyHeld = (conv as { is_safety_hold: boolean | null }).is_safety_hold === true;

  // SAFETY: never close a safety hold (mirror the client — close is offered only
  // from a human-owned thread, never SYSTEM_HOLD). The map would technically allow
  // SYSTEM_HOLD → CLOSED, so we gate it explicitly here.
  if (state === "SYSTEM_HOLD" || safetyHeld) {
    return NextResponse.json({ error: "cannot_close_safety_hold" }, { status: 409 });
  }

  // Already closed → idempotent success (no re-emit; the writer is written-once anyway).
  if (state === "CLOSED") {
    return NextResponse.json({ ok: true, ownershipState: "CLOSED" });
  }

  // 1) Commit the CLOSED transition FIRST. setOwnershipState enforces map legality
  //    (throws on an illegal transition) and dual-writes the legacy fields.
  try {
    await setOwnershipState(admin, params.id, "CLOSED", { extra: {} });
  } catch (e) {
    return NextResponse.json({ error: "close_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }

  // 2) THEN emit the outcome — after the close is durable. Flag-gated (first
  //    statement inside), never throws, never fails the close. With the flag OFF
  //    this does a single feature-flag read and nothing else.
  await emitConversationOutcome(admin, { restaurantId: tenant.restaurantId, conversationId: params.id });

  return NextResponse.json({ ok: true, ownershipState: "CLOSED" });
}
