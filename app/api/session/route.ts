// ============================================================================
// MaitreAI — R1 Session endpoint (server only)
// The ONE place the console reads its role-aware session payload. Returns the
// resolved active tenant (userId, restaurantId, role) plus a derived isManager
// convenience so the client never re-derives role authority in scattered spots.
// Fails CLOSED through the shared tenant gate: 401 unauthenticated, 403 when no
// explicit active restaurant is resolved (no default tenant, ever).
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;

  const { userId, restaurantId, role } = gate.tenant;
  return NextResponse.json({ userId, restaurantId, role, isManager: role === "manager" });
}
