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
import { captureCodOnDelivered } from "@/lib/db/cod";

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
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.maitre.chat").replace(/\/$/, "");
}

export function isExpired(d: { expires_at?: string | null; status?: string }): boolean {
  if (d.status === "delivered" || d.status === "cancelled" || d.status === "failed") return true;
  if (d.expires_at && new Date(d.expires_at).getTime() < Date.now()) return true;
  return false;
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
    .select("order_number,items,total,currency,address,zone_id,fulfillment,conversation_id,customer_id,restaurant_id")
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
    const res = await sendWhatsAppText({ to: String(driver.phone), text: body });
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

export async function getDeliveryByCustomerToken(admin: SupabaseClient, tok: string) {
  const { data: d } = await admin
    .from("deliveries")
    .select("id,order_id,restaurant_id,status,assigned_at,picked_up_at,delivered_at,expires_at,drivers(name)")
    .eq("customer_token", tok)
    .maybeSingle();
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

  const patch: Record<string, unknown> = { status: target, updated_at: new Date().toISOString() };
  if (target === "picked_up") patch.picked_up_at = new Date().toISOString();
  if (target === "delivered") {
    patch.delivered_at = new Date().toISOString();
    patch.token_used = true;
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
    }
  }

  // When the order goes out, send the customer their live tracking link.
  if (target === "on_the_way" && d.customer_token) {
    try {
      const s = await loadOrderSummary(admin, d.order_id as string);
      if (s?.customerPhone) {
        const link = `${appBaseUrl()}/t/${d.customer_token}`;
        await sendWhatsAppText({
          to: String(s.customerPhone),
          text: `🛵 طلبك في الطريق إليك!\nتابع التوصيل مباشرةً من هنا:\n${link}`,
        });
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
