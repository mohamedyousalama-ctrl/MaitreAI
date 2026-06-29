// ============================================================================
// MaitreAI — COD settlement/ledger CSV export (T10 / C2.3) — SERVER ONLY,
// session-authenticated, MANAGER-ONLY, READ-ONLY.
//
// Accounting export of the current COD position. Today the only export is the
// per-settlement printable slip IMAGE; this adds a machine-readable CSV of the
// outstanding (held_by_driver) cash at ORDER granularity — order refs + dates +
// per-order expected/collected/discrepancy + driver + customer — which is what
// accounting needs and mirrors the slip's line items.
//
// MONEY DISCIPLINE: figures come verbatim from the SAME authoritative server
// readers the close-shift screen uses (heldCollectionItems + driverLedger for
// names) — never recomputed here. This route is a REPORT: it performs NO writes
// and never settles. Exporting can never mutate the ledger.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createClient } from "@/lib/supabase/server";
import { heldCollectionItems, driverLedger } from "@/lib/db/cod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimal, safe CSV (RFC-4180 quoting) — mirrors the S8 export script. */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(cols: string[], rows: Array<Record<string, unknown>>): string {
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n");
}

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // C2.3 — manager-only (cash report). Operations members can't export the ledger.
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Authoritative reads only — no recompute, no writes.
  const [items, drivers] = await Promise.all([
    heldCollectionItems(supabase, tenant.restaurantId),
    driverLedger(supabase, tenant.restaurantId),
  ]);
  const driverName = new Map<string, string>();
  for (const d of drivers) driverName.set(d.driverId ?? "unassigned", d.driverName);

  const cols = ["driver_name", "order_number", "customer", "expected", "collected", "discrepancy", "status", "collected_at"];
  const rows = items.map((it) => ({
    driver_name: driverName.get(it.driverId ?? "unassigned") ?? (it.driverId ? "" : "غير معيّن"),
    order_number: it.orderNumber ?? "",
    customer: it.customer ?? "",
    expected: it.expected,
    collected: it.collected,
    // discrepancy mirrors the ledger/slip convention (collected - expected;
    // negative = short). Figures are already round2'd by the readers.
    discrepancy: Math.round((it.collected - it.expected) * 100) / 100,
    status: it.status ?? "",
    collected_at: it.collectedAt ?? "",
  }));

  // BOM so Excel opens the Arabic (UTF-8) content correctly.
  const csv = "﻿" + toCsv(cols, rows);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cod-ledger-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
