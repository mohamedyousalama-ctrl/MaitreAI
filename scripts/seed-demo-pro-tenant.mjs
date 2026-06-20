// ============================================================================
// MaitreAI — Seed the DEMO-PRO test tenant (Karim Pro test-bed)
// ----------------------------------------------------------------------------
// Creates ONE dedicated, throwaway-safe Pro tenant — «مطعم التجربة برو» (Demo Pro)
// — in production Supabase so the REAL engine (the same runCustomerTurn the
// WhatsApp webhook uses) can talk as it. It is the shared test-bed for (1) the
// Pro-aware eval/T1 harness and (2) the upcoming web-chat demo surface.
//
// tier='pro' + feature_flags={conversation_intelligence:true} (P1 ON from day
// one; nothing else — later Ps stay explicit per-tenant). agent_mode='test' so it
// can never be mistaken for a live client. Egyptian dialect, currency ج.م.
//
// ADDITIVE + IDEMPOTENT: every public-schema row uses a FIXED UUID and is
// upserted on its primary key, so re-running is a no-op (never duplicates). The
// owner is a dedicated auth user keyed by a FIXED EMAIL (create-or-find), so the
// owner UID is stable across runs. It touches NO existing tenant (it only ever
// writes rows under the fixed demo restaurant_id / demo owner email).
//
// Required env (same surface as scripts/test-agent-live.mjs):
//   NEXT_PUBLIC_SUPABASE_URL    Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY   service-role key (PostgREST + GoTrue admin)
// Optional env:
//   DEMO_PRO_OWNER_PASSWORD     password for the demo owner (default below; a
//                               test-only credential on a .test email)
//
// Usage:  node scripts/seed-demo-pro-tenant.mjs
// ============================================================================

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_PASSWORD = process.env.DEMO_PRO_OWNER_PASSWORD || "DemoPro!2026";

if (!SB || !SR) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ---- Fixed identities (stable so the harness + web-chat can reference them) ----
// The demo-pro restaurant_id — hardcoded + documented in the PR so callers can
// target the tenant by a known id.
const RESTAURANT_ID = "0de3c0de-0001-4a00-8a00-000000000001";
const OWNER_EMAIL = "demo-pro-owner@maitreai.test";

const CAT = {
  sandwiches: "0de3c0de-0002-4a00-8a00-000000000010",
  meals: "0de3c0de-0002-4a00-8a00-000000000011",
  drinks: "0de3c0de-0002-4a00-8a00-000000000012",
};
const ITEM = {
  chickenSandwich: "0de3c0de-0003-4a00-8a00-000000000020",
  koftaSandwich: "0de3c0de-0003-4a00-8a00-000000000021",
  friesSandwich: "0de3c0de-0003-4a00-8a00-000000000022",
  broastedMeal: "0de3c0de-0003-4a00-8a00-000000000023",
  koftaMeal: "0de3c0de-0003-4a00-8a00-000000000024",
  cola: "0de3c0de-0003-4a00-8a00-000000000025",
  mango: "0de3c0de-0003-4a00-8a00-000000000026",
};
const MOD = {
  extraCheese: "0de3c0de-0004-4a00-8a00-000000000030",
  spicySauce: "0de3c0de-0004-4a00-8a00-000000000031",
};
const ITEM_MOD = {
  chickenCheese: "0de3c0de-0005-4a00-8a00-000000000040",
  chickenSpicy: "0de3c0de-0005-4a00-8a00-000000000041",
};
const BRANCH_ID = "0de3c0de-0006-4a00-8a00-000000000050";
const ZONE_ID = "0de3c0de-0007-4a00-8a00-000000000060";
const PROMO_ID = "0de3c0de-0008-4a00-8a00-000000000070";
const POLICY = {
  delivery: "0de3c0de-0009-4a00-8a00-000000000080",
  payment: "0de3c0de-0009-4a00-8a00-000000000081",
};
const FAQ = {
  hours: "0de3c0de-000a-4a00-8a00-000000000090",
  area: "0de3c0de-000a-4a00-8a00-000000000091",
};

// ---- REST + GoTrue helpers (service-role; mirrors scripts/test-agent-live.mjs) ----
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const j = (r) => r.json();

/** Upsert rows on their primary key (id). PostgREST merge-duplicates → re-running
 *  updates in place, never duplicates. */
