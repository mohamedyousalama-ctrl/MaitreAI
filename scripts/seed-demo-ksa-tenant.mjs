// ============================================================================
// MaitreAI — Seed the DEMO-KSA test tenant (Khalid / KSA test-bed)
// ----------------------------------------------------------------------------
// Creates ONE dedicated, throwaway-safe KSA tenant — «مطعم الديرة (تجريبي)» — in
// Supabase so the REAL engine (the same runCustomerTurn the WhatsApp webhook uses)
// can talk as a Saudi restaurant. It is the Sweet-Shop-style KSA dev tenant used by
// the Khalid golden evals (scripts/eval-scenarios.mjs · EVAL_MODE=ksa).
//
// KSA config (reactivation, per docs/KIVO_SAUDIZATION_ROADMAP.md KSA-0):
//   dialect='saudi' · currency='ر.س' · country='SA' · timezone='Asia/Riyadh'
//   tax_mode='added' · tax_rate=15.00 (KSA VAT)
//   feature_flags = the public demo's real 20-flag set (khalid_persona ON);
//     region is prompt-level config (NO schema change — jsonb; see
//     docs/KHALID_PERSONA_WIRING.md). agent_mode='test' so it is never a live client.
//
// ADDITIVE + IDEMPOTENT: every row uses a FIXED UUID and is upserted on its primary
// key; re-running is a no-op. The owner is a dedicated auth user keyed by a FIXED
// EMAIL. It touches NO existing tenant (writes only under the fixed demo ids/email).
//
// Menu = real Saudi staples with real ر.س prices, so the KSA evals have genuine menu
// truth to test against (kabsa, gahwa+dates pairing, laban, luqaimat) and a real nut
// allergen on kabsa laham for the safety-in-dialect case.
//
// Required env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env:  DEMO_KSA_OWNER_PASSWORD (default below; test-only .test credential)
// Usage:  node scripts/seed-demo-ksa-tenant.mjs
// ============================================================================

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_PASSWORD = process.env.DEMO_KSA_OWNER_PASSWORD || "DemoKsa!2026";

if (!SB || !SR) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ---- Fixed identities (must match DEMO_KSA_RESTAURANT_ID in eval-scenarios.mjs) ----
const RESTAURANT_ID = "0de3c0de-0002-4a00-8a00-000000000002";
const OWNER_EMAIL = "demo-ksa-owner@maitreai.test";

// Child rows use a distinct 0de5ca5a-* namespace (no overlap with demo-pro's 0de3c0de-*).
const CAT = {
  mains: "0de5ca5a-0001-4a00-8a00-000000000010",
  drinks: "0de5ca5a-0001-4a00-8a00-000000000011",
  sweets: "0de5ca5a-0001-4a00-8a00-000000000012",
};
const ITEM = {
  kabsaDajaj: "0de5ca5a-0002-4a00-8a00-000000000020",
  kabsaLaham: "0de5ca5a-0002-4a00-8a00-000000000021",
  mandiDajaj: "0de5ca5a-0002-4a00-8a00-000000000022",
  jareesh: "0de5ca5a-0002-4a00-8a00-000000000023",
  laban: "0de5ca5a-0002-4a00-8a00-000000000024",
  gahwa: "0de5ca5a-0002-4a00-8a00-000000000025",
  tamr: "0de5ca5a-0002-4a00-8a00-000000000026",
  luqaimat: "0de5ca5a-0002-4a00-8a00-000000000027",
};
const MOD = {
  extraNuts: "0de5ca5a-0003-4a00-8a00-000000000030", // زيادة مكسرات (allergen-relevant)
  daggus: "0de5ca5a-0003-4a00-8a00-000000000031",    // دقوس حار
};
const ITEM_MOD = {
  kabsaLahamNuts: "0de5ca5a-0004-4a00-8a00-000000000040",
  kabsaDajajDaggus: "0de5ca5a-0004-4a00-8a00-000000000041",
};
const BRANCH_ID = "0de5ca5a-0005-4a00-8a00-000000000050";
const ZONE_ID = "0de5ca5a-0006-4a00-8a00-000000000060";
const PROMO_ID = "0de5ca5a-0007-4a00-8a00-000000000070";
const POLICY = {
  delivery: "0de5ca5a-0008-4a00-8a00-000000000080",
  payment: "0de5ca5a-0008-4a00-8a00-000000000081",
};
const FAQ = {
  hours: "0de5ca5a-0009-4a00-8a00-000000000090",
  area: "0de5ca5a-0009-4a00-8a00-000000000091",
};

