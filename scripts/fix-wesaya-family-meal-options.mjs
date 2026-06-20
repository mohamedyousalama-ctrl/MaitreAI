// ============================================================================
// MaitreAI — FIX 1 (DATA): add missing option groups to Wesaya's family meal
// ----------------------------------------------------------------------------
// Bug #1 root cause: «وجبة وصاية العائلية» (broasted family meal) has size variants
// but ZERO choice groups, while every broasted sibling carries a flavor group +
// a sauce/salad group. Karim borrowed سوبر دينر's groups → dead-end + a false
// "technical error". This adds the two missing groups to the family meal, CLONED
// EXACTLY from the healthy sibling سوبر دينر (same names, options, min/max, price
// deltas) so the engine renders/handles it identically.
//
// SCOPE: Wesaya tenant, ONLY the family meal item. ADDITIVE — it does not touch
// the item's price/name/variants/availability, and touches no other item/tenant.
// Cloned from real sibling config (not authored from prose).
//
// IDEMPOTENT: every new row uses a FIXED UUID upserted on its primary key, so
// re-running never duplicates the groups/choices. (The family meal currently has
// 0 groups, so there is nothing to collide with; the fixed ids keep re-runs a
// no-op.)
//
// Required env (same surface as scripts/seed-demo-pro-tenant.mjs):
//   NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
// Usage:  node scripts/fix-wesaya-family-meal-options.mjs
//
// NOTE: ستربس ١٥ قطعة (the other Bug #1 item) is intentionally NOT touched here —
// its existing sauce group is malformed (flavors mixed in, sauce options missing)
// and its correct shape is a separate decision; deferred to a follow-up.
// ============================================================================

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SR) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ---- Fixed targets (Wesaya; the family meal item) ----
const WESAYA_ID = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const FAMILY_MEAL_ID = "a0cac10b-f7b8-421b-a6a3-43344d8ec787";
const CLONE_SOURCE = "213bfb95-1041-422d-8b13-d3c26c29e9ea"; // سوبر دينر (for the report)

// ---- Fixed ids for the new rows (idempotent upsert-on-PK) ----
const G_SAUCE = "fa312ea1-0001-4a00-8a00-000000000001";
const G_FLAVOR = "fa312ea1-0002-4a00-8a00-000000000002";

// ---- Cloned structure — EXACT values read from سوبر دينر's live config ----
//   «اختر الصوص/السلطة» (min1/max1, sort 21): ثومية كبيرة +10 · ثومية صغيرة 0 · كول سلو صغير 0
//   «اختر المذاق»       (min1/max1, sort 22): عادي 0 · حار 0 · مكس 0
const GROUPS = [
  { id: G_SAUCE, name: "اختر الصوص/السلطة", min_select: 1, max_select: 1, sort: 21 },
  { id: G_FLAVOR, name: "اختر المذاق", min_select: 1, max_select: 1, sort: 22 },
];
const OPTIONS = [
  { id: "fa312ea1-0001-4a00-8a00-000000000011", group_id: G_SAUCE, label: "ثومية كبيرة", price_delta: 10, sort: 1 },
  { id: "fa312ea1-0001-4a00-8a00-000000000012", group_id: G_SAUCE, label: "ثومية صغيرة", price_delta: 0, sort: 2 },
  { id: "fa312ea1-0001-4a00-8a00-000000000013", group_id: G_SAUCE, label: "كول سلو صغير", price_delta: 0, sort: 3 },
  { id: "fa312ea1-0002-4a00-8a00-000000000021", group_id: G_FLAVOR, label: "عادي", price_delta: 0, sort: 1 },
  { id: "fa312ea1-0002-4a00-8a00-000000000022", group_id: G_FLAVOR, label: "حار", price_delta: 0, sort: 2 },
  { id: "fa312ea1-0002-4a00-8a00-000000000023", group_id: G_FLAVOR, label: "مكس", price_delta: 0, sort: 3 },
];

const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const j = (r) => r.json();

async function upsert(table, rows) {
  const res = await fetch(`${SB}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`upsert ${table} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

(async () => {
  // SAFETY GUARD: confirm the target is exactly Wesaya's family meal before writing.
  const item = await fetch(
    `${SB}/rest/v1/menu_items?id=eq.${FAMILY_MEAL_ID}&restaurant_id=eq.${WESAYA_ID}&select=id,name,price,restaurant_id`,
    { headers: H }
  ).then(j);
  const row = item?.[0];
  if (!row) throw new Error("target family-meal item not found under Wesaya — aborting (no write).");
  if (row.name !== "وجبة وصاية العائلية") throw new Error(`unexpected item name «${row.name}» — aborting (no write).`);
  console.log(`target: ${row.name} (${row.id}) · price=${row.price} · tenant=Wesaya · cloned from سوبر دينر (${CLONE_SOURCE})`);

  // 1) Choice groups (with the item + tenant FK), 2) their options (with the
  //    group + tenant FK). Order matters: group before its options.
  await upsert(
    "menu_item_choice_groups",
    GROUPS.map((g) => ({ ...g, restaurant_id: WESAYA_ID, item_id: FAMILY_MEAL_ID }))
  );
  await upsert(
    "menu_item_choice_options",
    OPTIONS.map((o) => ({ ...o, restaurant_id: WESAYA_ID }))
  );

  // ---- Summary (read back what the item now has) ----
  const groups = await fetch(
    `${SB}/rest/v1/menu_item_choice_groups?item_id=eq.${FAMILY_MEAL_ID}&select=id,name,min_select,max_select,sort&order=sort`,
    { headers: H }
  ).then(j);
  console.log(`\n=== family meal now has ${groups.length} choice group(s) ===`);
  for (const g of groups) {
    const opts = await fetch(
      `${SB}/rest/v1/menu_item_choice_options?group_id=eq.${g.id}&select=label,price_delta,sort&order=sort`,
      { headers: H }
    ).then(j);
    console.log(`  «${g.name}» (min ${g.min_select}/max ${g.max_select}): ${opts.map((o) => `${o.label}${Number(o.price_delta) ? ` +${o.price_delta}` : ""}`).join(" · ")}`);
  }
  console.log("done ✓ (sizes/variants untouched; ستربس ١٥ قطعة deferred)");
})().catch((e) => {
  console.error("FIX FAILED:", e.message || e);
  process.exit(1);
});
