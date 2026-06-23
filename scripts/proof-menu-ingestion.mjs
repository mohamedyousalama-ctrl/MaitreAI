#!/usr/bin/env node
// ============================================================================
// proof-menu-ingestion.mjs — validates the menu ingestion + publish pipeline
//
// Proves:
//   1. A tenant can ingest a structured menu → lands as 'draft' in menu_drafts
//   2. Validation rejects a malformed item (missing name, negative price)
//   3. publish_menu_draft() atomically writes items to the live tables
//   4. After publish, menu_items for the tenant contain exactly the ingested items
//   5. A SECOND tenant's publish doesn't touch the first tenant's live items
//      (tenant isolation)
//   6. Cleanup: all seeded rows removed
//
// Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// Skips (exit 0) if creds are absent — same pattern as other proof scripts.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL ?? "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SB_URL || !SB_KEY) {
  console.log("[proof-menu-ingestion] No DB creds — skipping (exit 0)");
  process.exit(0);
}

const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const createdRestaurants = [];
const createdDrafts = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedRestaurant(name) {
  const { data, error } = await db
    .from("restaurants")
    .insert({ name, agent_mode: "setup", active: false })
    .select("id")
    .single();
  if (error) throw new Error(`seed restaurant: ${error.message}`);
  createdRestaurants.push(data.id);
  return data.id;
}

async function ingestDraft(restaurantId, menu) {
  const { data, error } = await db
    .from("menu_drafts")
    .insert({ restaurant_id: restaurantId, status: "draft", payload: menu })
    .select("id")
    .single();
  if (error) throw new Error(`ingest draft: ${error.message}`);
  createdDrafts.push(data.id);
  return data.id;
}

async function publishDraft(restaurantId, draftId) {
  const { error } = await db.rpc("publish_menu_draft", {
    p_restaurant_id: restaurantId,
    p_draft_id: draftId,
  });
  if (error) throw new Error(`publish: ${error.message}`);
}

// ── Sample menus ─────────────────────────────────────────────────────────────

const MENU_A = {
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
          ingredients: ["حمص", "طحينة", "ليمون"],
          allergens: ["sesame"],
          modifier_names: ["بدون ثوم"],
          variants: [
            { name: "عادي", price: 25.0, sort: 0 },
            { name: "كبير", price: 35.0, sort: 1 },
          ],
          choice_groups: [
            {
              name: "المذاق",
              min_select: 1,
              max_select: 1,
              sort: 0,
              options: [
                { label: "حار", price_delta: 0, sort: 0 },
                { label: "خفيف", price_delta: 0, sort: 1 },
              ],
            },
          ],
        },
        {
          name: "فتوش",
          price: 20.0,
          available: true,
        },
      ],
    },
  ],
  modifiers: [{ name: "بدون ثوم", price_impact: 0, category: "dietary" }],
};

const MENU_B = {
  categories: [
    {
      name: "البرغر",
      sort: 0,
      items: [
        { name: "كلاسيك برغر", price: 55.0, available: true },
        { name: "دبل برغر", price: 75.0, available: true },
      ],
    },
  ],
};

// ── Validation helper (pure, no DB) ──────────────────────────────────────────

function validateMenuPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["payload must be a JSON object"];
  }
  if (!Array.isArray(payload.categories) || payload.categories.length === 0) {
    errors.push("categories must be a non-empty array");
    return errors;
  }
  for (let ci = 0; ci < payload.categories.length; ci++) {
    const cat = payload.categories[ci];
    if (!cat.name?.trim()) errors.push(`categories[${ci}]: name is required`);
    if (!Array.isArray(cat.items)) { errors.push(`categories[${ci}]: items must be an array`); continue; }
    for (let ii = 0; ii < cat.items.length; ii++) {
      const item = cat.items[ii];
      const loc = `categories[${ci}].items[${ii}]`;
      if (!item.name?.trim()) errors.push(`${loc}: name is required`);
      if (typeof item.price !== "number" || !isFinite(item.price) || item.price < 0)
        errors.push(`${loc}: price must be a non-negative finite number`);
    }
  }
  return errors;
}

