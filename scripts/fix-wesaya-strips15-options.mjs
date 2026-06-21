// ============================================================================
// MaitreAI — DATA FIX: restructure ستربس ١٥ قطعة's malformed option config
// ----------------------------------------------------------------------------
// Bug #1 scan (second/last malformed item): «ستربس ١٥ قطعة» (580 EGP) has ONE
// group «اختر الصوص/السلطة» that is MALFORMED — the flavors عادي/حار/مكس are
// crammed into the sauce group, the real sauces (ثومية صغيرة / كول سلو صغير) are
// missing, and ثومية كبيرة is at +0 (the real menu charges +15). The healthy
// sibling ستربس ٧ قطع has the correct two-group shape with ثومية كبيرة +15.
//
// This RESTRUCTURES ستربس ١٥ to match the healthy sibling exactly (Mohamed's
// locked decision: the code follows the real menu; ثومية كبيرة = +15):
//   «اختر الصوص/السلطة» (min1/max1): ثومية كبيرة +15 · ثومية صغيرة 0 · كول سلو صغير 0
//   «اختر المذاق»       (min1/max1): عادي 0 · حار 0 · مكس 0
//
// SCOPE: Wesaya tenant, ONLY ستربس ١٥ قطعة. Touches ONLY its option groups — NOT
// its price (580) / name / variants / availability, and no other item/tenant.
//
// IDEMPOTENT (restructure, not pure additive): desired rows use FIXED UUIDs
// upserted on PK; then each group is reconciled by DELETING any option NOT in the
// desired fixed-id set. Re-running converges to the same end-state — garlic stays
// +15, flavors end in «اختر المذاق», no duplicates, the misplaced flavors + the
// old +0 garlic row removed.
//
// Required env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
// Usage:  node scripts/fix-wesaya-strips15-options.mjs
// ============================================================================

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SR) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ---- Fixed targets (Wesaya; ستربس ١٥ قطعة) ----
const WESAYA_ID = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const STRIPS15_ID = "05a246ee-574b-407f-a881-d64d8730a6b3";
const STRIPS15_NAME = "ستربس ١٥ قطعة";
const TEMPLATE_SIBLING = "bd9727ec-33c6-424b-86e4-bd6942a4f46d"; // ستربس ٧ قطع (garlic +15) — the clone template
const SAUCE_GROUP_NAME = "اختر الصوص/السلطة";
const FLAVOR_GROUP_NAME = "اختر المذاق";

// ---- Fixed ids for the desired rows (idempotent upsert-on-PK) ----
const G_SAUCE_FALLBACK = "57151502-0000-4a00-8a00-000000000001"; // only used if no sauce group exists
const G_FLAVOR = "57151501-0000-4a00-8a00-000000000001";

// Desired sauce options (live under the existing/looked-up sauce group):
const SAUCE_OPTS = [
  { id: "57151502-0000-4a00-8a00-000000000011", label: "ثومية كبيرة", price_delta: 15, sort: 1 },
  { id: "57151502-0000-4a00-8a00-000000000012", label: "ثومية صغيرة", price_delta: 0, sort: 2 },
  { id: "57151502-0000-4a00-8a00-000000000013", label: "كول سلو صغير", price_delta: 0, sort: 3 },
];
// Desired flavor options (live under «اختر المذاق»):
const FLAVOR_OPTS = [
  { id: "57151501-0000-4a00-8a00-000000000021", label: "عادي", price_delta: 0, sort: 1 },
  { id: "57151501-0000-4a00-8a00-000000000022", label: "حار", price_delta: 0, sort: 2 },
  { id: "57151501-0000-4a00-8a00-000000000023", label: "مكس", price_delta: 0, sort: 3 },
];

const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const j = (r) => r.json();

