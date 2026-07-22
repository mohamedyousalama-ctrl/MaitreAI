import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data: member, error } = await admin
    .from("members")
    .select("id")
    .eq("user_id", tenant.userId)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "member_lookup_failed" }, { status: 502 });
  if (!member) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  const response = NextResponse.json({ currentMemberId: (member as { id: string }).id });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