async function upsert(table, rows) {
  const res = await fetch(`${SB}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`upsert ${table} failed (HTTP ${res.status}): ${body.slice(0, 500)}`);
  }
  return res.json();
}

async function count(table) {
  const rows = await fetch(`${SB}/rest/v1/${table}?restaurant_id=eq.${RESTAURANT_ID}&select=id`, { headers: H }).then(j);
  return Array.isArray(rows) ? rows.length : 0;
}

/** Create the demo owner auth user, or find it if it already exists (idempotent
 *  by the fixed email). members.user_id is FK→auth.users, so a real auth row is
 *  required; a distinct dedicated owner keeps resolveRestaurant() unambiguous. */
async function getOrCreateOwner() {
  const create = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, email_confirm: true }),
  });
  if (create.ok) {
    const u = await create.json();
    return { id: u.id, created: true };
  }
  // Already exists (or other) → look it up by email in the admin list.
  const list = await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=1000`, { headers: H }).then(j);
  const users = Array.isArray(list?.users) ? list.users : [];
  const found = users.find((u) => (u.email || "").toLowerCase() === OWNER_EMAIL.toLowerCase());
  if (!found) {
    const body = await create.text().catch(() => "");
    throw new Error(`owner create failed and not found by email: ${body.slice(0, 300)}`);
  }
  return { id: found.id, created: false };
}

