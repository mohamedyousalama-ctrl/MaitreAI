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
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FALLBACK = "موظف";

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: rows } = await admin
    .from("members")
    .select("id, user_id, role")
    .eq("restaurant_id", tenant.restaurantId);
  const members = (rows ?? []) as Array<{ id: string; user_id: string; role: string }>;

  // Resolve each member's display name from the auth user (small roster: ≤ a handful).
  const out = await Promise.all(
    members.map(async (m) => {
      let name = FALLBACK;
      try {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
        const metaName = typeof meta.name === "string" ? meta.name.trim() : "";
        const email = data.user?.email ?? "";
        name = metaName || (email ? email.split("@")[0] : "") || FALLBACK;
      } catch {
        /* name stays the safe fallback — never blank */
      }
      return { id: m.id, name, role: m.role };
    })
  );

  return NextResponse.json({ members: out });
}
