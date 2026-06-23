/**
 * proof-onboarding-e2e.mjs — End-to-end onboarding pipeline proof
 *
 * Proves the full "client #N" onboarding path from a blank tenant through to
 * go-live in a single script, using only the Supabase service-role client.
 * No HTTP server is needed; the readiness and go-live logic is inlined
 * (mirroring the routes exactly) to avoid @/ alias and server-only issues —
 * same approach as proof-conversation-lock.mjs.
 *
 * ── What this script proves ────────────────────────────────────────────────
 *
 *   Stage 1 — Provision
 *     A new restaurant row is created with agent_mode='setup', active=false.
 *     No other tenant is touched.
 *
 *   Stage 2 — Go-live gate blocks when incomplete
 *     2a. Fresh tenant (no WA / no menu / no hours) → NOT READY.
 *     2b. After mocking WhatsApp only → still NOT READY.
 *     2c. After publishing menu → still NOT READY (hours missing).
 *     2d. Go-live attempt with incomplete state → rejected (never writes active=true).
 *
 *   Stage 3 — Complete all required steps
 *     Mock WhatsApp credentials written (the DB state embedded-signup produces;
 *     the Meta network call itself is the only part not covered — see below).
 *     Menu ingested as menu_drafts 'draft', then published via publish_menu_draft().
 *     Hours configured (non-empty jsonb on restaurants.hours).
 *     Delivery zone added (advisory check).
 *
 *   Stage 4 — Go-live gate passes + activation
 *     All required checks now pass (whatsapp ✓ / menu ✓ / hours ✓).
 *     Active zone reported advisory-pass (zones ✓).
 *     Activation writes active=true + agent_mode='live' in one update.
 *     Re-calling go-live is idempotent (returns alreadyLive=true, no re-write).
 *
 *   Stage 5 — Tenant isolation
 *     A reference tenant (restaurantRef) is seeded before the new tenant.
 *     After the new tenant goes live: restaurantRef is still agent_mode='setup',
 *     active=false, and its menu is untouched.
 *
 *   Stage 6 — loadBrain-style read
 *     Direct queries to the live tables (menu_categories, menu_items, modifiers,
 *     menu_item_variants, delivery_zones) mirror the queries loadBrain() runs.
 *     Asserts the new tenant's published menu is present and complete.
 *     Asserts restaurantRef's live tables contain none of the new tenant's items.
 *
 * ── What still needs live Meta credentials to verify ──────────────────────
 *
 *   • The actual Meta OAuth token exchange (GET /oauth/access_token).
 *     Requires WHATSAPP_APP_ID + WHATSAPP_APP_SECRET + a valid short-lived code.
 *   • The WABA webhook subscription (POST /{wabaId}/subscribed_apps).
 *     Requires a real WABA with Meta platform access.
 *   • End-to-end: customer sends WhatsApp message → webhook → Brain replies.
 *     Requires a live phone number connected to the tenant.
 *
 *   The proof mocks only the DB state that the embedded-signup route produces
 *   (wa_configured_at, wa_phone_number_id, wa_waba_id, wa_access_token_enc).
 *   All downstream logic (readiness gate, go-live, Brain read) is genuinely
 *   exercised against the real database.
 *
 * ── Requirements ───────────────────────────────────────────────────────────
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  →  run against real DB
 *   Absent → exits 0 (skip), same as all other proof scripts.
 *
 * Run:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/proof-onboarding-e2e.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SB_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SB_URL || !SB_KEY) {
  console.log("[proof-onboarding-e2e] No DB creds — skipping (exit 0)");
  process.exit(0);
}

const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let passed = 0;
let failed = 0;
const seeded = []; // restaurant IDs — deleted on cleanup (cascade removes members, menu, zones, etc.)

function ok(label, condition) {
  if (condition) {
    console.log("  ✅", label);
    passed++;
  } else {
    console.error("  ❌", label);
    failed++;
  }
}

// ── Seeding helpers ──────────────────────────────────────────────────────────

async function seedRestaurant(name) {
  const { data, error } = await db
    .from("restaurants")
    .insert({ name, agent_mode: "setup", active: false, currency: "ر.س", country: "SA", dialect: "saudi" })
    .select("id")
    .single();
  if (error) throw new Error(`seedRestaurant: ${error.message}`);
  seeded.push(data.id);
  return data.id;
}

async function mockWhatsAppConnected(restaurantId) {
  // Writes the exact DB state that POST /api/onboarding/embedded-signup produces
  // after a successful Meta token exchange + webhook subscription.
  // The Meta network calls themselves require live credentials (see header comment).
  const now = new Date().toISOString();
  const { error } = await db.from("restaurants").update({
    wa_phone_number_id: "10000000000001", // fake numeric phone number ID
    wa_waba_id: "20000000000001",          // fake WABA ID
    wa_verify_token: randomUUID(),
    wa_access_token_enc: "v1:fakeinitializationvector:fakeauthtag:fakeciphertext",
    wa_configured_at: now,
    onboarding_completed_at: now,
  }).eq("id", restaurantId);
  if (error) throw new Error(`mockWhatsAppConnected: ${error.message}`);
}

async function ingestAndPublishMenu(restaurantId, menu) {
  const { data: draft, error: draftErr } = await db
    .from("menu_drafts")
    .insert({ restaurant_id: restaurantId, status: "draft", payload: menu })
    .select("id")
    .single();
  if (draftErr) throw new Error(`ingestMenu: ${draftErr.message}`);

  const { error: pubErr } = await db.rpc("publish_menu_draft", {
    p_restaurant_id: restaurantId,
    p_draft_id: draft.id,
  });
  if (pubErr) throw new Error(`publishMenu: ${pubErr.message}`);
  return draft.id;
}

async function setHours(restaurantId, hours) {
  const { error } = await db.from("restaurants").update({ hours }).eq("id", restaurantId);
  if (error) throw new Error(`setHours: ${error.message}`);
}

async function addDeliveryZone(restaurantId, zone) {
  const { error } = await db.from("delivery_zones").insert({
    restaurant_id: restaurantId,
    name: zone.name,
    fee: zone.fee,
    min_order: zone.minOrder,
    eta_minutes: zone.etaMinutes ?? null,
    active: true,
  });
  if (error) throw new Error(`addDeliveryZone: ${error.message}`);
}

// ── Go-live logic (mirrors app/api/onboarding/go-live/route.ts exactly) ──────

async function computeReadiness(restaurantId) {
  const [restaurantRes, menuRes, zonesRes] = await Promise.all([
    db.from("restaurants")
      .select("wa_configured_at, hours, agent_mode, active")
      .eq("id", restaurantId)
      .single(),
    db.from("menu_drafts")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "published")
      .limit(1),
    db.from("delivery_zones")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("active", true),
  ]);

  if (restaurantRes.error) throw restaurantRes.error;

  const row = restaurantRes.data;
  const hoursRaw = row.hours;
  const hoursSet =
    hoursRaw !== null &&
    typeof hoursRaw === "object" &&
    !Array.isArray(hoursRaw) &&
    Object.keys(hoursRaw).length > 0;

  return {
    whatsapp: row.wa_configured_at != null,
    menu: (menuRes.count ?? 0) > 0,
    hours: hoursSet,
    zones: (zonesRes.count ?? 0) > 0,
    allRequired: false, // computed below
    alreadyLive: row.agent_mode === "live" && row.active === true,
    raw: row,
  };
}

/** Attempt go-live. Returns { blocked, activated, alreadyLive }. Never throws. */
async function attemptGoLive(restaurantId) {
  const r = await computeReadiness(restaurantId);
  if (r.alreadyLive) return { alreadyLive: true, blocked: false, activated: false };
  if (!r.whatsapp || !r.menu || !r.hours) return { blocked: true, alreadyLive: false, activated: false };

  const { error } = await db
    .from("restaurants")
    .update({ active: true, agent_mode: "live" })
    .eq("id", restaurantId);
  if (error) throw new Error(`goLive UPDATE: ${error.message}`);
  return { activated: true, blocked: false, alreadyLive: false };
}

