// ============================================================================
// MaitreAI — Onboarding Step 4: go-live gate
//
// GET  /api/onboarding/go-live?restaurantId=<id>
//   Returns the readiness checklist without mutating anything.
//
// POST /api/onboarding/go-live
//   Body: { restaurantId: string }
//   Server-side rechecks ALL required conditions, then activates the tenant
//   (active=true, agent_mode='live') ONLY if every required item passes.
//   Returns 422 with the checklist if any required item is incomplete.
//   Returns 200 { ok: true, activated: true, checklist } on success.
//
// ── Checklist ──────────────────────────────────────────────────────────────
//
//   REQUIRED (blocks go-live):
//     whatsapp  — wa_configured_at IS NOT NULL on the restaurant row.
//                 Signals the embedded-signup credential exchange completed.
//     menu      — at least one menu_drafts row with status='published'.
//                 Signals the live menu tables have been populated.
//     hours     — restaurants.hours != '{}'. Signals an operating schedule
//                 was configured so the Brain knows when to accept orders.
//
//   ADVISORY (shown in checklist, never blocks go-live):
//     zones     — count of active delivery_zones rows. Pickup-only tenants
//                 legitimately have zero zones; blocking on this would gate
//                 valid tenant types. Surfaced so the operator can decide.
//
// ── Safety invariant ────────────────────────────────────────────────────────
//
//   A tenant NEVER transitions to live=true / agent_mode='live' via this
//   route unless the server-side recheck passes in the same request. The
//   client-side checklist display is informational only. No trust is placed
//   in any client-supplied readiness claim.
//
//   Once live, the ops toggle (/api/settings/ops) handles subsequent
//   live ↔ paused transitions. This gate only handles setup → live.
//
// ── Isolation ────────────────────────────────────────────────────────────────
//   Zero changes to lib/ai/*, allergen gate, order/COD, loadBrain() read path.
//   Only writes restaurants.active + restaurants.agent_mode (same columns the
//   ops route already manages for running tenants).
//
// Auth: manager of the target restaurant. Uses admin client for writes (bypasses
// RLS — same pattern as the embedded-signup and publish routes).
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChecklistItem {
  /** Whether this condition is currently satisfied. */
  pass: boolean;
  /** Whether failing this item blocks go-live (true = required). */
  required: boolean;
  /** Human-readable label for the dashboard UI. */
  label: string;
}

interface Checklist {
  whatsapp: ChecklistItem;
  menu: ChecklistItem;
  hours: ChecklistItem;
  allergyTestDrive: ChecklistItem;
  zones: ChecklistItem;
}

// WO-GATE-ALLERGY — the allergy test-drive must have PASSED (the deterministic gate
// fired in the manager test-drive) within this window before go-live. Puts the
// standing "allergy hint test must pass in test mode before agent_mode flips live"
// law in the SERVER, not PM discipline.
const ALLERGY_TEST_DRIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface ReadinessResult {
  checklist: Checklist;
  /** True when every REQUIRED item passes. */
  ready: boolean;
  /** True when the tenant is already live (agent_mode='live' AND active=true). */
  alreadyLive: boolean;
}

// ---------------------------------------------------------------------------
// Core readiness computation — all DB reads happen here.
// ---------------------------------------------------------------------------