(async () => {
  console.log(`Seeding DEMO-PRO tenant → ${RESTAURANT_ID}`);

  // 1) Owner auth user (FK target for members) — create-or-find by fixed email.
  const owner = await getOrCreateOwner();
  console.log(`owner: ${owner.id} (${owner.created ? "created" : "existing"}) <${OWNER_EMAIL}>`);

  // 2) Restaurant — Pro tier + P1 flag ONLY + test mode + Egyptian/EGP.
  await upsert("restaurants", [
    {
      id: RESTAURANT_ID,
      name: "مطعم التجربة برو",
      tier: "pro",
      feature_flags: { conversation_intelligence: true },
      agent_mode: "test",
      is_open: true,
      dialect: "egyptian",
      currency: "ج.م",
      country: "EG",
      default_language: "ar",
      timezone: "Africa/Cairo",
      business_type: "مطعم وجبات سريعة",
      agent_persona_name: "كريم",
      ai_tone: { greeting: "أهلاً بيك في مطعم التجربة برو 👋" },
    },
  ]);

  // 3) Member link (now that both restaurant + auth user exist).
  await upsert("members", [
    { restaurant_id: RESTAURANT_ID, user_id: owner.id, role: "manager" },
  ]);

  // 4) Categories.
  await upsert("menu_categories", [
    { id: CAT.sandwiches, restaurant_id: RESTAURANT_ID, name: "ساندويتشات", sort: 1 },
    { id: CAT.meals, restaurant_id: RESTAURANT_ID, name: "وجبات", sort: 2 },
    { id: CAT.drinks, restaurant_id: RESTAURANT_ID, name: "مشروبات", sort: 3 },
  ]);

  // 5) Modifiers (for the option-walk / recap path on the chicken sandwich).
  await upsert("modifiers", [
    { id: MOD.extraCheese, restaurant_id: RESTAURANT_ID, name: "جبنة إضافية", price_impact: 10, active: true },
    { id: MOD.spicySauce, restaurant_id: RESTAURANT_ID, name: "صوص حار", price_impact: 5, active: true },
  ]);

  // 6) Menu items — small, coherent, all available, real EGP prices.
  await upsert("menu_items", [
    { id: ITEM.chickenSandwich, restaurant_id: RESTAURANT_ID, category_id: CAT.sandwiches, name: "ساندويتش فراخ مشوية", price: 65, available: true, ingredients: ["فراخ مشوية", "خبز", "خس", "طماطم"], allergens: [] },
    { id: ITEM.koftaSandwich, restaurant_id: RESTAURANT_ID, category_id: CAT.sandwiches, name: "ساندويتش كفتة", price: 70, available: true, ingredients: ["كفتة", "خبز", "طحينة"], allergens: ["سمسم"] },
    { id: ITEM.friesSandwich, restaurant_id: RESTAURANT_ID, category_id: CAT.sandwiches, name: "ساندويتش بطاطس", price: 35, available: true, ingredients: ["بطاطس", "خبز"], allergens: [] },
    { id: ITEM.broastedMeal, restaurant_id: RESTAURANT_ID, category_id: CAT.meals, name: "وجبة فراخ بروستد", price: 120, available: true, ingredients: ["فراخ بروستد", "بطاطس", "خبز", "صوص"], allergens: [] },
    { id: ITEM.koftaMeal, restaurant_id: RESTAURANT_ID, category_id: CAT.meals, name: "وجبة كفتة مشوية", price: 135, available: true, ingredients: ["كفتة مشوية", "أرز", "سلطة"], allergens: ["سمسم"] },
    { id: ITEM.cola, restaurant_id: RESTAURANT_ID, category_id: CAT.drinks, name: "كولا", price: 20, available: true, ingredients: [], allergens: [] },
    { id: ITEM.mango, restaurant_id: RESTAURANT_ID, category_id: CAT.drinks, name: "عصير مانجو", price: 30, available: true, ingredients: ["مانجو"], allergens: [] },
  ]);

  // 7) Item↔modifier links (chicken sandwich gets both options).
  await upsert("menu_item_modifiers", [
    { id: ITEM_MOD.chickenCheese, restaurant_id: RESTAURANT_ID, item_id: ITEM.chickenSandwich, modifier_id: MOD.extraCheese },
    { id: ITEM_MOD.chickenSpicy, restaurant_id: RESTAURANT_ID, item_id: ITEM.chickenSandwich, modifier_id: MOD.spicySauce },
  ]);

  // 8) Branch + delivery zone (so delivery/fee/min-order/fulfillment paths work).
  await upsert("branches", [
    { id: BRANCH_ID, restaurant_id: RESTAURANT_ID, name: "فرع التجربة - مدينة نصر", phone: "+201000000000", address: "مدينة نصر، القاهرة", hours: { open: "12:00", close: "00:00" }, active: true },
  ]);
  await upsert("delivery_zones", [
    { id: ZONE_ID, restaurant_id: RESTAURANT_ID, branch_id: BRANCH_ID, name: "مدينة نصر", fee: 10, min_order: 30, eta_minutes: 45, active: true },
  ]);

  // 9) One REAL, currently-active promo (so «عندكم عروض؟» cites a real row, not
  //    escalation). state='active' + schedule window covering now (isPromoActiveNow).
  await upsert("promotions", [
    {
      id: PROMO_ID,
      restaurant_id: RESTAURANT_ID,
      name: "عرض الافتتاح",
      type: "percent_off",
      config: { scopeType: "all", scopeLabel: "كل الطلبات", amount: 15, caption: "خصم ١٥٪ على أول طلب من مطعم التجربة برو" },
      code: "OPEN15",
      schedule: { start: "2020-01-01T00:00:00.000Z", end: "2030-01-01T00:00:00.000Z" },
      state: "active",
    },
  ]);

  // 10) Light policies + FAQs (grounded Q&A).
  await upsert("policies", [
    { id: POLICY.delivery, restaurant_id: RESTAURANT_ID, key: "delivery", text: "التوصيل خلال ٤٥ دقيقة داخل مدينة نصر. رسوم التوصيل ١٠ ج.م والحد الأدنى للطلب ٣٠ ج.م." },
    { id: POLICY.payment, restaurant_id: RESTAURANT_ID, key: "payment", text: "الدفع كاش عند الاستلام متاح حاليًا. المحافظ الإلكترونية قريبًا." },
  ]);
  await upsert("faqs", [
    { id: FAQ.hours, restaurant_id: RESTAURANT_ID, question: "إيه مواعيد العمل؟", answer: "بنفتح يوميًا من ١٢ ظهرًا حتى ١٢ منتصف الليل.", active: true },
    { id: FAQ.area, restaurant_id: RESTAURANT_ID, question: "بتوصلوا فين؟", answer: "بنوصل حاليًا لمدينة نصر، ومناطق تانية قريبًا.", active: true },
  ]);

  // ---- Summary ----
  const [items, branches, zones, promos, cats, mods, pols, faqs] = await Promise.all([
    count("menu_items"), count("branches"), count("delivery_zones"), count("promotions"),
    count("menu_categories"), count("modifiers"), count("policies"), count("faqs"),
  ]);
  console.log("\n=== DEMO-PRO seeded ===");
  console.log(`restaurant_id : ${RESTAURANT_ID}`);
  console.log(`name          : مطعم التجربة برو`);
  console.log(`tier / flags  : pro / {conversation_intelligence:true}`);
  console.log(`agent_mode    : test   ·   dialect: egyptian   ·   currency: ج.م`);
  console.log(`owner         : ${owner.id} <${OWNER_EMAIL}>`);
  console.log(`inventory     : ${cats} categories · ${items} items · ${mods} modifiers · ${branches} branch · ${zones} zone · ${promos} promo · ${pols} policies · ${faqs} faqs`);
  console.log("done ✓");
})().catch((e) => {
  console.error("SEED FAILED:", e.message || e);
  process.exit(1);
});