// ── Sample menu ──────────────────────────────────────────────────────────────

const SAMPLE_MENU = {
  categories: [
    {
      name: "المقبلات",
      sort: 0,
      items: [
        {
          name: "حمص",
          name_en: "Hummus",
          description: "كريمة حمص طازجة",
          price: 25.0,
          available: true,
          ingredients: ["حمص", "طحينة"],
          allergens: ["sesame"],
          modifier_names: ["بدون ثوم"],
          variants: [
            { name: "صغير", price: 25.0, sort: 0 },
            { name: "كبير", price: 35.0, sort: 1 },
          ],
          choice_groups: [],
        },
        {
          name: "فتوش",
          price: 20.0,
          available: true,
        },
      ],
    },
    {
      name: "الرئيسية",
      sort: 1,
      items: [
        { name: "شاورما دجاج", price: 45.0, available: true },
      ],
    },
  ],
  modifiers: [{ name: "بدون ثوم", price_impact: 0, category: "dietary" }],
};

const REF_MENU = {
  categories: [
    {
      name: "مشروبات",
      sort: 0,
      items: [
        { name: "شاي", price: 5.0, available: true },
        { name: "قهوة", price: 10.0, available: true },
      ],
    },
  ],
};

// ── Main proof ───────────────────────────────────────────────────────────────

