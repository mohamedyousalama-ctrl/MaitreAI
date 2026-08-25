// ============================================================================
// Kivo Delivery Network — Day 2 driver presence persistence (SERVER ONLY).
// Token-scoped RPCs on isolated schema. The presence URL is NOT a raw driver
// id; writes do not go through a delivery row.
// ============================================================================

import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";
import { isPresenceStatus, type PresenceStatus } from "@/lib/delivery/driver-presence";

export interface PresenceRow {
  name: string;
  vehicle: string | null;
  status: PresenceStatus;
  lat: number | null;
  lng: number | null;
  recorded_at: string | null;
  last_seen_at: string | null;
  page_open_only: boolean;
}

function presenceRpcClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

function asPresenceRow(raw: unknown): PresenceRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const status = o.status === "online" || o.status === "offline" ? o.status : null;
  if (!status) return null;
  const name = typeof o.name === "string" ? o.name : "";
  return {
    name,
    vehicle: typeof o.vehicle === "string" ? o.vehicle : null,
    status,
    lat: typeof o.lat === "number" && Number.isFinite(o.lat) ? o.lat : null,
    lng: typeof o.lng === "number" && Number.isFinite(o.lng) ? o.lng : null,
    recorded_at: typeof o.recorded_at === "string" ? o.recorded_at : null,
    last_seen_at: typeof o.last_seen_at === "string" ? o.last_seen_at : null,
    page_open_only: o.page_open_only !== false,
  };
}

export async function getPresenceByToken(token: string): Promise<PresenceRow | null> {
  const db = presenceRpcClient();
  if (!db) throw new Error("not_configured");
  const { data, error } = await db.rpc("kdn_presence_get", { p_token: token });
  if (error) throw error;
  return asPresenceRow(data);
}

export async function setPresenceStatusByToken(
  token: string,
  status: string
): Promise<{ ok: true; row: PresenceRow } | { ok: false; error: string }> {
  if (!isPresenceStatus(status)) return { ok: false, error: "bad_status" };
  const db = presenceRpcClient();
  if (!db) throw new Error("not_configured");
  const { data, error } = await db.rpc("kdn_presence_set_status", { p_token: token, p_status: status });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.ok === false) return { ok: false, error: String(payload.error ?? "not_found") };
  const row = asPresenceRow({
    name: "",
    vehicle: null,
    status: payload.status,
    lat: payload.lat,
    lng: payload.lng,
    recorded_at: payload.recorded_at,
    last_seen_at: payload.last_seen_at,
    page_open_only: true,
  });
  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, row };
}

export async function pushPresenceLocationByToken(
  token: string,
  lat: number,
  lng: number
): Promise<{ ok: true; row: PresenceRow } | { ok: false; error: string }> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, error: "bad_coords" };
  }
  const db = presenceRpcClient();
  if (!db) throw new Error("not_configured");
  const { data, error } = await db.rpc("kdn_presence_push_location", {
    p_token: token,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.ok === false) return { ok: false, error: String(payload.error ?? "not_found") };
  const row = asPresenceRow({
    name: "",
    vehicle: null,
    status: payload.status ?? "online",
    lat: payload.lat,
    lng: payload.lng,
    recorded_at: payload.recorded_at,
    last_seen_at: payload.last_seen_at,
    page_open_only: true,
  });
  if (!row) return { ok: false, error: "not_found" };
  return { ok: true, row };
}

/** Session-scoped mint/read of the presence token. Never logs the token. */
export async function ensurePresenceToken(
  db: SupabaseClient,
  driverId: string
): Promise<string | null> {
  const { data, error } = await db.rpc("kdn_ensure_presence_token", { p_driver_id: driverId });
  if (error) throw error;
  return typeof data === "string" && data.length >= 16 ? data : null;
}

export function presencePublicView(row: PresenceRow) {
  return {
    name: row.name,
    vehicle: row.vehicle,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    recorded_at: row.recorded_at,
    last_seen_at: row.last_seen_at,
    page_open_only: true as const,
  };
}
