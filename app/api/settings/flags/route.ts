// ============================================================================
// MaitreAI — R4 Feature-flag flip (POST) — SERVER ONLY, MANAGER-ONLY, AUDITED.
// Flips ONE feature flag on restaurants.feature_flags (JSONB merge — never drops
// sibling flags). SAFETY FLAGS ARE REJECTED SERVER-SIDE (403) from ANY console,
// for ANY role: turning off a safety flag is a child-safety failure mode, so the
// console is simply not a surface that can do it (lib/settings/safety-flags +
// migration 0037's forced default are the belt & suspenders). Every accepted
// flip records an audit row (flag, from → to).
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { recordAuditEvent } from "@/lib/db/audit";
import { isSafetyFlag, isManagerWritableFlag, SAFETY_FLAGS } from "@/lib/settings/safety-flags";
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the current feature-flag truth for this tenant, so the console can render
// real ON/OFF state (never a fabricated toggle). Returns the stored flags plus the
// enumerated safety flags (always-on, not flippable) so the UI can lock them
// exactly as the POST guard does. Tenant-scoped read; no role gate (reading which
// flags are on is not privileged — flipping one is, and that stays manager-only).
export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data } = await supabase.from("restaurants").select("feature_flags").eq("id", tenant.restaurantId).maybeSingle();
  const flags = { ...((data?.feature_flags as Record<string, unknown>) ?? {}) };
  // Safety flags are ALWAYS on in truth (migration 0037 forces the default); surface
  // them as true so the console never renders a safety guard as off.
  for (const f of SAFETY_FLAGS) flags[f] = true;

  return NextResponse.json({ flags, safety: SAFETY_FLAGS });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { flag?: unknown; enabled?: unknown };
  const flag = String(body.flag ?? "").trim();
  if (!flag) return NextResponse.json({ error: "bad_request", detail: "missing flag" }, { status: 400 });
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "bad_request", detail: "enabled must be boolean" }, { status: 400 });

  // SAFETY GATE — before any read/write. A safety flag is never flippable from a
  // console, by anyone. Rejected server-side regardless of the requested value.
  if (isSafetyFlag(flag)) {
    return NextResponse.json({ error: "safety_flag_locked", detail: `${flag} is a safety flag and cannot be changed from the console` }, { status: 403 });
  }

  // ALLOWLIST GATE — the manager console may flip ONLY the enumerated operator
  // capability flags (psp_payments, qz_print). Any other key — console_v2, a
  // delivery/infra flag, an unknown key — is rejected here, so removing the raw
  // flag panel from the UI is backed by the API and not defeatable by curl (an
  // arbitrary flip could brick the tenant back to the old console). Belt matches
  // the suspenders: same 403 shape as the safety guard above.
  if (!isManagerWritableFlag(flag)) {
    return NextResponse.json({ error: "flag_not_writable", detail: `${flag} is not a manager-writable flag` }, { status: 403 });
  }

  const { data: cur } = await supabase.from("restaurants").select("feature_flags").eq("id", tenant.restaurantId).maybeSingle();
  const flags = { ...((cur?.feature_flags as Record<string, unknown>) ?? {}) };
  const from = flags[flag] === true;
  flags[flag] = body.enabled;

  try {
    await mustWrite<{ id: string }>(
      supabase.from("restaurants").update({ feature_flags: flags }).eq("id", tenant.restaurantId).select("id"),
      "settings.flags.update",
      { exactRows: 1 },
    );
  } catch (error) {
    if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "update_failed", detail }, { status: 502 });
  }

  await recordAuditEvent(createAdminClient()!, {
    restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
    action: "settings_flag_flipped", entityType: "restaurant", entityId: tenant.restaurantId,
    metadata: { flag, from, to: body.enabled },
  });
  return NextResponse.json({ ok: true, flag, enabled: body.enabled });
}