async function run() {
  console.log("\n[proof-onboarding-e2e] Starting…\n");

  // ── Stage 1: Reference tenant (isolation baseline) ─────────────────────────
  console.log("Stage 1 — Reference tenant (isolation baseline)");

  const restaurantRef = await seedRestaurant("proof-e2e-REF");
  await ingestAndPublishMenu(restaurantRef, REF_MENU);
  await setHours(restaurantRef, { mon: "09:00-22:00" });

  const { data: refSnapshot } = await db
    .from("restaurants")
    .select("agent_mode, active")
    .eq("id", restaurantRef)
    .single();
  ok("ref tenant: agent_mode='setup'", refSnapshot?.agent_mode === "setup");
  ok("ref tenant: active=false", refSnapshot?.active === false);

  const { data: refItems } = await db.from("menu_items").select("name").eq("restaurant_id", restaurantRef);
  ok(`ref tenant: menu published (${refItems?.length ?? 0} items)`, (refItems?.length ?? 0) >= 2);

  // ── Stage 2: Provision new tenant ─────────────────────────────────────────
  console.log("\nStage 2 — Provision new tenant");

  const restaurantNew = await seedRestaurant("proof-e2e-CLIENT-NEW");

  const { data: newRow } = await db
    .from("restaurants")
    .select("agent_mode, active, wa_configured_at, hours")
    .eq("id", restaurantNew)
    .single();
  ok("new tenant: agent_mode='setup' at provision", newRow?.agent_mode === "setup");
  ok("new tenant: active=false at provision", newRow?.active === false);
  ok("new tenant: wa_configured_at NULL at provision", newRow?.wa_configured_at == null);
  ok("new tenant: hours={} at provision", JSON.stringify(newRow?.hours) === "{}");

  // ── Stage 3: Gate blocks when nothing is complete ─────────────────────────
  console.log("\nStage 3 — Gate blocks on incomplete state");

  const r0 = await computeReadiness(restaurantNew);
  ok("gate: whatsapp=false (no creds yet)", r0.whatsapp === false);
  ok("gate: menu=false (no draft yet)", r0.menu === false);
  ok("gate: hours=false (empty jsonb)", r0.hours === false);
  ok("gate: zones=false (no zones yet)", r0.zones === false);
  ok("gate: not live", r0.alreadyLive === false);

  const attempt0 = await attemptGoLive(restaurantNew);
  ok("go-live blocked when all checks fail", attempt0.blocked === true);

  // Verify DB state after blocked attempt — must not have been written.
  const { data: afterBlock0 } = await db
    .from("restaurants")
    .select("active, agent_mode")
    .eq("id", restaurantNew)
    .single();
  ok("blocked attempt: active still false", afterBlock0?.active === false);
  ok("blocked attempt: agent_mode still 'setup'", afterBlock0?.agent_mode === "setup");

  // ── Stage 4: Mock WhatsApp connected ─────────────────────────────────────
  console.log("\nStage 4 — Mock WhatsApp connected (embedded-signup DB state)");

  await mockWhatsAppConnected(restaurantNew);

  const r1 = await computeReadiness(restaurantNew);
  ok("after WA mock: whatsapp=true", r1.whatsapp === true);
  ok("after WA mock: menu still false", r1.menu === false);
  ok("after WA mock: hours still false", r1.hours === false);

  const attempt1 = await attemptGoLive(restaurantNew);
  ok("go-live blocked when menu + hours missing", attempt1.blocked === true);

  // ── Stage 5: Ingest + publish menu ───────────────────────────────────────
  console.log("\nStage 5 — Menu ingestion + publish");

  const draftId = await ingestAndPublishMenu(restaurantNew, SAMPLE_MENU);

  const { data: draftRow } = await db
    .from("menu_drafts")
    .select("status, published_at")
    .eq("id", draftId)
    .single();
  ok("draft status='published' after publish", draftRow?.status === "published");
  ok("published_at is set", draftRow?.published_at != null);

  const r2 = await computeReadiness(restaurantNew);
  ok("after menu publish: menu=true", r2.menu === true);
  ok("after menu publish: hours still false", r2.hours === false);

  const attempt2 = await attemptGoLive(restaurantNew);
  ok("go-live blocked when hours missing", attempt2.blocked === true);

  const { data: afterBlock2 } = await db
    .from("restaurants")
    .select("active, agent_mode")
    .eq("id", restaurantNew)
    .single();
  ok("hours-blocked attempt: still not live", afterBlock2?.active === false);

  // ── Stage 6: Set hours ────────────────────────────────────────────────────
  console.log("\nStage 6 — Set operating hours");

  await setHours(restaurantNew, {
    sun: "10:00-23:00",
    mon: "10:00-23:00",
    tue: "10:00-23:00",
    wed: "10:00-23:00",
    thu: "10:00-00:00",
    fri: "12:00-00:00",
    sat: "10:00-00:00",
  });

  const r3 = await computeReadiness(restaurantNew);
  ok("after hours set: hours=true", r3.hours === true);
  ok("after hours set: whatsapp=true", r3.whatsapp === true);
  ok("after hours set: menu=true", r3.menu === true);
  ok("after hours set: all required pass (ready)", r3.whatsapp && r3.menu && r3.hours);

  // ── Stage 7: Add delivery zone (advisory) ────────────────────────────────
  console.log("\nStage 7 — Add delivery zone (advisory check)");

  await addDeliveryZone(restaurantNew, { name: "الرياض", fee: 15, minOrder: 50, etaMinutes: 40 });

  const r4 = await computeReadiness(restaurantNew);
  ok("after zone add: zones=true (advisory)", r4.zones === true);

  // ── Stage 8: Go-live ──────────────────────────────────────────────────────
  console.log("\nStage 8 — Go-live activation");

  const goLiveResult = await attemptGoLive(restaurantNew);
  ok("go-live: activated=true", goLiveResult.activated === true);
  ok("go-live: not blocked", goLiveResult.blocked === false);

  const { data: liveRow } = await db
    .from("restaurants")
    .select("active, agent_mode")
    .eq("id", restaurantNew)
    .single();
  ok("after go-live: active=true", liveRow?.active === true);
  ok("after go-live: agent_mode='live'", liveRow?.agent_mode === "live");

  // ── Stage 9: Idempotency ──────────────────────────────────────────────────
  console.log("\nStage 9 — Go-live idempotency");

  const goLive2 = await attemptGoLive(restaurantNew);
  ok("second go-live: alreadyLive=true", goLive2.alreadyLive === true);
  ok("second go-live: not activated again", goLive2.activated !== true);

  const { data: afterIdempotent } = await db
    .from("restaurants")
    .select("active, agent_mode")
    .eq("id", restaurantNew)
    .single();
  ok("after idempotent call: still active=true", afterIdempotent?.active === true);
  ok("after idempotent call: agent_mode still 'live'", afterIdempotent?.agent_mode === "live");

  // ── Stage 10: Tenant isolation ────────────────────────────────────────────
  console.log("\nStage 10 — Tenant isolation");

  const { data: refAfter } = await db
    .from("restaurants")
    .select("agent_mode, active")
    .eq("id", restaurantRef)
    .single();
  ok("ref tenant: agent_mode unchanged (still 'setup')", refAfter?.agent_mode === "setup");
  ok("ref tenant: active unchanged (still false)", refAfter?.active === false);

  // New tenant's items must not appear in ref tenant's live tables.
  const { data: refItemsAfter } = await db
    .from("menu_items")
    .select("name")
    .eq("restaurant_id", restaurantRef);
  ok("ref tenant: still has its own items (شاي / قهوة)", refItemsAfter?.some(i => i.name === "شاي") === true);
  ok("ref tenant: new tenant's حمص NOT in ref menu", !refItemsAfter?.some(i => i.name === "حمص"));
  ok("ref tenant: new tenant's شاورما دجاج NOT in ref menu", !refItemsAfter?.some(i => i.name === "شاورما دجاج"));

  // New tenant's zones must not appear in ref tenant's zones.
  const { data: refZones } = await db
    .from("delivery_zones")
    .select("name")
    .eq("restaurant_id", restaurantRef);
  ok("ref tenant: الرياض zone NOT in ref zones", !refZones?.some(z => z.name === "الرياض"));

  // ── Stage 11: loadBrain-style read on new tenant ──────────────────────────
  console.log("\nStage 11 — loadBrain-style read: new tenant's published menu");

  // These are the exact queries loadBrain() runs (see lib/db/brain.ts).
  const [catRes, itemRes, modRes, varRes, zoneRes] = await Promise.all([
    db.from("menu_categories").select("id, name, sort").eq("restaurant_id", restaurantNew).order("sort"),
    db.from("menu_items").select("name, price, available, category_id").eq("restaurant_id", restaurantNew),
    db.from("modifiers").select("name, price_impact").eq("restaurant_id", restaurantNew),
    db.from("menu_item_variants").select("name, price, sort").eq("restaurant_id", restaurantNew).order("sort"),
    db.from("delivery_zones").select("name, fee, min_order, active").eq("restaurant_id", restaurantNew),
  ]);

  const categories = catRes.data ?? [];
  const items = itemRes.data ?? [];
  const mods = modRes.data ?? [];
  const variants = varRes.data ?? [];
  const zones = zoneRes.data ?? [];

  ok("loadBrain: 2 categories present", categories.length === 2);
  ok("loadBrain: category 'المقبلات' present", categories.some(c => c.name === "المقبلات"));
  ok("loadBrain: category 'الرئيسية' present", categories.some(c => c.name === "الرئيسية"));

  ok("loadBrain: 3 menu items", items.length === 3);
  const hummus = items.find(i => i.name === "حمص");
  ok("loadBrain: حمص with price=25", hummus?.price === 25);
  ok("loadBrain: حمص available=true", hummus?.available === true);
  ok("loadBrain: فتوش present", items.some(i => i.name === "فتوش"));
  ok("loadBrain: شاورما دجاج present", items.some(i => i.name === "شاورما دجاج"));

  ok("loadBrain: modifier 'بدون ثوم' present", mods.some(m => m.name === "بدون ثوم"));
  ok("loadBrain: 2 variants for حمص (صغير / كبير)", variants.length === 2);
  ok("loadBrain: variant 'صغير' price=25", variants.some(v => v.name === "صغير" && v.price === 25));
  ok("loadBrain: variant 'كبير' price=35", variants.some(v => v.name === "كبير" && v.price === 35));

  ok("loadBrain: 1 delivery zone", zones.length === 1);
  ok("loadBrain: zone 'الرياض' fee=15", zones[0]?.name === "الرياض" && Number(zones[0]?.fee) === 15);
  ok("loadBrain: zone active=true", zones[0]?.active === true);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log("\n[cleanup] Removing seeded restaurants (cascade deletes all child rows)…");
  for (const id of seeded) {
    await db.from("restaurants").delete().eq("id", id);
  }
  console.log(`[cleanup] Deleted ${seeded.length} restaurant(s).`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

run()
  .then(cleanup)
  .then(() => {
    console.log(`\n[proof-onboarding-e2e] ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("\n[proof-onboarding-e2e] FATAL:", err.message);
    await cleanup().catch(() => {});
    process.exit(2);
  });