async function get(path) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
  if (!res.ok) throw new Error(`GET ${path} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
async function upsert(table, rows) {
  const res = await fetch(`${SB}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`upsert ${table} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 400)}`);
  return res.json();
}
async function delOptionsNotIn(groupId, keepIds) {
  const list = keepIds.map((x) => `"${x}"`).join(",");
  const res = await fetch(
    `${SB}/rest/v1/menu_item_choice_options?group_id=eq.${groupId}&id=not.in.(${list})`,
    { method: "DELETE", headers: { ...H, Prefer: "return=representation" } }
  );
  if (!res.ok) throw new Error(`delete in group ${groupId} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

(async () => {
  // SAFETY GUARD: target must be exactly Wesaya's ستربس ١٥ قطعة.
  const item = (await get(
    `menu_items?id=eq.${STRIPS15_ID}&restaurant_id=eq.${WESAYA_ID}&select=id,name,price`
  ))?.[0];
  if (!item) throw new Error("target ستربس ١٥ item not found under Wesaya — aborting (no write).");
  if (item.name !== STRIPS15_NAME) throw new Error(`unexpected item name «${item.name}» — aborting (no write).`);
  console.log(`target: ${item.name} (${item.id}) · price=${item.price} · tenant=Wesaya · template=ستربس ٧ قطع (${TEMPLATE_SIBLING})`);

  // 1) Resolve the sauce group (REUSE the existing «اختر الصوص/السلطة»; create only if absent).
  let sauceGroup = (await get(
    `menu_item_choice_groups?item_id=eq.${STRIPS15_ID}&name=eq.${encodeURIComponent(SAUCE_GROUP_NAME)}&select=id,name,min_select,max_select,sort&order=sort`
  ))?.[0];
  let sauceGroupId = sauceGroup?.id;
  if (!sauceGroupId) {
    await upsert("menu_item_choice_groups", [
      { id: G_SAUCE_FALLBACK, restaurant_id: WESAYA_ID, item_id: STRIPS15_ID, name: SAUCE_GROUP_NAME, min_select: 1, max_select: 1, sort: 17 },
    ]);
    sauceGroupId = G_SAUCE_FALLBACK;
  }

  // 2) Create/ensure the flavor group «اختر المذاق» (fixed id; sort right after the sauce group).
  await upsert("menu_item_choice_groups", [
    { id: G_FLAVOR, restaurant_id: WESAYA_ID, item_id: STRIPS15_ID, name: FLAVOR_GROUP_NAME, min_select: 1, max_select: 1, sort: 18 },
  ]);

  // 3) SAUCE group: upsert the 3 desired options (garlic +15), then remove any other
  //    option in it (the misplaced عادي/حار/مكس + the old +0 garlic row).
  await upsert("menu_item_choice_options", SAUCE_OPTS.map((o) => ({ ...o, group_id: sauceGroupId, restaurant_id: WESAYA_ID, active: true })));
  const removedSauce = await delOptionsNotIn(sauceGroupId, SAUCE_OPTS.map((o) => o.id));

  // 4) FLAVOR group: upsert the 3 desired options, then reconcile.
  await upsert("menu_item_choice_options", FLAVOR_OPTS.map((o) => ({ ...o, group_id: G_FLAVOR, restaurant_id: WESAYA_ID, active: true })));
  const removedFlavor = await delOptionsNotIn(G_FLAVOR, FLAVOR_OPTS.map((o) => o.id));

  console.log(`reconciled: removed ${removedSauce.length} stray option(s) from the sauce group, ${removedFlavor.length} from the flavor group.`);

  // ---- Read back the final config ----
  const groups = await get(
    `menu_item_choice_groups?item_id=eq.${STRIPS15_ID}&select=id,name,min_select,max_select,sort&order=sort`
  );
  console.log(`\n=== ستربس ١٥ قطعة now has ${groups.length} choice group(s) ===`);
  for (const g of groups) {
    const opts = await get(`menu_item_choice_options?group_id=eq.${g.id}&select=label,price_delta,sort&order=sort`);
    console.log(`  «${g.name}» (min ${g.min_select}/max ${g.max_select}): ${opts.map((o) => `${o.label}${Number(o.price_delta) ? ` +${o.price_delta}` : ""}`).join(" · ")}`);
  }
  console.log("done ✓ (price 580 / name / variants / availability untouched; garlic = +15)");
})().catch((e) => {
  console.error("FIX FAILED:", e.message || e);
  process.exit(1);
});
