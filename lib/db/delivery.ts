// ============================================================================
// MaitreAI — Delivery dispatch + driver flow service layer (SERVER ONLY).
// One delivery per finalized delivery order. The operator assigns a driver; we
// mint a one-time driver token (/d/<token>) + a customer tracking token
// (/t/<token>) and WhatsApp the driver the link. Driver page + a future native
// app hit the SAME token endpoints (status/location). Money/order facts come
// from the persisted order row (tool-computed) — never recomputed here.
// ============================================================================

import "server-only";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppText } from "@/lib/messaging/outbound";
import { runWithTenantWhatsAppCreds } from "@/lib/messaging/tenant-creds";
import { captureCodOnDelivered } from "@/lib/db/cod";
import { recordCriticalAlert } from "@/lib/alerts/record";
import { withinRunCap } from "@/lib/delivery/runs";

export const DELIVERY_STATUSES = [
  "pending",
  "assigned",
  "picked_up",
  "on_the_way",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// A driver link is valid until the delivery completes or this long after assign.
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function token(): string {
  return randomBytes(24).toString("base64url");
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://getkivo.io").replace(/\/$/, "");
}

export function isExpired(d: { expires_at?: string | null; status?: string }): boolean {
  if (d.status === "delivered" || d.status === "cancelled" || d.status === "failed") return true;
  if (d.expires_at && new Date(d.expires_at).getTime() < Date.now()) return true;
  return false;
}

// --- R3b — driver-presence check for the delivered / COD-capture guard --------
/**
 * Is there a delivery row for this order carrying an ASSIGNED driver?
 * Matched by order_id (the authoritative key — the client's order_number match is
 * only a fast-feedback heuristic). THROWS on a query error so callers can
 * FAIL-CLOSED: a COD delivery must never be booked "delivered" when driver
 * attribution can't be verified, else the cash is captured to driver_id=null
 * («غير معيّن») and per-driver reconciliation breaks.
 */
export async function orderHasAssignedDriver(
  admin: SupabaseClient,
  restaurantId: string,
  orderId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("deliveries")
    .select("driver_id")
    .eq("order_id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) throw error;
  return !!(data && (data as { driver_id: string | null }).driver_id);
}

// --- finalize → deliveries hook (idempotent on order_id) ---------------------
/** Create the pending delivery for a finalized delivery order. No-op if exists. */
export async function createDeliveryForOrder(
  admin: SupabaseClient,
  args: { orderId: string; restaurantId: string }
): Promise<{ created: boolean; deliveryId: string | null }> {
  const { orderId, restaurantId } = args;
  const { data, error } = await admin
    .from("deliveries")
    .upsert({ order_id: orderId, restaurant_id: restaurantId, status: "pending" }, { onConflict: "order_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  if (data && data.length) {
    await admin.from("delivery_events").insert({ delivery_id: data[0].id, type: "created", payload: {} });
    return { created: true, deliveryId: data[0].id as string };
  }
  const { data: ex } = await admin.from("deliveries").select("id").eq("order_id", orderId).maybeSingle();
  return { created: false, deliveryId: (ex?.id as string) ?? null };
}

/**
 * DLV1 — the SINGLE finalize hook every order-create path calls so a delivery
 * order always gets a pending delivery row (→ visible in التوصيل + assignable +
 * R3b-satisfiable). Input-control: validates the order is delivery-fulfillment
 * (authoritative, from the order row, tenant-scoped) before creating a row — a
 * pickup order never gets one. Idempotent via createDeliveryForOrder's
 * onConflict:"order_id" (unique index deliveries_order_idx), so re-saving an order
 * never duplicates the row. NOT gated on ENABLE_DELIVERY_TRACKING: the row must
 * exist for dispatch/guarding regardless of the UI toggle.
 */
export async function ensureDeliveryRowForOrder(
  admin: SupabaseClient,
  orderId: string,
  restaurantId: string
): Promise<{ created: boolean; deliveryId: string | null; skipped?: boolean }> {
  const { data: o } = await admin
    .from("orders")
    .select("fulfillment")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!o || (o as { fulfillment: string }).fulfillment !== "delivery") {
    return { created: false, deliveryId: null, skipped: true };
  }
  return createDeliveryForOrder(admin, { orderId, restaurantId });
}

/**
 * Sync the linked delivery to "delivered" when the operator marks the ORDER
 * delivered on the orders page (the order-status path updates orders.order_status
 * only). Mirrors the delivered patch the driver-token path writes
 * (updateDeliveryStatusByToken): status + delivered_at + closes the one-time link.
 * Idempotent: no row → no-op; already delivered → no-op (no error, no dup event).
 * Does NOT touch COD/driver attribution — only deliveries.status fields.
 */
export async function markDeliveryDelivered(admin: SupabaseClient, restaurantId: string, orderId: string): Promise<void> {
  const { data: d } = await admin
    .from("deliveries")
    .select("id,status")
    .eq("order_id", orderId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!d || (d as { status: string }).status === "delivered") return; // no row / already delivered → no-op
  const now = new Date().toISOString();
  await admin
    .from("deliveries")
    .update({ status: "delivered", delivered_at: now, token_used: true, expires_at: now, updated_at: now })
    .eq("id", (d as { id: string }).id);
  await admin.from("delivery_events").insert({ delivery_id: (d as { id: string }).id, type: "status:delivered", payload: { via: "operator" } });
}

// --- drivers -----------------------------------------------------------------
export async function listDrivers(db: SupabaseClient, restaurantId: string) {
  const { data } = await db
    .from("drivers")
    .select("id,name,phone,vehicle,active,created_at")
    .eq("restaurant_id", restaurantId)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function addDriver(db: SupabaseClient, restaurantId: string, input: { name: string; phone: string; vehicle?: string | null }) {
  const { data, error } = await db
    .from("drivers")
    .insert({ restaurant_id: restaurantId, name: input.name.trim(), phone: input.phone.trim(), vehicle: input.vehicle?.trim() || null })
    .select("id,name,phone,vehicle,active,created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function setDriverActive(db: SupabaseClient, restaurantId: string, driverId: string, active: boolean) {
  const { error } = await db.from("drivers").update({ active }).eq("id", driverId).eq("restaurant_id", restaurantId);
  if (error) throw error;
}

/** Edit a driver's profile (name/phone/vehicle only). The row id (driver_id) is
 *  unchanged, so existing deliveries/COD attribution is unaffected. Tenant-scoped. */
export async function updateDriver(
  db: SupabaseClient,
  restaurantId: string,
  driverId: string,
  input: { name: string; phone: string; vehicle?: string | null }
) {
  const { error } = await db
    .from("drivers")
    .update({ name: input.name.trim(), phone: input.phone.trim(), vehicle: input.vehicle?.trim() || null })
    .eq("id", driverId)
    .eq("restaurant_id", restaurantId);
  if (error) throw error;
}

// --- operator deliveries list (+ latest location for in-progress) ------------
const IN_PROGRESS = ["assigned", "picked_up", "on_the_way"];
const LOCATION_FRESH_MS = 30 * 1000;

export async function listDeliveries(db: SupabaseClient, restaurantId: string) {
  const { data } = await db
    .from("deliveries")
    .select("id,status,driver_id,assigned_at,picked_up_at,delivered_at,created_at,drivers(name,phone),orders(order_number,total,currency,address,fulfillment)")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Record<string, unknown>[];

  // Attach the freshest shared point for each in-progress delivery (operator map).
  const activeIds = rows.filter((r) => IN_PROGRESS.includes(String(r.status))).map((r) => r.id as string);
  if (activeIds.length) {
    const { data: locs } = await db
      .from("delivery_locations")
      .select("delivery_id,lat,lng,recorded_at")
      .in("delivery_id", activeIds)
      .order("recorded_at", { ascending: false });
    const latest = new Map<string, { lat: number; lng: number; recorded_at: string }>();
    for (const l of (locs ?? []) as { delivery_id: string; lat: number; lng: number; recorded_at: string }[]) {
      if (!latest.has(l.delivery_id)) latest.set(l.delivery_id, { lat: l.lat, lng: l.lng, recorded_at: l.recorded_at });
    }
    for (const r of rows) {
      const l = latest.get(r.id as string);
      r.latestLocation = l && Date.now() - new Date(l.recorded_at).getTime() < LOCATION_FRESH_MS ? l : null;
    }
  }
  return rows;
}

// --- order summary helper (for driver/customer messages + pages) -------------
async function loadOrderSummary(admin: SupabaseClient, orderId: string) {
  const { data: o } = await admin
    .from("orders")
    .select("order_number,items,total,currency,address,lat,lng,zone_id,fulfillment,conversation_id,customer_id,restaurant_id")
    .eq("id", orderId)
    .single();
  if (!o) return null;
  let customerPhone: string | null = null;
  if (o.customer_id) {
    const { data: c } = await admin.from("customers").select("phone").eq("id", o.customer_id).maybeSingle();
    customerPhone = (c?.phone as string) ?? null;
  }
  let zoneName: string | null = null;
  if (o.zone_id) {
    const { data: z } = await admin.from("delivery_zones").select("name").eq("id", o.zone_id).maybeSingle();
    zoneName = (z?.name as string) ?? null;
  }
  return { ...o, customerPhone, zoneName } as Record<string, unknown> & { customerPhone: string | null; zoneName: string | null };
}

// --- assignment (mints tokens, sends the driver link) ------------------------
export interface AssignResult {
  deliveryId: string;
  driverLink: string;
  customerLink: string;
  whatsapp: string; // send status: sent | skipped | failed
}

export async function assignDriver(
  admin: SupabaseClient,
  args: { deliveryId: string; driverId: string; restaurantId: string }
): Promise<AssignResult> {
  const { deliveryId, driverId, restaurantId } = args;

  const { data: driver } = await admin.from("drivers").select("id,name,phone,active").eq("id", driverId).eq("restaurant_id", restaurantId).maybeSingle();
  if (!driver) throw new Error("driver_not_found");

  const { data: delivery } = await admin.from("deliveries").select("id,order_id,driver_token,customer_token,restaurant_id").eq("id", deliveryId).eq("restaurant_id", restaurantId).maybeSingle();
  if (!delivery) throw new Error("delivery_not_found");

  // Re-use existing tokens on reassignment so old links stay scoped to one delivery.
  const driverTok = (delivery.driver_token as string) || token();
  const customerTok = (delivery.customer_token as string) || token();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await admin
    .from("deliveries")
    .update({ driver_id: driverId, status: "assigned", driver_token: driverTok, customer_token: customerTok, token_used: false, assigned_at: new Date().toISOString(), expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("id", deliveryId);
  await admin.from("delivery_events").insert({ delivery_id: deliveryId, type: "assigned", payload: { driverId, driverName: driver.name } });

  const base = appBaseUrl();
  const driverLink = `${base}/d/${driverTok}`;
  const customerLink = `${base}/t/${customerTok}`;

  // WhatsApp the driver the one-time link + order summary.
  let whatsapp = "skipped";
  try {
    const s = await loadOrderSummary(admin, delivery.order_id as string);
    const items = Array.isArray(s?.items) ? (s!.items as { quantity: number; name: string }[]).map((i) => `${i.quantity}× ${i.name}`).join("، ") : "";
    const addr = (s?.address as string) || s?.zoneName || "—";
    const cod = s ? `${s.total} ${s.currency}` : "";
    const body =
      `🛵 توصيل جديد\n` +
      (s?.order_number ? `طلب رقم ${s.order_number}\n` : "") +
      (items ? `${items}\n` : "") +
      `العنوان: ${addr}\n` +
      (s?.customerPhone ? `هاتف العميل: ${s.customerPhone}\n` : "") +
      `التحصيل عند الاستلام: ${cod}\n\n` +
      `افتح صفحة التوصيل وحدّث الحالة وشارك موقعك:\n${driverLink}`;
    // DRYRUN-2 (F1): dispatch from the TENANT's own WhatsApp number when
    // configured; env fallback (null override) when unconfigured → byte-identical
    // to today. Partial config (no phone_number_id) also falls back, not skips.
    const res = await runWithTenantWhatsAppCreds(admin, restaurantId, () =>
      sendWhatsAppText({ to: String(driver.phone), text: body })
    );
    whatsapp = res.status;
  } catch (e) {
    console.error("[delivery] driver link send error", e);
    whatsapp = "failed";
  }

  return { deliveryId, driverLink, customerLink, whatsapp };
}

// --- token-scoped reads (public, token IS the auth) --------------------------
export async function getDeliveryByDriverToken(admin: SupabaseClient, tok: string) {
  const { data: d } = await admin
    .from("deliveries")
    .select("id,order_id,restaurant_id,status,expires_at,token_used,driver_id,assigned_at,picked_up_at,delivered_at,drivers(name)")
    .eq("driver_token", tok)
    .maybeSingle();
  if (!d) return null;
  const order = await loadOrderSummary(admin, d.order_id as string);
  return { delivery: d, order };
}

// WO-DELIVERY-D2 DEPLOY-SAFETY: run_id ships in the PREPARE-ONLY 0082 migration.
// Until it is applied, selecting run_id makes PostgREST reject the WHOLE query
// (Postgres 42703 undefined_column) — which would 404 every live /t link, a flag-off
// production regression. We probe ONCE per process: try the run-aware select; on a
// missing-column rejection, cache that and permanently fall back to the legacy select
// (run_id absent → isActiveLeg(false) → today's behavior, byte-identical). One failed
// probe per process, never per request.
let deliveriesHasRunId: boolean | null = null;
const CUSTOMER_TOKEN_COLS = "id,order_id,restaurant_id,status,assigned_at,picked_up_at,delivered_at,expires_at,drivers(name)";

/** True for a Postgres/PostgREST "column does not exist" rejection (42703). */
export function isUndefinedColumnError(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === "42703") return true;
  const m = (e.message ?? "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function getDeliveryByCustomerToken(admin: SupabaseClient, tok: string) {
  let d: Record<string, unknown> | null = null;
  // Try the run-aware select unless a prior probe proved run_id absent (0082 unapplied).
  if (deliveriesHasRunId !== false) {
    const res = await admin
      .from("deliveries")
      .select(`run_id,${CUSTOMER_TOKEN_COLS}`)
      .eq("customer_token", tok)
      .maybeSingle();
    if (res.error) {
      if (isUndefinedColumnError(res.error)) deliveriesHasRunId = false; // 0082 not applied → stop probing
      // any other error: leave the cache and fall through with d=null (as before)
    } else {
      deliveriesHasRunId = true;
      d = (res.data as Record<string, unknown>) ?? null;
    }
  }
  // Legacy fallback (byte-identical to pre-D2 /t): no run_id column selected.
  if (deliveriesHasRunId === false) {
    const res = await admin.from("deliveries").select(CUSTOMER_TOKEN_COLS).eq("customer_token", tok).maybeSingle();
    d = (res.data as Record<string, unknown>) ?? null;
  }
  if (!d) return null;
  const order = await loadOrderSummary(admin, d.order_id as string);
  const { data: loc } = await admin
    .from("delivery_locations")
    .select("lat,lng,recorded_at")
    .eq("delivery_id", d.id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { delivery: d, order, location: loc ?? null };
}

// --- status update (driver token) -------------------------------------------
const FORWARD: Record<string, DeliveryStatus> = {
  picked_up: "picked_up",
  on_the_way: "on_the_way",
  delivered: "delivered",
  failed: "failed",
};

export async function updateDeliveryStatusByToken(
  admin: SupabaseClient,
  tok: string,
  next: string
): Promise<{ ok: boolean; status?: DeliveryStatus; error?: string }> {
  const target = FORWARD[next];
  if (!target) return { ok: false, error: "bad_status" };

  const { data: d } = await admin
    .from("deliveries")
    .select("id,order_id,restaurant_id,status,expires_at,customer_token")
    .eq("driver_token", tok)
    .maybeSingle();
  if (!d) return { ok: false, error: "not_found" };
  if (isExpired(d as { expires_at?: string | null; status?: string })) return { ok: false, error: "completed" };

  // Forward-only guard (server-side; the public endpoint can't trust the client
  // for ordering). Allow ONLY a move to the immediate next status in the sequence
  // — this rejects backward moves, repeats, AND skips (e.g. delivered on an
  // `assigned` row, which would otherwise bypass picked_up/on_the_way and is the
  // exact G1 gap). `failed` stays allowed from any non-terminal state (terminal
  // is already blocked by isExpired above). The legitimate driver UI always sends
  // the immediate next step, so this never breaks the real flow.
  const SEQ = ["pending", "assigned", "picked_up", "on_the_way", "delivered"];
  if (target !== "failed" && SEQ.indexOf(target) !== SEQ.indexOf(String((d as { status?: string }).status)) + 1) {
    return { ok: false, error: "invalid_transition" };
  }

  const patch: Record<string, unknown> = { status: target, updated_at: new Date().toISOString() };
  if (target === "picked_up") patch.picked_up_at = new Date().toISOString();
  if (target === "delivered") {
    patch.delivered_at = new Date().toISOString();
    patch.token_used = true; // audit flag; reuse is already blocked by expires_at + terminal-status via isExpired
    patch.expires_at = new Date().toISOString(); // close the link
  }
  await admin.from("deliveries").update(patch).eq("id", d.id);
  await admin.from("delivery_events").insert({ delivery_id: d.id, type: `status:${target}`, payload: {} });

  // COD capture: fire when the driver marks the delivery delivered and the order
  // was not pre-paid (payment_status != "paid"). captureCodOnDelivered is
  // idempotent; wrap in try/catch so a capture failure never blocks the status
  // transition (the driver's link must close regardless).
  if (target === "delivered") {
    try {
      const { data: ord } = await admin
        .from("orders")
        .select("payment_status")
        .eq("id", d.order_id as string)
        .maybeSingle();
      if (ord && (ord as { payment_status: string }).payment_status !== "paid") {
        await captureCodOnDelivered(admin, {
          restaurantId: d.restaurant_id as string,
          orderId: d.order_id as string,
          deliveryId: d.id,
          actorRole: "driver",
        });
      }
    } catch (e) {
      console.error("[delivery] captureCodOnDelivered error", e);
      // Q2 — cash-control: a delivered COD order failed to enter the ledger.
      await recordCriticalAlert(admin, {
        type: "cod_capture_failed",
        restaurantId: d.restaurant_id as string,
        detail: e instanceof Error ? e.message : String(e),
        context: { orderId: d.order_id, deliveryId: d.id },
      });
    }
  }

  // When the order goes out, send the customer their live tracking link.
  if (target === "on_the_way" && d.customer_token) {
    try {
      const s = await loadOrderSummary(admin, d.order_id as string);
      if (s?.customerPhone) {
        const link = `${appBaseUrl()}/t/${d.customer_token}`;
        // DRYRUN-2 (F1): customer track-link goes out from the TENANT's number
        // when configured; env fallback when unconfigured/partial → unchanged.
        await runWithTenantWhatsAppCreds(admin, d.restaurant_id as string, () =>
          sendWhatsAppText({
            to: String(s.customerPhone),
            text: `🛵 طلبك في الطريق إليك!\nتابع التوصيل مباشرةً من هنا:\n${link}`,
          })
        );
      }
    } catch (e) {
      console.error("[delivery] customer track link send error", e);
    }
  }
  return { ok: true, status: target };
}

// --- location push (driver token) -------------------------------------------
export async function pushLocationByToken(
  admin: SupabaseClient,
  tok: string,
  lat: number,
  lng: number
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, error: "bad_coords" };
  }
  const { data: d } = await admin.from("deliveries").select("id,expires_at,status").eq("driver_token", tok).maybeSingle();
  if (!d) return { ok: false, error: "not_found" };
  if (isExpired(d as { expires_at?: string | null; status?: string })) return { ok: false, error: "completed" };
  await admin.from("delivery_locations").insert({ delivery_id: d.id, lat, lng });
  return { ok: true };
}

// ============================================================================
// WO-DELIVERY-D2 — multi-order RUNS (grouping over existing delivery rows).
// A run is created ONLY on the flag-gated run-assign path; single-delivery assign
// (assignDriver) is untouched. Each delivery keeps its own tokens/status/COD row —
// a run just adds run_id + stop_order + a run_token that authenticates the /d run
// page; per-stop ACTIONS still use each delivery's own driver_token.
// ============================================================================

export interface RunStop {
  deliveryId: string;
  /** Per-stop action auth: the driver owns the whole run, so each stop's own
   *  driver_token is exposed to the run page for status/location/COD calls. */
  driverToken: string | null;
  stopOrder: number | null;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  /** Area label — the zone name (never the item list). */
  area: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** DISTINCT ORDER LINES only — never item names/notes/modifiers (safety law). */
  itemsCount: number;
  codAmount: number;
  currency: string;
  codCollected: boolean;
}

export interface RunAssignResult {
  runId: string;
  runLink: string;
  stops: { deliveryId: string; driverLink: string; customerLink: string }[];
  whatsapp: string;
}

/**
 * Assign several deliveries to ONE driver as a run (spec §3). Enforces the cap in
 * the ENGINE (not the UI): more than RUN_CAP deliveries → throws run_cap_exceeded.
 * Mints a run_token for the page + (re)mints each delivery's tokens, sets run_id +
 * stop_order (input order), flips each to `assigned`, and sends the driver ONE run
 * dispatch. Preserves each delivery's existing token/status/COD machinery.
 */
export async function assignDeliveriesToRun(
  admin: SupabaseClient,
  args: { restaurantId: string; driverId: string; deliveryIds: string[] }
): Promise<RunAssignResult> {
  const { restaurantId, driverId } = args;
  const ids = [...new Set(args.deliveryIds)].filter(Boolean);
  if (!withinRunCap(ids.length)) throw new Error("run_cap_exceeded");

  const { data: driver } = await admin.from("drivers").select("id,name,phone,active").eq("id", driverId).eq("restaurant_id", restaurantId).maybeSingle();
  if (!driver) throw new Error("driver_not_found");

  const { data: dels } = await admin
    .from("deliveries")
    .select("id,order_id,driver_token,customer_token,status")
    .in("id", ids)
    .eq("restaurant_id", restaurantId);
  if (!dels || dels.length !== ids.length) throw new Error("delivery_not_found");

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const runTok = token();
  const { data: run, error: runErr } = await admin
    .from("delivery_runs")
    .insert({ restaurant_id: restaurantId, driver_id: driverId, status: "active", run_token: runTok, expires_at: expiresAt })
    .select("id")
    .single();
  if (runErr || !run) throw new Error("run_create_failed");
  const runId = run.id as string;

  const base = appBaseUrl();
  const byId = new Map(dels.map((d) => [d.id as string, d]));
  const stops: { deliveryId: string; driverLink: string; customerLink: string }[] = [];
  let stopOrder = 1;
  for (const id of ids) {
    const del = byId.get(id)!;
    const driverTok = (del.driver_token as string) || token();
    const customerTok = (del.customer_token as string) || token();
    await admin
      .from("deliveries")
      .update({ driver_id: driverId, run_id: runId, stop_order: stopOrder, status: "assigned", driver_token: driverTok, customer_token: customerTok, token_used: false, assigned_at: now, expires_at: expiresAt, updated_at: now })
      .eq("id", id);
    await admin.from("delivery_events").insert({ delivery_id: id, type: "assigned", payload: { driverId, driverName: driver.name, runId, stopOrder } });
    stops.push({ deliveryId: id, driverLink: `${base}/d/${driverTok}`, customerLink: `${base}/t/${customerTok}` });
    stopOrder++;
  }

  const runLink = `${base}/d/r/${runTok}`;
  // One run dispatch — count + total COD only (never item details).
  let whatsapp = "skipped";
  try {
    let codTotal = 0;
    let currency = "";
    for (const id of ids) {
      const s = await loadOrderSummary(admin, byId.get(id)!.order_id as string);
      if (s) { codTotal += Number(s.total) || 0; currency = String(s.currency || currency); }
    }
    const body =
      `🛵 رحلة توصيل جديدة\n` +
      `${ids.length} طلبات في رحلة واحدة\n` +
      (codTotal ? `إجمالي التحصيل: ${codTotal} ${currency}\n` : "") +
      `\nافتح قائمة التوصيل وحدّث حالة كل طلب وشارك موقعك:\n${runLink}`;
    const res = await runWithTenantWhatsAppCreds(admin, restaurantId, () =>
      sendWhatsAppText({ to: String(driver.phone), text: body })
    );
    whatsapp = res.status;
  } catch (e) {
    console.error("[delivery] run dispatch send error", e);
    whatsapp = "failed";
  }

  return { runId, runLink, stops, whatsapp };
}

/**
 * Load a run + its ordered stops by run_token (the /d run page auth). The stop
 * projection is deliberately NARROW — customer name/area/count/COD/coords ONLY.
 * It NEVER carries item names, notes, modifiers, or any allergen/health data
 * (safety law — allergen data lives in menu_items/customer_memory, neither touched).
 */
export async function getRunByToken(admin: SupabaseClient, runToken: string): Promise<{ run: { id: string; driverName: string | null; status: string; expired: boolean }; stops: RunStop[] } | null> {
  const { data: run } = await admin
    .from("delivery_runs")
    .select("id,restaurant_id,status,expires_at,drivers(name)")
    .eq("run_token", runToken)
    .maybeSingle();
  if (!run) return null;

  const { data: dels } = await admin
    .from("deliveries")
    .select("id,order_id,driver_token,status,stop_order,cod_collected")
    .eq("run_id", run.id)
    .order("stop_order", { ascending: true });

  const rows = (dels ?? []) as { id: string; order_id: string; driver_token: string | null; status: string; stop_order: number | null; cod_collected: boolean }[];
  const orderIds = rows.map((r) => r.order_id);
  // Batched lookups (name + payment) so the projection stays cheap for ≤3 stops.
  const payById = new Map<string, { payment_status?: string }>();
  const nameByCustomer = new Map<string, string>();
  if (orderIds.length) {
    const { data: ords } = await admin.from("orders").select("id,payment_status,customer_id").in("id", orderIds);
    const custIds: string[] = [];
    for (const o of (ords ?? []) as { id: string; payment_status?: string; customer_id?: string | null }[]) {
      payById.set(o.id, { payment_status: o.payment_status });
      if (o.customer_id) custIds.push(o.customer_id);
    }
    if (custIds.length) {
      const { data: custs } = await admin.from("customers").select("id,name").in("id", [...new Set(custIds)]);
      for (const c of (custs ?? []) as { id: string; name?: string | null }[]) if (c.name) nameByCustomer.set(c.id, c.name);
    }
  }

  const stops: RunStop[] = [];
  for (const r of rows) {
    const s = await loadOrderSummary(admin, r.order_id);
    const paid = payById.get(r.order_id)?.payment_status === "paid";
    const total = Number(s?.total) || 0;
    // items ONLY as a count — the array itself is never forwarded to the client.
    const itemsCount = Array.isArray(s?.items) ? (s!.items as unknown[]).length : 0;
    const customerId = (s as { customer_id?: string } | null)?.customer_id;
    stops.push({
      deliveryId: r.id,
      driverToken: r.driver_token,
      stopOrder: r.stop_order,
      status: r.status,
      customerName: customerId ? nameByCustomer.get(customerId) ?? null : null,
      customerPhone: s?.customerPhone ?? null,
      area: s?.zoneName ?? null,
      address: (s?.address as string) ?? null,
      lat: typeof s?.lat === "number" ? (s!.lat as number) : null,
      lng: typeof s?.lng === "number" ? (s!.lng as number) : null,
      itemsCount,
      codAmount: paid ? 0 : total,
      currency: String(s?.currency ?? ""),
      codCollected: !!r.cod_collected,
    });
  }

  const expired = !!(run.expires_at && new Date(run.expires_at as string).getTime() < Date.now());
  const driverName = (run as { drivers?: { name?: string } | null }).drivers?.name ?? null;
  return { run: { id: run.id as string, driverName, status: String(run.status), expired }, stops };
}

/**
 * Per-stop COD «حصّلت» flag (WO-DELIVERY-D2). Sets the UI/audit state on the
 * delivery row ONLY — it complements, never replaces, the cod_collections ledger
 * (captureCodOnDelivered on `delivered` stays the money record). Token-scoped
 * (each stop's own driver_token).
 */
export async function setCodCollectedByToken(
  admin: SupabaseClient,
  tok: string,
  collected: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { data: d } = await admin.from("deliveries").select("id,status").eq("driver_token", tok).maybeSingle();
  if (!d) return { ok: false, error: "not_found" };
  // DEPLOY-SAFETY: cod_collected ships in the PREPARE-ONLY 0082 migration. If it is
  // not applied yet, the UPDATE rejects with 42703 — catch it and no-op gracefully
  // (never a 500). This endpoint is only reached from the run stop-list, which only
  // exists once 0082 is applied, so pre-migration this path is effectively unused.
  const upd = await admin.from("deliveries").update({ cod_collected: !!collected, updated_at: new Date().toISOString() }).eq("id", d.id);
  if (upd.error) {
    if (isUndefinedColumnError(upd.error)) return { ok: false, error: "not_available" };
    return { ok: false, error: "update_failed" };
  }
  await admin.from("delivery_events").insert({ delivery_id: d.id, type: `cod_collected:${!!collected}`, payload: {} });
  return { ok: true };
}