async function computeReadiness(
  admin: ReturnType<typeof createAdminClient>,
  restaurantId: string
): Promise<ReadinessResult> {
  if (!admin) throw new Error("admin client unavailable");

  // WO-GATE-ALLERGY — a passing allergy test-drive within the last 7 days.
  const sinceIso = new Date(Date.now() - ALLERGY_TEST_DRIVE_WINDOW_MS).toISOString();

  // Single parallel fan-out — each query tight.
  const [restaurantRes, menuRes, zonesRes, allergyRes] = await Promise.all([
    admin
      .from("restaurants")
      .select("wa_configured_at, hours, agent_mode, active")
      .eq("id", restaurantId)
      .single(),

    // EXISTS-style: we only need to know if at least one published draft exists.
    admin
      .from("menu_drafts")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "published")
      .limit(1),

    // Advisory: count of active delivery zones.
    admin
      .from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("active", true),

    // REQUIRED: a passing allergy test-drive (gate fired) recorded in the last 7 days.
    admin
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("action", "onboarding_allergy_test_passed")
      .gte("created_at", sinceIso),
  ]);

  if (restaurantRes.error) throw restaurantRes.error;

  const row = restaurantRes.data;
  const publishedMenuCount = menuRes.count ?? 0;
  const activeZoneCount = zonesRes.count ?? 0;
  // Fail-CLOSED: a query error (never proves it passed) → treat as NOT passed, so a
  // read failure can never wave a tenant through the safety test-drive gate.
  const allergyTestDrivePass = !allergyRes.error && (allergyRes.count ?? 0) > 0;

  // Hours is considered "set" when the operator has stored any non-empty object.
  const hoursRaw = row.hours;
  const hoursSet =
    hoursRaw !== null &&
    typeof hoursRaw === "object" &&
    !Array.isArray(hoursRaw) &&
    Object.keys(hoursRaw).length > 0;

  const checklist: Checklist = {
    whatsapp: {
      pass: row.wa_configured_at != null,
      required: true,
      label: "WhatsApp متصل",
    },
    menu: {
      pass: publishedMenuCount > 0,
      required: true,
      label: "القائمة منشورة",
    },
    hours: {
      pass: hoursSet,
      required: true,
      label: "ساعات العمل محددة",
    },
    allergyTestDrive: {
      pass: allergyTestDrivePass,
      required: true,
      label: "اختبار الحساسية ناجح (تجربة المدير)",
    },
    zones: {
      pass: activeZoneCount > 0,
      required: false,
      label: "مناطق التوصيل",
    },
  };

  const ready = Object.values(checklist).every((item) => !item.required || item.pass);
  const alreadyLive = row.agent_mode === "live" && row.active === true;

  return { checklist, ready, alreadyLive };
}

// ---------------------------------------------------------------------------
// Auth helpers — shared between GET and POST
// ---------------------------------------------------------------------------

/** Verify the caller is a manager of restaurantId. Returns null if not. */
async function verifyManager(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  restaurantId: string
): Promise<boolean> {
  if (!admin) return false;
  const { data } = await admin
    .from("members")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "manager";
}

// ---------------------------------------------------------------------------
// GET — readiness checklist (read-only)
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const serverClient = createServerClient();
  if (!serverClient) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const restaurantId = (url.searchParams.get("restaurantId") ?? "").trim();
  if (!restaurantId) {
    return NextResponse.json({ error: "bad_request", detail: "restaurantId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const isManager = await verifyManager(admin, user.id, restaurantId);
  if (!isManager) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const result = await computeReadiness(admin, restaurantId);
    return NextResponse.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "fetch_failed", detail }, { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// POST — go-live action
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const serverClient = createServerClient();
  if (!serverClient) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId.trim() : "";
  if (!restaurantId) {
    return NextResponse.json({ error: "bad_request", detail: "restaurantId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const isManager = await verifyManager(admin, user.id, restaurantId);
  if (!isManager) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Server-side recheck — never trust client state.
  let readiness: ReadinessResult;
  try {
    readiness = await computeReadiness(admin, restaurantId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "fetch_failed", detail }, { status: 502 });
  }

  // Already live — idempotent; return success without re-writing.
  if (readiness.alreadyLive) {
    return NextResponse.json({ ok: true, activated: false, alreadyLive: true, checklist: readiness.checklist });
  }

  // Gate: all required items must pass. Return 422 with the checklist so the
  // UI can highlight exactly which step is incomplete.
  if (!readiness.ready) {
    return NextResponse.json(
      { error: "not_ready", checklist: readiness.checklist },
      { status: 422 }
    );
  }

  // All required conditions confirmed on the server — activate.
  try {
    await mustWrite<{ id: string }>(
      admin
        .from("restaurants")
        .update({ active: true, agent_mode: "live" })
        .eq("id", restaurantId)
        .select("id"),
      "onboarding.go_live.update",
      { exactRows: 1 },
    );
  } catch (error) {
    if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "activation_failed", detail }, { status: 502 });
  }

  return NextResponse.json({ ok: true, activated: true, alreadyLive: false, checklist: readiness.checklist });
}
