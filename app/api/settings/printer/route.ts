// ============================================================================
// Kivo (KSA) — WO-QZ-PRINT: printer_config settings route — SERVER ONLY.
// Manager-only; FLAG-GATED on `qz_print` (default OFF). With the flag off it
// reads/writes NO printer_config column, so it stays inert AND tolerant of the
// column not existing yet (migration 0076 is PREPARE-ONLY). Every write records
// an audit_events row. This governs the QZ SILENT-print path only — the browser
// print flow (auto_print / print_width) is a separate, always-available route.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { recordAuditEvent } from "@/lib/db/audit";
import { parsePrinterConfig, PRINT_WIDTHS, type PrintWidth } from "@/lib/print/printer-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadFlags(admin: NonNullable<ReturnType<typeof createAdminClient>>, restaurantId: string) {
  const { data, error } = await admin.from("restaurants").select("feature_flags").eq("id", restaurantId).maybeSingle();
  return { flags: (data?.feature_flags as Record<string, unknown> | null) ?? null, error: !!error };
}

export async function GET() {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { flags, error: flagsErr } = await loadFlags(admin, tenant.restaurantId);
  if (flagsErr) return NextResponse.json({ error: "db_error" }, { status: 503 });
  if (!isFeatureExplicitlyEnabled("qz_print", flags)) {
    return NextResponse.json({ enabled: false, config: null });
  }

  // Best-effort read: printer_config may not exist yet (PREPARE-ONLY migration).
  const { data, error } = await admin
    .from("restaurants")
    .select("printer_config")
    .eq("id", tenant.restaurantId)
    .maybeSingle();
  const config = error ? null : parsePrinterConfig((data as { printer_config?: unknown } | null)?.printer_config);
  return NextResponse.json({ enabled: true, config });
}

export async function POST(req: Request) {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { flags, error: flagsErr } = await loadFlags(admin, tenant.restaurantId);
  if (flagsErr) return NextResponse.json({ error: "db_error" }, { status: 503 });
  if (!isFeatureExplicitlyEnabled("qz_print", flags)) {
    return NextResponse.json({ error: "qz_print_disabled" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.name !== "string" || typeof body.auto_print !== "boolean" ||
      !(PRINT_WIDTHS as readonly string[]).includes(String(body.width))) {
    return NextResponse.json({ error: "bad_params", detail: "name, width(58mm|80mm), auto_print required" }, { status: 400 });
  }
  const config = parsePrinterConfig({ name: body.name, width: body.width as PrintWidth, auto_print: body.auto_print });

  const { data, error } = await admin
    .from("restaurants")
    .update({ printer_config: config })
    .eq("id", tenant.restaurantId)
    .select("id");
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });
  if (!data || data.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "settings_flag_flipped",
    entityType: "restaurant",
    entityId: tenant.restaurantId,
    metadata: { setting: "printer_config", printer: config.name, width: config.width, auto_print: config.auto_print },
  });

  return NextResponse.json({ ok: true, config });
}
