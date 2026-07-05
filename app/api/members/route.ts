// ============================================================================
// MaitreAI — tenant member roster (MO1) — SERVER ONLY.
// Returns this tenant's members with a display NAME, so the console can render
// "{name} تولّى المحادثة" for whichever member owns a conversation (the owner may
// be a different operator, whose name isn't browser-readable). `members` has no
// name column, so the name is resolved from the auth user (user_metadata.name →
// email local-part → safe fallback) via the service-role admin client. Read-only;
// scoped to the authorized restaurant_id.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FALLBACK = "موظف";

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data: rows } = await admin
    .from("members")
    .select("id, user_id, role, created_at")
    .eq("restaurant_id", tenant.restaurantId)
    .order("created_at", { ascending: true });
  const members = (rows ?? []) as Array<{ id: string; user_id: string; role: string; created_at: string }>;

  // Resolve each member's display name from the auth user (small roster: ≤ a handful).
  const out = await Promise.all(
    members.map(async (m) => {
      let name = FALLBACK;
      let email: string | null = null;
      try {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
        const metaName = typeof meta.name === "string" ? meta.name.trim() : "";
        email = data.user?.email ?? null;
        name = metaName || (email ? email.split("@")[0] : "") || FALLBACK;
      } catch {
        /* name stays the safe fallback — never blank */
      }
      return { id: m.id, name, email, role: m.role, createdAt: m.created_at };
    })
  );

  return NextResponse.json({ members: out });
}
