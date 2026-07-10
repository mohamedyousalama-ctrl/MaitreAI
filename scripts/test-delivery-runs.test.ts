// ============================================================================
// WO-DELIVERY-D2 — red-first proofs for delivery RUNS. (CI: agent-eval + stacking.)
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-delivery-runs.test.ts
// Covers (spec §3): cap rejects the 4th; suggestion groups same-zone oldest-first;
// the driver run payload EXCLUDES item names/notes/allergen data (the SAFETY pin);
// and (flag-off is proven by the existing delivery suite staying green + the /t gate
// being a no-op when run_id is null).
// ============================================================================
import { RUN_CAP, withinRunCap, suggestRunGrouping, isActiveLeg } from "../lib/delivery/runs.ts";
import { assignDeliveriesToRun, getRunByToken, getDeliveryByCustomerToken, isUndefinedColumnError } from "../lib/db/delivery.ts";

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};
const ok = (n: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ❌ ${n}: expected true`); } };
const deepEq = (n: string, a: unknown, e: unknown) => eq(n, JSON.stringify(a), JSON.stringify(e));

// ── CAP ───────────────────────────────────────────────────────────────────────
eq("RUN_CAP is 3", RUN_CAP, 3);
ok("cap allows 1", withinRunCap(1));
ok("cap allows 3", withinRunCap(3));
ok("cap REJECTS 4", !withinRunCap(4));
ok("cap rejects 0", !withinRunCap(0));

// The engine rejects a 4-delivery run BEFORE any DB write (guard is first). Pass an
// admin that throws if touched — assignDeliveriesToRun must throw run_cap_exceeded
// without ever calling it.
{
  const explodingAdmin = { from() { throw new Error("DB must not be touched when cap exceeded"); } } as never;
  let threw: string | null = null;
  try {
    await assignDeliveriesToRun(explodingAdmin, { restaurantId: "r1", driverId: "dr1", deliveryIds: ["a", "b", "c", "d"] });
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  eq("assignDeliveriesToRun(4) → run_cap_exceeded, no DB touch", threw, "run_cap_exceeded");
}

// ── /t ACTIVE-LEG gate ──────────────────────────────────────────────────────────
ok("single delivery (not in run) → location shown (byte-identical)", isActiveLeg(false, "assigned"));
ok("single delivery on_the_way → shown", isActiveLeg(false, "on_the_way"));
ok("run stop on_the_way → shown (active leg)", isActiveLeg(true, "on_the_way"));
ok("run stop assigned → HIDDEN (not the active leg)", !isActiveLeg(true, "assigned"));
ok("run stop picked_up → HIDDEN", !isActiveLeg(true, "picked_up"));
ok("run stop delivered → HIDDEN", !isActiveLeg(true, "delivered"));

// ── SUGGESTION: same-zone, oldest-first, chunked at cap ─────────────────────────
{
  // Two zones far apart (not adjacent). zoneA has 4 deliveries → one group of 3
  // (oldest first) + a leftover of 1 (dropped, <2). zoneB has 2 → one group.
  const zones = [
    { id: "zA", centerLat: 30.0, centerLng: 31.0 },
    { id: "zB", centerLat: 40.0, centerLng: 50.0 },
  ];
  const dels = [
    { id: "a4", zoneId: "zA", createdAt: 4000 },
    { id: "a1", zoneId: "zA", createdAt: 1000 },
    { id: "b2", zoneId: "zB", createdAt: 2000 },
    { id: "a3", zoneId: "zA", createdAt: 3000 },
    { id: "b5", zoneId: "zB", createdAt: 5000 },
    { id: "a2", zoneId: "zA", createdAt: 2000 },
  ];
  const groups = suggestRunGrouping(dels, zones);
  const zAgroup = groups.find((g) => g.deliveryIds.includes("a1"));
  ok("zoneA group exists", !!zAgroup);
  deepEq("zoneA group is oldest-first, capped at 3", zAgroup?.deliveryIds, ["a1", "a2", "a3"]);
  const zBgroup = groups.find((g) => g.deliveryIds.includes("b2"));
  deepEq("zoneB group is oldest-first", zBgroup?.deliveryIds, ["b2", "b5"]);
  ok("no group exceeds the cap", groups.every((g) => g.deliveryIds.length <= RUN_CAP));
  ok("no singleton groups", groups.every((g) => g.deliveryIds.length >= 2));
}
{
  // Adjacent zones (centers within ADJACENCY_KM) merge into one cluster.
  const zones = [
    { id: "z1", centerLat: 30.0000, centerLng: 31.0000 },
    { id: "z2", centerLat: 30.0100, centerLng: 31.0100 }, // ~1.5km from z1 → adjacent
  ];
  const dels = [
    { id: "d1", zoneId: "z1", createdAt: 1000 },
    { id: "d2", zoneId: "z2", createdAt: 2000 },
  ];
  const groups = suggestRunGrouping(dels, zones);
  eq("adjacent zones merge into ONE group", groups.length, 1);
  deepEq("merged group oldest-first", groups[0]?.deliveryIds, ["d1", "d2"]);
}
{
  // A lone delivery is never suggested (no run needed).
  const groups = suggestRunGrouping([{ id: "solo", zoneId: "z1", createdAt: 1 }], [{ id: "z1" }]);
  eq("single delivery → no suggestion", groups.length, 0);
}

// ── SAFETY PIN: the driver run payload NEVER carries item names/notes/allergens ──
{
  // A poisoned order: an item whose NAME + notes contain allergen text. If any of it
  // leaks into the run stop projection, this test fails loudly.
  const POISON_NAME = "برجر بالمكسرات";
  const POISON_NOTE = "حساسية من الفول السوداني";
  const orderFull = {
    id: "o1", order_number: "1001",
    items: [
      { quantity: 2, name: POISON_NAME, notes: POISON_NOTE, modifiers: [{ name: "إكسترا مكسرات" }] },
      { quantity: 1, name: "بطاطس", notes: "" },
    ],
    total: 120, currency: "EGP", address: "شارع ١", lat: 30, lng: 31,
    zone_id: "z1", fulfillment: "delivery", conversation_id: null, customer_id: "c1", restaurant_id: "r1",
    payment_status: "pending",
  };
  const run = { id: "run1", restaurant_id: "r1", status: "active", expires_at: "2999-01-01T00:00:00Z", drivers: { name: "سائق" } };
  const dels = [{ id: "del1", order_id: "o1", driver_token: "tokA", status: "assigned", stop_order: 1, cod_collected: false }];
  const cust = { id: "c1", name: "أحمد", phone: "20100" };

  const rows = (table: string, mode: "one" | "list") => {
    if (table === "delivery_runs") return run;
    if (table === "deliveries") return dels;
    if (table === "orders") return mode === "one" ? orderFull : [{ id: "o1", payment_status: orderFull.payment_status, customer_id: "c1" }];
    if (table === "customers") return mode === "list" ? [{ id: "c1", name: cust.name }] : cust;
    if (table === "delivery_zones") return { name: "المعادي" };
    return null;
  };
  const admin = {
    from(table: string) {
      const api: Record<string, unknown> = {
        select() { return api; },
        eq() { return api; },
        in() { return Promise.resolve({ data: rows(table, "list") }); },
        order() { return Promise.resolve({ data: rows(table, "list") }); },
        maybeSingle() { return Promise.resolve({ data: rows(table, "one") }); },
        single() { return Promise.resolve({ data: rows(table, "one") }); },
      };
      return api;
    },
  } as never;

  const result = await getRunByToken(admin, "runtok");
  ok("run resolved", !!result && result.stops.length === 1);
  const stop = result!.stops[0];
  const blob = JSON.stringify(stop);

  // The safety assertions — the whole point of the pin.
  ok("NO item name leaks", !blob.includes("برجر") && !blob.includes(POISON_NAME));
  ok("NO allergen note leaks", !blob.includes("حساسية") && !blob.includes(POISON_NOTE) && !blob.includes("الفول"));
  ok("NO modifiers leak", !blob.includes("مكسرات"));
  ok("NO raw items array on the stop", !("items" in (stop as object)) && !blob.includes("\"items\""));
  ok("NO notes key on the stop", !blob.includes("notes"));

  // The safe fields DO surface.
  eq("itemsCount = distinct lines (2)", stop.itemsCount, 2);
  eq("customerName surfaced", stop.customerName, "أحمد");
  eq("area = zone name", stop.area, "المعادي");
  eq("codAmount = order total (unpaid)", stop.codAmount, 120);
  eq("codCollected flag surfaced", stop.codCollected, false);
  eq("per-stop driver token surfaced for actions", stop.driverToken, "tokA");

  // Exact key set — a regression that adds a leaky field trips this.
  deepEq("stop key set is the narrow projection", Object.keys(stop).sort(), [
    "address", "area", "codAmount", "codCollected", "currency", "customerName", "customerPhone",
    "deliveryId", "driverToken", "itemsCount", "lat", "lng", "status", "stopOrder",
  ].sort());
}

// ── P1 DEPLOY-SAFETY: /t survives 0082 being UNAPPLIED (column-missing) ──────────
ok("42703 is an undefined-column error", isUndefinedColumnError({ code: "42703" }));
ok("message-form undefined-column detected", isUndefinedColumnError({ message: 'column deliveries.run_id does not exist' }));
ok("unrelated error is NOT undefined-column", !isUndefinedColumnError({ code: "23505", message: "duplicate key" }));
ok("null error is not undefined-column", !isUndefinedColumnError(null));

// Fake PostgREST client: the deliveries select branches on whether run_id is asked for.
function makeTrackAdmin(runAware: "ok" | "missing") {
  const order = { order_number: "1", items: [{ quantity: 1, name: "x" }], total: 50, currency: "EGP", address: "a", lat: 30, lng: 31, zone_id: "z1", customer_id: "c1" };
  const base = { id: "d1", order_id: "o1", restaurant_id: "r1", status: "on_the_way", assigned_at: null, picked_up_at: null, delivered_at: null, expires_at: "2999-01-01T00:00:00Z", drivers: { name: "x" } };
  const withRun = { ...base, run_id: "run1" };
  const resolveOne = (table: string, sel: string) => {
    if (table === "deliveries") {
      if (sel.includes("run_id")) {
        return runAware === "missing"
          ? { data: null, error: { code: "42703", message: "column deliveries.run_id does not exist" } }
          : { data: withRun, error: null };
      }
      return { data: base, error: null }; // legacy select (no run_id)
    }
    if (table === "orders") return { data: order, error: null };
    if (table === "customers") return { data: { phone: "20100" }, error: null };
    if (table === "delivery_zones") return { data: { name: "المعادي" }, error: null };
    if (table === "delivery_locations") return { data: null, error: null };
    return { data: null, error: null };
  };
  return {
    from(table: string) {
      const st = { sel: "" };
      const api: Record<string, unknown> = {
        select(s: string) { st.sel = String(s); return api; },
        eq() { return api; },
        order() { return api; },
        limit() { return api; },
        maybeSingle() { return Promise.resolve(resolveOne(table, st.sel)); },
        single() { return Promise.resolve(resolveOne(table, st.sel)); },
      };
      return api;
    },
  } as never;
}
{
  // Happy path (0082 applied) — run_id surfaces. (Runs first so the process cache is
  // "has run_id"; the missing-column case below still probes and then falls back.)
  const okRes = await getDeliveryByCustomerToken(makeTrackAdmin("ok"), "tok");
  ok("0082 applied → delivery resolves", !!okRes);
  eq("0082 applied → run_id present", (okRes!.delivery as { run_id?: string }).run_id, "run1");
}
{
  // 0082 UNAPPLIED — the run-aware select is rejected; /t must NOT 404. It falls back
  // to the legacy select, run_id absent → isActiveLeg(false) → byte-identical to today.
  const res = await getDeliveryByCustomerToken(makeTrackAdmin("missing"), "tok");
  ok("0082 unapplied → /t still resolves the delivery (no 404)", !!res);
  eq("0082 unapplied → run_id absent (legacy shape)", (res!.delivery as { run_id?: string }).run_id, undefined);
  ok("0082 unapplied → active-leg gate is a no-op (location would show, byte-identical)", isActiveLeg((res!.delivery as { run_id?: string }).run_id != null, String((res!.delivery as { status?: string }).status)));
}

console.log(`\nDELIVERY-RUNS UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
