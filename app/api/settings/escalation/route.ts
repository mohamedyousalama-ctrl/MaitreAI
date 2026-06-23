// ============================================================================
// MaitreAI — Per-tenant escalation timeout settings
//
// GET  /api/settings/escalation  — any member; returns escalation_timeout_minutes
// PUT  /api/settings/escalation  — manager only; updates the timeout
//
// escalation_timeout_minutes (restaurants, migration 0037) controls how long a
// human-owned conversation can sit idle before the stuck-detection alert fires.
// Default: 10 minutes (mirrors the hardcoded STUCK_THRESHOLDS.humanNoResponseMinutes
// constant in lib/intelligence/stuck-detection.ts).
//
// ── Spine isolation ──────────────────────────────────────────────────────────
// This route stores config only. Wiring stuck-detection to read this column
// instead of its hardcoded constant is a SEPARATE TASK — it requires changing
// the checkAndNotifyStuck caller in lib/messaging/respond-and-send.ts (the
// inbound spine). That wiring is intentionally deferred to avoid spine risk.
// Until wired, the engine continues to use STUCK_THRESHOLDS defaults.
//
// ── Validation ───────────────────────────────────────────────────────────────
// Range: 1–1440 minutes (1 minute to 24 hours). Protects against accidental
// zero (would alert immediately on every message) or absurdly large values.
//
// Auth: same pattern as /api/settings/ops and /api/settings/payment.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_TIMEOUT = 1;
const MAX_TIMEOUT = 1440; // 24 hours
const DEFAULT_TIMEOUT = 10; // matches STUCK_THRESHOLDS.humanNoResponseMinutes

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("restaurants")
    .select("escalation_timeout_minutes")
    .eq("id", tenant.restaurantId)
    .single();

  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 502 });

  return NextResponse.json({
    escalationTimeoutMinutes: (data.escalation_timeout_minutes as number | null) ?? DEFAULT_TIMEOUT,
  });
}

export async function PUT(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (!("escalationTimeoutMinutes" in body)) {
    return NextResponse.json({ error: "bad_request", detail: "escalationTimeoutMinutes is required" }, { status: 400 });
  }

  const raw = body.escalationTimeoutMinutes;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < MIN_TIMEOUT || raw > MAX_TIMEOUT) {
    return NextResponse.json(
      { error: "bad_request", detail: `escalationTimeoutMinutes must be an integer between ${MIN_TIMEOUT} and ${MAX_TIMEOUT}` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("restaurants")
    .update({ escalation_timeout_minutes: raw })
    .eq("id", tenant.restaurantId);

  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });

  return NextResponse.json({ ok: true, escalationTimeoutMinutes: raw });
}