// ── Proof run ─────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n[proof-menu-ingestion] Starting…\n");

  // ── 1. Validation (pure, no DB) ──────────────────────────────────────────
  console.log("1. Validation rejects malformed payloads");

  const errMissingName = validateMenuPayload({
    categories: [{ name: "Cat", items: [{ price: 10 }] }],
  });
  assert(errMissingName.some((e) => e.includes("name is required")), "missing item name → rejected");

  const errNegPrice = validateMenuPayload({
    categories: [{ name: "Cat", items: [{ name: "Item", price: -5 }] }],
  });
  assert(errNegPrice.some((e) => e.includes("price")), "negative price → rejected");

  const errEmptyCategories = validateMenuPayload({ categories: [] });
  assert(errEmptyCategories.some((e) => e.includes("categories")), "empty categories → rejected");

  const errValid = validateMenuPayload(MENU_A);
  assert(errValid.length === 0, "valid MENU_A → no errors");

  // ── 2. Tenant A: ingest → draft ─────────────────────────────────────────
  console.log("\n2. Tenant A: ingest → draft");

  const restaurantA = await seedRestaurant("proof-menu-A");
  const draftAId = await ingestDraft(restaurantA, MENU_A);

  const { data: draftRow } = await db
    .from("menu_drafts")
    .select("status")
    .eq("id", draftAId)
    .single();
  assert(draftRow?.status === "draft", "draft row exists with status='draft'");

  // Before publish: live menu for tenant A is empty
  const { data: preItems } = await db
    .from("menu_items")
    .select("id")
    .eq("restaurant_id", restaurantA);
  assert((preItems ?? []).length === 0, "live menu_items empty before publish");

  // ── 3. Publish → live tables ──────────────────────────────────────────────
  console.log("\n3. Publish → live tables");

  await publishDraft(restaurantA, draftAId);

  const { data: draftRowAfter } = await db
    .from("menu_drafts")
    .select("status, published_at")
    .eq("id", draftAId)
    .single();
  assert(draftRowAfter?.status === "published", "draft status = 'published' after publish");
  assert(!!draftRowAfter?.published_at, "published_at set");

  const { data: liveItems } = await db
    .from("menu_items")
    .select("name, price, available")
    .eq("restaurant_id", restaurantA)
    .order("name");
  assert(liveItems?.length === 2, `2 items in live menu_items (got ${liveItems?.length})`);
  assert(
    liveItems?.some((i) => i.name === "حمص" && i.price === 25),
    "حمص present with correct price"
  );
  assert(liveItems?.every((i) => i.available === true), "all items available=true");

  // Modifier inserted
  const { data: liveMods } = await db
    .from("modifiers")
    .select("name")
    .eq("restaurant_id", restaurantA);
  assert(liveMods?.some((m) => m.name === "بدون ثوم"), "modifier 'بدون ثوم' in live modifiers");

  // Variant inserted
  const { data: liveVariants } = await db
    .from("menu_item_variants")
    .select("name, price")
    .eq("restaurant_id", restaurantA);
  assert(liveVariants?.some((v) => v.name === "عادي"), "variant 'عادي' present");

  // Choice group + option inserted
  const { data: liveGroups } = await db
    .from("menu_item_choice_groups")
    .select("name")
    .eq("restaurant_id", restaurantA);
  assert(liveGroups?.some((g) => g.name === "المذاق"), "choice group 'المذاق' present");

  // ── 4. Double-publish is rejected (draft already 'published') ────────────
  console.log("\n4. Re-publish of same draft is rejected");

  try {
    await publishDraft(restaurantA, draftAId);
    assert(false, "re-publish should have thrown");
  } catch (e) {
    assert(e.message.includes("already published") || e.message.includes("not found"),
      "re-publish throws with expected error");
  }

  // ── 5. Tenant isolation ───────────────────────────────────────────────────
  console.log("\n5. Tenant isolation");

  const restaurantB = await seedRestaurant("proof-menu-B");
  const draftBId = await ingestDraft(restaurantB, MENU_B);
  await publishDraft(restaurantB, draftBId);

  // Tenant A's items unchanged
  const { data: aItemsAfterB } = await db
    .from("menu_items")
    .select("name")
    .eq("restaurant_id", restaurantA);
  assert(aItemsAfterB?.length === 2, "tenant A still has 2 items after tenant B publishes");
  assert(
    !aItemsAfterB?.some((i) => i.name === "كلاسيك برغر"),
    "tenant B's burger not in tenant A's menu"
  );

  // Tenant B has its own items
  const { data: bItems } = await db
    .from("menu_items")
    .select("name")
    .eq("restaurant_id", restaurantB);
  assert(bItems?.length === 2, "tenant B has 2 items");
  assert(
    bItems?.some((i) => i.name === "كلاسيك برغر"),
    "كلاسيك برغر in tenant B's menu"
  );

  // ── 6. Re-publish (new draft replaces live menu) ──────────────────────────
  console.log("\n6. Re-ingestion replaces live menu atomically");

  const MENU_A_V2 = {
    categories: [
      {
        name: "الرئيسية",
        items: [{ name: "شاورما", price: 40.0 }],
      },
    ],
  };
  const draftA2Id = await ingestDraft(restaurantA, MENU_A_V2);
  createdDrafts.push(draftA2Id);
  await publishDraft(restaurantA, draftA2Id);

  const { data: replacedItems } = await db
    .from("menu_items")
    .select("name")
    .eq("restaurant_id", restaurantA);
  assert(replacedItems?.length === 1, "re-publish replaces: only 1 item now");
  assert(replacedItems?.[0]?.name === "شاورما", "new item 'شاورما' present");
  assert(!replacedItems?.some((i) => i.name === "حمص"), "old item 'حمص' removed");

  // First draft now superseded
  const { data: firstDraftStatus } = await db
    .from("menu_drafts")
    .select("status")
    .eq("id", draftAId)
    .single();
  assert(firstDraftStatus?.status === "superseded", "first draft marked superseded");
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log("\n[cleanup] Removing seeded rows…");
  for (const id of createdRestaurants) {
    // Cascade deletes menu_items, menu_categories, menu_drafts, modifiers, members, etc.
    await db.from("restaurants").delete().eq("id", id);
  }
  console.log(`[cleanup] Deleted ${createdRestaurants.length} restaurant(s).`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

run()
  .then(() => cleanup())
  .then(() => {
    console.log(`\n[proof-menu-ingestion] ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  })
  .catch(async (err) => {
    console.error("\n[proof-menu-ingestion] FATAL:", err.message);
    await cleanup().catch(() => {});
    process.exit(2);
  });
