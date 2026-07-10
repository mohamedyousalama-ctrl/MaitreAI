// ============================================================================
// WO-DELIVERY-D1 — red-first proofs for geography + branch routing.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-delivery-geo.test.ts
// Covers (spec §1/§2): pin inside zone A → branch A; overlap → nearest branch;
// outside all zones → soft flow + miss payload; pickup → branch selection; money is
// engine-computed (zone fee, never distance); flag-OFF tool defs byte-identical; and
// the adapter drops a location pin from the main normalizer while the geo extractor
// captures it.
// ============================================================================
import { haversineKm, zoneContainsPin, routeDeliveryPin, matchZonesForPin } from "../lib/delivery/geo.ts";
import { applyPinRouting } from "../lib/delivery/routing.ts";
import { executeTool, emptyDraft, ORDER_TOOLS, orderToolsWithGeo, type ToolContext } from "../lib/ai/tools.ts";
import { DEFAULT_PAYMENT_CONFIG } from "../lib/payments/config.ts";
import { normalizeWhatsAppInbound, normalizeWhatsAppLocations } from "../lib/messaging/adapters/whatsapp.ts";
import type { DeliveryArea, Branch } from "../lib/types.ts";

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};
const ok = (n: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ❌ ${n}: expected true`); } };
const near = (n: string, a: number, e: number, tol = 0.05) => {
  if (Math.abs(a - e) <= tol) pass++; else { fail++; console.log(`  ❌ ${n}: got ${a}, expected ~${e}`); }
};

// ── fixtures: two overlapping circular zones, each with its own branch ────────
const ZONE_A: DeliveryArea = {
  id: "zoneA", name: "المعادي", branchId: "brA",
  minOrder: 0, deliveryFee: 20, estimatedTime: "30 دقيقة", active: true,
  centerLat: 30.0444, centerLng: 31.2357, radiusKm: 2,
};
const ZONE_B: DeliveryArea = {
  id: "zoneB", name: "مدينة نصر", branchId: "brB",
  minOrder: 0, deliveryFee: 30, estimatedTime: "40 دقيقة", active: true,
  centerLat: 30.0600, centerLng: 31.2500, radiusKm: 2,
};
const ZONES = [ZONE_A, ZONE_B];
const mkBranch = (id: string, name: string, lat: number, lng: number): Branch => ({
  id, name, address: "", hours: "", whatsappNumber: "", open: true, notes: "",
  whatsappConnected: false, phone: "", lat, lng,
});
const BRANCHES = [mkBranch("brA", "فرع المعادي", 30.0444, 31.2357), mkBranch("brB", "فرع مدينة نصر", 30.0600, 31.2500)];

// ── haversine sanity: 1° of latitude ≈ 111.19 km ─────────────────────────────
near("haversine 1° lat ≈ 111.19km", haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 111.19, 0.5);
eq("haversine identity = 0", haversineKm({ lat: 30, lng: 31 }, { lat: 30, lng: 31 }), 0);

// ── point-in-radius ──────────────────────────────────────────────────────────
ok("A center is inside A", zoneContainsPin({ ...ZONE_A, id: "zoneA" }, { lat: 30.0444, lng: 31.2357 }));
ok("far pin is outside A", !zoneContainsPin(ZONE_A, { lat: 30.5, lng: 31.8 }));
ok("name-only zone (no geometry) contains nothing", !zoneContainsPin({ ...ZONE_A, centerLat: undefined, centerLng: undefined, radiusKm: undefined }, { lat: 30.0444, lng: 31.2357 }));
ok("inactive zone contains nothing", !zoneContainsPin({ ...ZONE_A, active: false }, { lat: 30.0444, lng: 31.2357 }));

// ── routeDeliveryPin: pin inside ONLY zone A → branch A ───────────────────────
{
  const r = routeDeliveryPin({ lat: 30.0444, lng: 31.2357 }, ZONES, BRANCHES);
  eq("inside A → matched", r.kind, "matched");
  if (r.kind === "matched") {
    eq("inside A → zone A", r.zone.id, "zoneA");
    eq("inside A → branch A", r.branchId, "brA");
    eq("inside A → via single", r.via, "single");
  }
  eq("inside A → matchZones count 1", matchZonesForPin(ZONES, { lat: 30.0444, lng: 31.2357 }).length, 1);
}

// ── overlap → nearest BRANCH by straight-line distance ────────────────────────
{
  // A pin near A's center but still inside both circles → nearest branch is brA.
  const overlapPin = { lat: 30.0470, lng: 31.2380 };
  eq("overlap pin matches both zones", matchZonesForPin(ZONES, overlapPin).length, 2);
  const r = routeDeliveryPin(overlapPin, ZONES, BRANCHES);
  eq("overlap → matched", r.kind, "matched");
  if (r.kind === "matched") {
    eq("overlap → nearest branch A", r.branchId, "brA");
    eq("overlap → via nearest_branch", r.via, "nearest_branch");
  }
}

// ── outside ALL zones → soft flow + nearest-zone insight ──────────────────────
{
  const r = routeDeliveryPin({ lat: 30.9, lng: 31.9 }, ZONES, BRANCHES);
  eq("far pin → outside", r.kind, "outside");
  if (r.kind === "outside") {
    ok("outside → a nearest zone is reported", r.nearestZoneId === "zoneA" || r.nearestZoneId === "zoneB");
    ok("outside → nearest distance is positive km", (r.nearestDistanceKm ?? 0) > 0);
  }
}

// ── applyPinRouting (matched): draft mutation + money law + directive ─────────
{
  const out = applyPinRouting({ lat: 30.0444, lng: 31.2357 }, emptyDraft("EGP"), ZONES, BRANCHES);
  eq("apply matched → kind", out.kind, "matched");
  if (out.kind === "matched") {
    eq("apply matched → zoneName", out.zoneName, "المعادي");
    eq("apply matched → branchId", out.branchId, "brA");
    eq("apply matched → fee is ZONE fee (engine, not distance)", out.deliveryFee, 20);
    eq("apply matched → draft fulfillment delivery", out.draft.fulfillment, "delivery");
    eq("apply matched → draft zone", out.draft.deliveryZone, "المعادي");
    eq("apply matched → draft fee = 20", out.draft.deliveryFee, 20);
    eq("apply matched → draft branchId", out.draft.branchId, "brA");
    ok("apply matched → draft address is the pin", (out.draft.address ?? "").startsWith("📍"));
    ok("apply matched → draft carries the pin", out.draft.deliveryPin?.lat === 30.0444);
    ok("apply matched → directive names the zone", out.directive.includes("المعادي"));
    ok("apply matched → directive forbids agent-computed fees", out.directive.includes("متحسبش"));
  }
}

// ── applyPinRouting (outside): exact soft message + miss payload, draft untouched
{
  const base = emptyDraft("EGP");
  const out = applyPinRouting({ lat: 30.9, lng: 31.9 }, base, ZONES, BRANCHES);
  eq("apply outside → kind", out.kind, "outside");
  if (out.kind === "outside") {
    ok("apply outside → soft message verbatim", out.directive.includes("خارج نطاق التوصيل حالياً"));
    ok("apply outside → offers pickup", out.directive.includes("الاستلام"));
    eq("apply outside → draft unchanged (no zone)", out.draft.deliveryZone, null);
    eq("apply outside → draft unchanged (fulfillment)", out.draft.fulfillment, null);
    ok("apply outside → miss carries pin coords", out.miss.pinLat === 30.9 && out.miss.pinLng === 31.9);
    ok("apply outside → miss carries a nearest distance", typeof out.miss.nearestDistanceKm === "number");
  }
}

// ── executor: pickup branch selection (flag ON) ───────────────────────────────
const mkCtx = (geoRouting: boolean): ToolContext => ({
  menuItems: [], modifiers: [], deliveryAreas: ZONES, branches: BRANCHES, geoRouting,
  draft: emptyDraft("EGP"), signals: [], escalation: null, presentation: null, photoRequests: [],
  taxMode: "inclusive", taxRate: 0, paymentConfig: DEFAULT_PAYMENT_CONFIG, resendReceipt: false,
});
{
  const ctx = mkCtx(true);
  const res = executeTool("set_fulfillment", { type: "pickup", branch_name: "مدينة نصر" }, ctx);
  ok("pickup branch → not error", !res.isError);
  eq("pickup branch → fulfillment pickup", ctx.draft.fulfillment, "pickup");
  eq("pickup branch → draft branchId brB", ctx.draft.branchId, "brB");
}
{
  const ctx = mkCtx(true);
  const res = executeTool("set_fulfillment", { type: "pickup", branch_name: "فرع غير موجود" }, ctx);
  ok("pickup unknown branch → error", !!res.isError);
}
{
  // Flag OFF: branch_name is ignored, pickup behaves exactly as before (no branchId).
  const ctx = mkCtx(false);
  const res = executeTool("set_fulfillment", { type: "pickup", branch_name: "مدينة نصر" }, ctx);
  ok("flag off pickup → not error", !res.isError);
  eq("flag off pickup → no branchId set", ctx.draft.branchId, undefined);
}

// ── flag-OFF byte-identical: tool defs unchanged ──────────────────────────────
ok("orderToolsWithGeo(false) === ORDER_TOOLS (same reference)", orderToolsWithGeo(false) === ORDER_TOOLS);
{
  const geoTools = orderToolsWithGeo(true);
  const sf = geoTools.find((t) => t.name === "set_fulfillment");
  ok("geo tools: set_fulfillment gains branch_name", !!(sf && (sf.input_schema as any).properties.branch_name));
}

// ── adapter: main normalizer DROPS a pin (byte-identical); extractor captures it ─
{
  const pinPayload = {
    entry: [{ changes: [{ field: "messages", value: {
      contacts: [{ wa_id: "20100", profile: { name: "أحمد" } }],
      messages: [{ from: "20100", id: "wamid.PIN1", type: "location",
        location: { latitude: 30.0444, longitude: 31.2357, name: "بيتي" } }],
    } }] }],
  };
  eq("main normalizer drops the pin (unchanged behavior)", normalizeWhatsAppInbound(pinPayload).length, 0);
  const locs = normalizeWhatsAppLocations(pinPayload);
  eq("geo extractor captures 1 pin", locs.length, 1);
  eq("pin lat parsed", locs[0]?.lat, 30.0444);
  eq("pin lng parsed", locs[0]?.lng, 31.2357);
  eq("pin name parsed", locs[0]?.name, "بيتي");
}
{
  const textPayload = {
    entry: [{ changes: [{ field: "messages", value: {
      messages: [{ from: "20100", id: "wamid.T1", type: "text", text: { body: "عايز بيتزا" } }],
    } }] }],
  };
  eq("text message still normalized (unchanged)", normalizeWhatsAppInbound(textPayload).length, 1);
  eq("text message yields no locations", normalizeWhatsAppLocations(textPayload).length, 0);
}
{
  const badPin = {
    entry: [{ changes: [{ field: "messages", value: {
      messages: [{ from: "20100", id: "wamid.BAD", type: "location", location: { latitude: 999, longitude: 31 } }],
    } }] }],
  };
  eq("out-of-range pin is skipped", normalizeWhatsAppLocations(badPin).length, 0);
}

console.log(`\nDELIVERY-GEO UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
