// WO-DRIVER-ADMIN-WRITES proof.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-driver-admin-writes.test.ts

import { readFileSync } from "node:fs";
import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import { addDriver, listDrivers, setDriverActive, updateDriver } from "../lib/db/delivery.ts";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

async function catchMessage(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

type DriverRow = { id: string; restaurant_id: string; name: string; phone: string; vehicle: string | null; active: boolean; created_at: string };
type ClientKind = "member" | "admin";

function makeClient(kind: ClientKind, rows: DriverRow[], calls: Array<{ kind: ClientKind; op: string; table: string; payload?: Record<string, unknown>; filters: Record<string, unknown> }>) {
  return {
    from(table: string) {
      const state = { op: "select", payload: null as Record<string, unknown> | null, filters: {} as Record<string, unknown>, selected: null as string | null };
      const record = () => calls.push({ kind, op: state.op, table, payload: state.payload ?? undefined, filters: { ...state.filters } });
      const finish = async (single = false) => {
        record();
        if (table !== "drivers") return { data: single ? null : [], error: null };
        if ((state.op === "insert" || state.op === "update") && kind === "member") {
          return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
        }
        if (state.op === "insert") {
          const row = {
            id: `driver-${rows.length + 1}`,
            active: true,
            created_at: "2026-07-14T00:00:00.000Z",
            ...(state.payload ?? {}),
          } as DriverRow;
          rows.push(row);
          return { data: row, error: null };
        }
        if (state.op === "update") {
          const updated: DriverRow[] = [];
          for (const row of rows) {
            if (state.filters.id && row.id !== state.filters.id) continue;
            if (state.filters.restaurant_id && row.restaurant_id !== state.filters.restaurant_id) continue;
            Object.assign(row, state.payload ?? {});
            updated.push(row);
          }
          return { data: state.selected ? updated.map((row) => ({ id: row.id })) : null, error: null };
        }
        const filtered = rows.filter((row) => !state.filters.restaurant_id || row.restaurant_id === state.filters.restaurant_id);
        return { data: single ? (filtered[0] ?? null) : filtered, error: null };
      };
      const api: Record<string, unknown> = {
        select(cols?: string) { state.selected = cols ?? null; return api; },
        order() { return api; },
        eq(k: string, v: unknown) { state.filters[k] = v; return api; },
        insert(payload: Record<string, unknown>) { state.op = "insert"; state.payload = payload; return api; },
        update(payload: Record<string, unknown>) { state.op = "update"; state.payload = payload; return api; },
        single() { return finish(true); },
        maybeSingle() { return finish(true); },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return finish(false).then(resolve, reject);
        },
      };
      return api;
    },
  };
}

const rows: DriverRow[] = [
  { id: "driver-1", restaurant_id: "r1", name: "Old Driver", phone: "100", vehicle: null, active: true, created_at: "2026-07-14T00:00:00.000Z" },
];
const calls: Array<{ kind: ClientKind; op: string; table: string; payload?: Record<string, unknown>; filters: Record<string, unknown> }> = [];
const member = makeClient("member", rows, calls);
const admin = makeClient("admin", rows, calls);

const memberDrivers = await listDrivers(member as never, "r1");
ok("member reads still work after 0091", Array.isArray(memberDrivers) && memberDrivers.length === 1);

const directMemberInsert = await (member as any)
  .from("drivers")
  .insert({ restaurant_id: "r1", name: "Blocked", phone: "101" })
  .select("id")
  .single();
ok("CONTROL: member driver insert is blocked by simulated 0091", !!directMemberInsert.error);

const directMemberUpdate = await (member as any)
  .from("drivers")
  .update({ active: false })
  .eq("id", "driver-1")
  .eq("restaurant_id", "r1");
ok("CONTROL: member driver update is blocked by simulated 0091", !!directMemberUpdate.error);

__setTestAdminClient(admin);
try {
  const added = await addDriver(member as never, "r1", { name: "New Driver", phone: "200", vehicle: "bike" });
  ok("addDriver succeeds through service-role admin path", !!added && (added as { name?: string }).name === "New Driver");

  await setDriverActive(member as never, "r1", "driver-1", false);
  ok("setDriverActive succeeds through service-role admin path", rows.find((row) => row.id === "driver-1")?.active === false);

  await updateDriver(member as never, "r1", "driver-1", { name: "Updated Driver", phone: "300", vehicle: "car" });
  const updated = rows.find((row) => row.id === "driver-1");
  ok("updateDriver succeeds through service-role admin path", updated?.name === "Updated Driver" && updated.phone === "300" && updated.vehicle === "car");

  const crossActiveErr = await catchMessage(() => setDriverActive(member as never, "other-tenant", "driver-1", true));
  const crossUpdateErr = await catchMessage(() => updateDriver(member as never, "other-tenant", "driver-1", { name: "Cross Tenant", phone: "999", vehicle: null }));
  ok("cross-tenant setDriverActive throws row-count mismatch", crossActiveErr?.includes("KIVO_ROW_COUNT_MISMATCH") === true);
  ok("cross-tenant updateDriver throws row-count mismatch", crossUpdateErr?.includes("KIVO_ROW_COUNT_MISMATCH") === true);
  ok("cross-tenant restaurant_id filter does not write", updated?.active === false && updated?.name === "Updated Driver" && updated?.phone === "300");
} finally {
  __setTestAdminClient(undefined);
}

const adminWrites = calls.filter((call) => call.kind === "admin" && (call.op === "insert" || call.op === "update"));
ok("corrected writes use admin client, not member client", adminWrites.length >= 5);
ok("addDriver writes restaurant_id into inserted row", adminWrites.some((call) => call.op === "insert" && call.payload?.restaurant_id === "r1"));
ok("setDriverActive keeps tenant-scoped restaurant filter", adminWrites.some((call) => call.op === "update" && call.payload?.active === false && call.filters.restaurant_id === "r1"));
ok("updateDriver keeps tenant-scoped restaurant filter", adminWrites.some((call) => call.op === "update" && call.payload?.name === "Updated Driver" && call.filters.restaurant_id === "r1"));

const delivery = readFileSync("lib/db/delivery.ts", "utf8");
const driversRoute = readFileSync("app/api/drivers/route.ts", "utf8");
const driverRoute = readFileSync("app/api/drivers/[id]/route.ts", "utf8");

ok("delivery service imports createAdminClient", /import \{ createAdminClient \} from "@\/lib\/supabase\/admin";/.test(delivery));
ok("driver helper fails cleanly when admin is unavailable", /if \(!admin\) throw new Error\("not_configured"\);/.test(delivery));
ok("routes still require tenant auth", /requireTenant\(\)/.test(driversRoute) && /requireTenant\(\)/.test(driverRoute));
ok("routes still pass tenant.restaurantId into driver writes", /addDriver\(supabase, tenant\.restaurantId/.test(driversRoute) && /setDriverActive\(supabase, tenant\.restaurantId/.test(driverRoute) && /updateDriver\(supabase, tenant\.restaurantId/.test(driverRoute));
ok("routes map not_configured to 503", /status = e instanceof Error && e\.message === "not_configured" \? 503 : 502/.test(driversRoute) && /status = e instanceof Error && e\.message === "not_configured" \? 503 : 502/.test(driverRoute));

console.log(`\nDRIVER-ADMIN-WRITES PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
