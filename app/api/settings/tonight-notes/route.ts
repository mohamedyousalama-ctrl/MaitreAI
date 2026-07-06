// ============================================================================
// MaitreAI — Item 14: tonight-notes authoring — SERVER ONLY, MANAGER-ONLY, AUDITED.
// The write surface for the 0066 table. A tonight note is a short one-liner that
// EXPIRES at the end of today's service window (computed here from the tenant's
// hours + timezone), so it self-drops from Karim's prompt after close — no cron.
// Bounded length (<=500). Every create writes an audit row. GET lists live notes.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { recordAuditEvent } from "@/lib/db/audit";
import { TONIGHT_MAX } from "@/lib/ai/standing-instructions";
import { computeTonightExpiryMs } from "@/lib/settings/tonight-expiry";
import { WEEK_DAYS } from "@/lib/settings/hours";
import { effectiveHours, type RestaurantHoursFields } from "@/lib/settings/effective-hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve today's close INSTANT (epoch ms) in the tenant's timezone from the
 *  hours JSON, or null when today is closed / hours are absent/malformed. */
function todayCloseMs(hours: Record<string, unknown> | null, timezone: string, nowMs: number): number | null {
  if (!hours) return null;
  try {
    // Tenant-local Y/M/D + weekday via Intl (no tz library needed).
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    });
    const parts = fmt.formatToParts(new Date(nowMs));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const wdShort = get("weekday").toLowerCase(); // e.g. "fri"
    const dayKey = WEEK_DAYS.find((d) => d.startsWith(wdShort));
    if (!dayKey) return null;
    const day = hours[dayKey] as { open?: string; close?: string; closed?: boolean } | undefined;
    if (!day || day.closed === true || typeof day.close !== "string") return null;
    // Build the close instant: interpret today's local Y-M-D + close HH:MM in the tz.
    // We compute the tz offset at nowMs and apply it to the local close wall-time.
    const [ch, cm] = day.close.split(":").map(Number);
    const y = Number(get("year")), mo = Number(get("month")), d = Number(get("day"));
    // Local wall-time as if UTC, then correct by the tz offset active at nowMs.
    const asUtc = Date.UTC(y, mo - 1, d, ch, cm, 0);
    const offsetMs = tzOffsetMsAt(timezone, nowMs);
    return asUtc - offsetMs;
  } catch {
    return null;
  }
}

/** Milliseconds to ADD to a UTC instant to get tenant-local wall-clock (i.e. the
 *  tz offset). Derived by comparing the tz-formatted time to the UTC time. */
function tzOffsetMsAt(timezone: string, atMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = dtf.formatToParts(new Date(atMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asIfUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asIfUtc - atMs;
}

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const { data, error } = await supabase
    .from("tonight_notes")
    .select("id, body, created_by, created_at, expires_at")
    .eq("restaurant_id", tenant.restaurantId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const rid = tenant.restaurantId;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = String(body.body ?? "").trim();
  if (!text || text.length > TONIGHT_MAX) {
    return NextResponse.json({ error: "bad_request", detail: `body 1..${TONIGHT_MAX} chars` }, { status: 400 });
  }

  // Expiry from today's service window (tenant tz), bounded [now+1h, now+18h].
  // Ramadan-aware: effectiveHours resolves ramadan_hours when the mode is on.
  const { data: rest } = await admin
    .from("restaurants")
    .select("hours, ramadan_mode, ramadan_hours, timezone")
    .eq("id", rid)
    .maybeSingle();
  const hours = (effectiveHours(rest as RestaurantHoursFields | null) as Record<string, unknown> | null) ?? null;
  const timezone = String((rest as { timezone?: string } | null)?.timezone ?? "Africa/Cairo");
  const nowMs = Date.now();
  const expiresAt = new Date(computeTonightExpiryMs(nowMs, todayCloseMs(hours, timezone, nowMs))).toISOString();

  const memberId = (await admin.from("members").select("id").eq("user_id", tenant.userId).eq("restaurant_id", rid).maybeSingle()).data as { id?: string } | null;
  const { data: row, error } = await admin
    .from("tonight_notes")
    .insert({ restaurant_id: rid, body: text, created_by: memberId?.id ?? null, expires_at: expiresAt })
    .select("id, expires_at")
    .single();
  if (error) return NextResponse.json({ error: "create_failed", detail: error.message }, { status: 502 });

  await recordAuditEvent(admin, {
    restaurantId: rid, userId: tenant.userId, role: tenant.role,
    action: "tonight_note_created", entityType: "restaurant", entityId: rid,
    memberId: memberId?.id ?? null, metadata: { note_id: (row as { id: string }).id, expires_at: expiresAt },
  });
  return NextResponse.json({ ok: true, id: (row as { id: string }).id, expiresAt });
}
