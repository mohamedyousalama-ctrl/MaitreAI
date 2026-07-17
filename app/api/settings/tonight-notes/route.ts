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
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";

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
    let closeMs = asUtc - offsetMs;
    // OVERNIGHT window (close <= open, e.g. Ramadan 20:00→03:00): the close is on
    // the NEXT calendar day. If today's computed close instant has already passed,
    // roll it forward 24h so a note created inside the window expires at the real
    // (next-day) close rather than a past instant.
    const overnight =
      typeof day.open === "string" &&
      Number(day.close.split(":")[0]) * 60 + Number(day.close.split(":")[1]) <=
        Number(day.open.split(":")[0]) * 60 + Number(day.open.split(":")[1]);
    if (overnight && closeMs <= nowMs) closeMs += 24 * 60 * 60 * 1000;
    return closeMs;
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
  // Base read (always available). The Ramadan columns are read SEPARATELY and
  // best-effort so this route keeps working BEFORE migration 0074 is applied
  // (it is PREPARE-ONLY): an unknown-column error must not null the whole row and
  // regress every tenant's expiry to the default TTL. Pre-migration → regular
  // hours; post-migration → effectiveHours overlays the Ramadan set when on.
  const { data: base } = await admin.from("restaurants").select("hours, timezone").eq("id", rid).maybeSingle();
  const timezone = String((base as { timezone?: string } | null)?.timezone ?? "Africa/Cairo");
  let rest = (base as RestaurantHoursFields | null) ?? null;
  const { data: ram, error: ramErr } = await admin
    .from("restaurants")
    .select("ramadan_mode, ramadan_hours")
    .eq("id", rid)
    .maybeSingle();
  if (!ramErr && ram && base) rest = { ...(base as object), ...(ram as object) } as RestaurantHoursFields;
  const hours = (effectiveHours(rest) as Record<string, unknown> | null) ?? null;
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

// DELETE /api/settings/tonight-notes?id=<uuid> — manager-only, AUDITED retract
// ("end now"). Mirrors POST's auth + audit pattern. Deleting the row drops the note
// from Karim's prompt on the next turn exactly as expiry does: customer-turn reads
// live notes with `expires_at > now`, and a deleted row is simply no longer returned.
export async function DELETE(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const rid = tenant.restaurantId;

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "bad_request", detail: "id required" }, { status: 400 });

  // Tenant-scoped: only a note belonging to the caller's restaurant is retractable
  // (no cross-tenant delete, no probing an arbitrary id).
  const { data: existing } = await admin
    .from("tonight_notes")
    .select("id")
    .eq("id", id)
    .eq("restaurant_id", rid)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const memberId = (await admin.from("members").select("id").eq("user_id", tenant.userId).eq("restaurant_id", rid).maybeSingle()).data as { id?: string } | null;

  try {
    await mustWrite<{ id: string }>(
      admin.from("tonight_notes").delete().eq("id", id).eq("restaurant_id", rid).select("id"),
      "settings.tonight_notes.delete",
      { exactRows: 1 },
    );
  } catch (error) {
    if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "delete_failed", detail }, { status: 502 });
  }

  await recordAuditEvent(admin, {
    restaurantId: rid, userId: tenant.userId, role: tenant.role,
    action: "tonight_note_deleted", entityType: "restaurant", entityId: rid,
    memberId: memberId?.id ?? null, metadata: { note_id: id },
  });
  return NextResponse.json({ ok: true, id });
}