const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const j = (r) => r.json();

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
  console.log(`Seeding DEMO-KSA tenant → ${RESTAURANT_ID}`);

  // 1) Owner auth user.
  const owner = await getOrCreateOwner();
  console.log(`owner: ${owner.id} (${owner.created ? "created" : "existing"}) <${OWNER_EMAIL}>`);

  // 2) Restaurant — Saudi/ر.س/SA/Riyadh + KSA VAT 15% + the PUBLIC DEMO's real flag set.
  //
  // This used to seed `{ khalid_persona: false }` while the live demo tenant runs it
  // TRUE, and the upsert is keyed on the primary key — so re-running this script
  // silently switched Khalid off and the public page at /demo started answering as the
  // default agent wearing his name, mid-pitch, with no error anywhere. The seed now
  // writes exactly what the demo depends on.
  //
  // DELIBERATELY ABSENT, and they must stay absent:
  //   voice_notes   — the WHATSAPP outbound voice path and its per-conversation daily
  //                   billing counters, which belong to a real tenant. Held OFF so the
  //                   demo tenant never enters that budget.
  //
  //                   G0-R IS NOT SUPERSEDED, AND THIS CODE DOES NOT MOVE IT. An earlier
  //                   revision of this comment claimed G0-R was superseded by the Founder's
  //                   request for a speaking demo. THAT WAS WRONG and is corrected here.
  //                   G0-R is Rights Remediation in the Khalid R4 program (Linear project
  //                   a94730d2-cb63-484f-910a-6483e7e60ddb) and its state is BLOCKED. Its
  //                   governing rule is explicit: while G0-R is blocked there is NO PROVIDER
  //                   VOICE GENERATION and NO CUSTOMER EXPOSURE; the blocked rule "is
  //                   evaluated first and is unoverridable; fail closed" (KIV-219 constraint
  //                   6); and "no chat summary, builder narrative, issue completion, or
  //                   planning approval moves a gate without independently inspectable
  //                   evidence." Founder interest is not gate approval, and an implementer
  //                   never clears a gate over its own work. A code comment cannot move a
  //                   rights gate, and this one does not.
  //
  //                   WHAT THE VOICE CODE ACTUALLY IS: the machine enforcement that keeps
  //                   G0-R held on this surface. lib/demo/voice-out.ts is fail-closed by
  //                   construction — with no explicit TTS_ADAPTER pin plus a key and a
  //                   voice id, demoVoiceProviderPinned() is false and the demo emits NO
  //                   generated voice at all. Provider generation therefore requires a
  //                   deliberate act by the account operator, which is where the gate
  //                   decision belongs, not a code path that can drift into it. On top of
  //                   that: inference is never trusted (it is what silently selects OpenAI
  //                   onyx), ElevenLabs stock voice ids are refused, a model we cannot
  //                   price is refused, there is a hard 600-character cap before any
  //                   provider call, no onyx fallback is bought or shipped, and every
  //                   synthesis writes an agent_runs row the spend monitor can see.
  //                   proof-public-demo-hardening.test.ts enforces containment:
  //                   lib/demo/voice-out.ts is the ONLY demo file permitted to reach a
  //                   provider, so nothing can route around those controls.
  //
  //                   SO: enabling the demo's voice is a G0-R action, not a deploy detail.
  //                   It needs the gate cleared on inspectable evidence (KIV-90 / 92 / 93 /
  //                   95 remain open) — not an env var set because the code is ready.
  //   psp_payments  — real money. Nothing on a public page may reach a live PSP.
  //   allergy_simple / allergy_calm_hold / allergy_companion_mode — held OFF on purpose
  //                   so the flag-OFF deterministic gate fires and the visitor sees the
  //                   escalate-to-human OR continue choice the Founder specified.
  await upsert("restaurants", [
    {
      id: RESTAURANT_ID,
      name: "مطعم الديرة (تجريبي)",
      feature_flags: {
        khalid_persona: true,
        khalid_region: "najd",
        goal_logic: true,
        // ON because the flag-OFF path SHORT-CIRCUITS an unsure perception read into a
        // canned question with nothing tappable on screen. Live: «جوعان» — "I'm hungry",
        // the single most natural thing a customer says to a restaurant — was answered
        // «ودّي أساعدك صح — توضّح لي أكثر وش تحب بالضبط؟» and no menu. That reply is our
        // own deterministic code breaking the prompt's own ANTI-DEFLECTION rule, which
        // forbids a "pick one and tell me" with no options named. With this ON the model
        // keeps the turn, sees the history the pre-read lacked, and answers with food.
        goal_logic_rule6_annotation_pivot: true,
        perception: true,
        finish_line: true,
        answer_first: true,
        kitchen_ticket: true,
        customer_memory: true,
        stateful_orders: true,
        ksa_encyclopedia: true,
        price_truth_guard: true,
        action_claim_guard: true,
        media_turn_trigger: true,
        voice_garble_guard: true,
        dup_order_awareness: true,
        memory_allergy_gate: true,
        typed_quantity_fill: true,
        typed_interactive_actions: true,
        // ADDRESS. The demo seeds a real Riyadh delivery zone («حي العليا», 12 ر.س, 45 min,
        // 30 ر.س minimum) and then handled a written address on the LEGACY path, which does
        // not match it — so a visitor typing their own neighbourhood got no deterministic
        // zone resolution, on a demo whose whole argument is that the deterministic layer
        // owns the facts. This flag was not deliberately withheld the way voice_notes and
        // psp_payments are below; it was simply never added.
        address_flow_v2: true,
        allergen_symptom_detection: true,
        deterministic_allergen_safety: true,
      },
      agent_mode: "test",
      is_open: true,
      dialect: "saudi",
      currency: "ر.س",
      country: "SA",
      default_language: "ar",
      timezone: "Asia/Riyadh",
      business_type: "مطعم سعودي شعبي",
      agent_persona_name: "خالد",
      tax_mode: "added",
      tax_rate: 15.0,
      ai_tone: { greeting: "هلا والله في مطعم الديرة 🌟" },
    },
  ]);

  // 3) Member link.
  await upsert("members", [{ restaurant_id: RESTAURANT_ID, user_id: owner.id, role: "manager" }]);

  // 4) Categories.
  await upsert("menu_categories", [
    { id: CAT.mains, restaurant_id: RESTAURANT_ID, name: "أطباق رئيسية", sort: 1 },
    { id: CAT.drinks, restaurant_id: RESTAURANT_ID, name: "مشروبات", sort: 2 },
    { id: CAT.sweets, restaurant_id: RESTAURANT_ID, name: "حلا", sort: 3 },
  ]);

  // 5) Modifiers (nut add-on = allergen-relevant; دقوس = the item's real sauce option).
  await upsert("modifiers", [
    { id: MOD.extraNuts, restaurant_id: RESTAURANT_ID, name: "زيادة مكسرات", price_impact: 5, active: true },
    { id: MOD.daggus, restaurant_id: RESTAURANT_ID, name: "دقوس حار", price_impact: 0, active: true },
  ]);

  // 6) Menu items — real Saudi staples, real ر.س prices. kabsa laham carries a real
  //    nut allergen (garnish); laban/jareesh carry dairy/gluten — real menu truth.
  // Descriptions are DELIBERATELY backed by each item's own `ingredients` array below —
  // khalid.ts:361 orders him to sell on "honest sensory truth from the item's OWN data
  // (never a stat you can't back)", and prompt.ts:273 only surfaces a description if one
  // exists. All 8 were empty, so he was ordered to sell with nothing to sell on. No
  // claim here goes beyond the ingredients: no "الأكثر طلباً" (the data carries no order
  // volume), no superlatives, no health claims.
  await upsert("menu_items", [
    { id: ITEM.kabsaDajaj, restaurant_id: RESTAURANT_ID, category_id: CAT.mains, name: "كبسة دجاج", description: "رز مطبوخ بمرق الدجاج وبهار الكبسة واللومي، وفوقه دجاج طري يفكّ من العظم.", price: 32, available: true, ingredients: ["أرز", "دجاج", "بهارات كبسة"], allergens: [] },
    { id: ITEM.kabsaLaham, restaurant_id: RESTAURANT_ID, category_id: CAT.mains, name: "كبسة لحم", description: "رز بهار الكبسة مع لحم غنم طري يفكّ من العظم، مزيّن بلوز محمّص وزبيب.", price: 55, available: true, ingredients: ["أرز", "لحم", "بهارات كبسة", "لوز", "زبيب"], allergens: ["مكسرات"] },
    { id: ITEM.mandiDajaj, restaurant_id: RESTAURANT_ID, category_id: CAT.mains, name: "مندي دجاج", description: "دجاج ينطبخ بالتنور على الحطب لين يفكّ من العظم، وتحته رز شارب من مرقه.", price: 30, available: true, ingredients: ["أرز", "دجاج"], allergens: [] },
    { id: ITEM.jareesh, restaurant_id: RESTAURANT_ID, category_id: CAT.mains, name: "جريش", description: "قمح مجروش يُطبخ على مهل باللبن لين يصير كريمي، وفوقه بصل محمّر — أكلة نجدية دافئة ومشبعة.", price: 28, available: true, ingredients: ["قمح مجروش", "لبن", "بصل"], allergens: ["قمح", "لبن"] },
    { id: ITEM.laban, restaurant_id: RESTAURANT_ID, category_id: CAT.drinks, name: "لبن بارد", description: "يقطع دسم الرز والمشوي — بارد وحامض خفيف.", price: 6, available: true, ingredients: ["لبن"], allergens: ["لبن"] },
    { id: ITEM.gahwa, restaurant_id: RESTAURANT_ID, category_id: CAT.drinks, name: "قهوة عربية", description: "قهوة فاتحة بالهيل والزعفران — ما تكمل إلا مع التمر.", price: 8, available: true, ingredients: ["قهوة", "هيل", "زعفران"], allergens: [] },
    { id: ITEM.tamr, restaurant_id: RESTAURANT_ID, category_id: CAT.sweets, name: "تمر سكري", description: "سكري ذهبي هشّ وحلو — رفيق فنجال القهوة.", price: 12, available: true, ingredients: ["تمر"], allergens: [] },
    { id: ITEM.luqaimat, restaurant_id: RESTAURANT_ID, category_id: CAT.sweets, name: "لقيمات", description: "كور ذهبية مقلية، مقرمشة من برّا وطرية من جوّا، مغموسة بالقطر وتجيك سخنة.", price: 18, available: true, ingredients: ["دقيق", "قطر"], allergens: ["قمح"] },
  ]);

  // 7) Item↔modifier links (kabsa laham → extra nuts; kabsa dajaj → daggus).
  await upsert("menu_item_modifiers", [
    { id: ITEM_MOD.kabsaLahamNuts, restaurant_id: RESTAURANT_ID, item_id: ITEM.kabsaLaham, modifier_id: MOD.extraNuts },
    { id: ITEM_MOD.kabsaDajajDaggus, restaurant_id: RESTAURANT_ID, item_id: ITEM.kabsaDajaj, modifier_id: MOD.daggus },
  ]);

  // DISH PHOTOS. Vector illustrations under public/demo-dishes, served from the demo's own
  // origin. Owned outright — the demo previously carried one hotlinked third-party JPEG on
  // all eight items, which was somebody else's file on somebody else's server, applied to
  // dishes it did not depict: the Arabic coffee, the laban, the dates and the luqaimat all
  // showed a lamb platter. This project already carries a permanent rights FAIL (G0-H), so
  // "borrowed" media is the one shortcut it cannot afford.
  const DISH_IMAGE = {
    "كبسة لحم": "kabsa-lahm", "كبسة دجاج": "kabsa-dajaj", "مندي دجاج": "mandi-dajaj",
    "جريش": "jareesh", "لقيمات": "luqaimat", "قهوة عربية": "gahwa-arabiyya",
    "تمر سكري": "tamr-sukkari", "لبن بارد": "laban-barid",
  };
  void DISH_IMAGE; // consumed by the image_url column below / by scripts/seed-demo-dish-photos.mjs

  // 8) Branch + delivery zone (Riyadh).
  await upsert("branches", [
    { id: BRANCH_ID, restaurant_id: RESTAURANT_ID, name: "فرع الرياض - العليا", phone: "+966500000000", address: "حي العليا، الرياض", hours: { open: "11:00", close: "01:00" }, active: true },
  ]);
  await upsert("delivery_zones", [
    { id: ZONE_ID, restaurant_id: RESTAURANT_ID, branch_id: BRANCH_ID, name: "حي العليا", fee: 12, min_order: 30, eta_minutes: 45, active: true },
  ]);

  // 9) One REAL active promo (so «عندكم عروض؟» cites a real row, not escalation).
  await upsert("promotions", [
    {
      id: PROMO_ID,
      restaurant_id: RESTAURANT_ID,
      name: "عرض الافتتاح",
      type: "percent_off",
      // scopeLabel USED TO SAY «كل الطلبات» while the caption right beside it said «أول
      // طلب». promoDescription() renders scopeLabel, so the agent told customers the
      // discount applied to every order when the promo's own caption says first order
      // only — the record contradicted itself, and the agent faithfully repeated the
      // wrong half. Both now say the same thing.
      config: { scopeType: "first_order", scopeLabel: "أول طلب", amount: 15, caption: "خصم ١٥٪ على أول طلب — بكود AHLAN15" },
      code: "AHLAN15",
      schedule: { start: "2020-01-01T00:00:00.000Z", end: "2030-01-01T00:00:00.000Z" },
      state: "active",
    },
  ]);

  // 10) Policies + FAQs (mada/COD payment, Riyadh delivery).
  await upsert("policies", [
    { id: POLICY.delivery, restaurant_id: RESTAURANT_ID, key: "delivery", text: "التوصيل خلال ٤٥ دقيقة داخل حي العليا. رسوم التوصيل ١٢ ر.س والحد الأدنى للطلب ٣٠ ر.س." },
    { id: POLICY.payment, restaurant_id: RESTAURANT_ID, key: "payment", text: "الدفع بمدى أو نقداً عند الاستلام متاح حالياً. أسعار المنيو لا تشمل ضريبة القيمة المضافة ١٥٪ — تُضاف الضريبة على الإجمالي عند الطلب." },
  ]);
  await upsert("faqs", [
    { id: FAQ.hours, restaurant_id: RESTAURANT_ID, question: "وش أوقات العمل؟", answer: "نفتح يومياً من ١١ صباحاً حتى ١ بعد منتصف الليل.", active: true },
    { id: FAQ.area, restaurant_id: RESTAURANT_ID, question: "وين توصلون؟", answer: "نوصّل حالياً لحي العليا بالرياض، ومناطق ثانية قريباً.", active: true },
  ]);

  // ---- Summary ----
  const [items, branches, zones, promos, cats, mods, pols, faqs] = await Promise.all([
    count("menu_items"), count("branches"), count("delivery_zones"), count("promotions"),
    count("menu_categories"), count("modifiers"), count("policies"), count("faqs"),
  ]);
  console.log("\n=== DEMO-KSA seeded ===");
  console.log(`restaurant_id : ${RESTAURANT_ID}`);
  console.log(`name          : مطعم الديرة (تجريبي)`);
  console.log(`flags         : 20 demo flags, khalid_persona ON (no voice_notes, no psp_payments)`);
  console.log(`agent_mode    : test   ·   dialect: saudi   ·   currency: ر.س   ·   VAT: added 15%`);
  console.log(`owner         : ${owner.id} <${OWNER_EMAIL}>`);
  console.log(`inventory     : ${cats} categories · ${items} items · ${mods} modifiers · ${branches} branch · ${zones} zone · ${promos} promo · ${pols} policies · ${faqs} faqs`);
  console.log("Run the Khalid evals:  EVAL_MODE=ksa node scripts/eval-scenarios.mjs");
  console.log("done ✓");
})().catch((e) => {
  console.error("SEED FAILED:", e.message || e);
  process.exit(1);
});
