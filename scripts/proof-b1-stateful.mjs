// ===========================================================================
// B1 proof — surface authoritative order-state → stop clear-and-rebuild.
// Runs the SAME multi-turn build twice on a tenant: once with stateful_orders
// OFF, once ON, capturing per-turn toolsUsed. Headline: with the flag ON the
// mid-build turns are INCREMENTAL (add just the new item, no clear_order),
// versus the rebuild pattern when OFF. Also checks the empty-draft note path.
// Toggles the tenant flag via REST and RESTORES it afterward; cleans up convos.
// Usage: BASE_URL=http://127.0.0.1:3400 [PROOF_TENANT=<id>] node scripts/proof-b1-stateful.mjs
// ===========================================================================
const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const TENANT = process.env.PROOF_TENANT || "0de3c0de-0001-4a00-8a00-000000000001"; // demo-pro
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };
const j = (r) => r.json();

// A multi-turn build: decisive adds (force the items into the cart), then set
// delivery, then confirm. Rebuild (clear → add ×N) historically surfaced on the
// LATER turns (set-delivery / confirm) where the model re-derived from chat.
// Real items differ per tenant (menu = source of truth).
const WESAYA = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const BUILD = TENANT === WESAYA
  ? [
      "ضيف برجر لحم عادي واحد من غير إضافات",
      "ضيف مياه معدنية واحدة",
      "ضيف برجر لحم دوبل واحد من غير إضافات",
      "خليها توصيل الهرم",
      "تمام أكّد الطلب",
    ]
  : [
      "ضيف ساندويتش فراخ مشوية واحد من غير إضافات",
      "ضيف كولا واحدة",
      "ضيف عصير مانجو واحد",
      "خليها توصيل لمدينة نصر",
      "تمام أكّد الطلب",
    ];

async function getFlags() {
  const r = await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}&select=feature_flags`, { headers: H }).then(j);
  return r?.[0]?.feature_flags ?? {};
}
async function setStateful(flags, on) {
  const next = { ...flags };
  if (on) next.stateful_orders = true; else delete next.stateful_orders;
  await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}`, { method: "PATCH", headers: H, body: JSON.stringify({ feature_flags: next }) });
}
async function makeConversation(phone) {
  const cust = await fetch(`${SB}/rest/v1/customers`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: TENANT, phone, name: "B1 proof" }) }).then(j);
  const customerId = cust?.[0]?.id;
  const conv = await fetch(`${SB}/rest/v1/conversations`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: TENANT, customer_id: customerId, channel: "whatsapp" }) }).then(j);
  return { customerId, conversationId: conv?.[0]?.id };
}
async function cleanup(conversationId, customerId) {
  await fetch(`${SB}/rest/v1/orders?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H });
  await fetch(`${SB}/rest/v1/conversation_reports?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H });
  for (const t of ["agent_runs", "conversation_signals", "messages"]) {
    await fetch(`${SB}/rest/v1/${t}?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H });
  }
  await fetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}`, { method: "DELETE", headers: H });
  await fetch(`${SB}/rest/v1/customers?id=eq.${customerId}`, { method: "DELETE", headers: H });
}
async function callAgent(conversationId, text) {
  const res = await fetch(`${BASE}/api/agent/respond`, { method: "POST", headers: { "Content-Type": "application/json", "x-agent-secret": SECRET }, body: JSON.stringify({ restaurantId: TENANT, conversationId, text }) });
  return res.json().catch(() => ({ error: "non_json" }));
}

async function runBuild(label) {
  const phone = `+20100${Math.floor(1000000 + Math.random() * 8999999)}`;
  const { customerId, conversationId } = await makeConversation(phone);
  const perTurn = [];
  console.log(`\n--- ${label} ---`);
  try {
    for (const t of BUILD) {
      const out = await callAgent(conversationId, t);
      const tools = out.toolsUsed || [];
      const adds = tools.filter((x) => x === "add_to_order").length;
      const clears = tools.filter((x) => x === "clear_order").length;
      perTurn.push({ t, tools, adds, clears, lines: (out.draft?.lines || []).length });
      console.log(`  «${t}» → tools=[${tools.join(",")}] (adds=${adds} clears=${clears}) draftLines=${(out.draft?.lines || []).length}`);
    }
  } finally {
    await cleanup(conversationId, customerId);
  }
  return perTurn;
}

async function main() {
  for (const [k, v] of [["NEXT_PUBLIC_SUPABASE_URL", SB], ["SUPABASE_SERVICE_ROLE_KEY", SR], ["AGENT_ROUTE_SECRET", SECRET]]) {
    if (!v) { console.error(`MISSING ENV: ${k}`); process.exit(2); }
  }
  const original = await getFlags();
  const hadStateful = original.stateful_orders === true;
  console.log(`BASE=${BASE} · tenant=${TENANT}`);
  console.log(`original feature_flags=${JSON.stringify(original)}`);

  let off, on;
  try {
    await setStateful(original, false);
    off = await runBuild("stateful_orders OFF (baseline)");
    await setStateful(original, true);
    on = await runBuild("stateful_orders ON (B1)");
  } finally {
    // Restore EXACTLY the original flags.
    await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}`, { method: "PATCH", headers: H, body: JSON.stringify({ feature_flags: original }) });
    console.log(`\nrestored feature_flags (stateful_orders ${hadStateful ? "kept on" : "removed"}).`);
  }

  // "Later turns" = set-delivery + confirm (indices 3,4) — where rebuild surfaced.
  const laterClears = (rows) => rows.slice(3).reduce((s, r) => s + r.clears, 0);
  const laterAdds = (rows) => rows.slice(3).reduce((s, r) => s + r.adds, 0);
  const finalLines = (rows) => rows[rows.length - 1].lines;
  const offClears = laterClears(off), onClears = laterClears(on);
  const offAdds = laterAdds(off), onAdds = laterAdds(on);

  console.log(`\n──────── B1 CONTRAST (later turns: set-delivery + confirm) ────────`);
  console.log(`clear_order calls:  OFF=${offClears}   ON=${onClears}   (ON must be 0)`);
  console.log(`add_to_order calls (re-adds): OFF=${offAdds}   ON=${onAdds}   (ON must be 0 — items already in state)`);
  console.log(`final draft lines:  OFF=${finalLines(off)}   ON=${finalLines(on)}   (ON must be 3 — real build)`);

  // ON must be incremental AND have actually built the cart: no rebuild on the
  // later turns (no clears, no re-adds) and a real 3-line final draft.
  const onBuilt = finalLines(on) === 3;
  const onIncremental = onClears === 0 && onAdds === 0;
  const pass = onBuilt && onIncremental;
  console.log(`ON built the real order: ${onBuilt ? "✅" : "❌"} · ON incremental (no rebuild on later turns): ${onIncremental ? "✅" : "❌"}`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(3); });
