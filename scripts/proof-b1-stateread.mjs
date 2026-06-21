// ===========================================================================
// B1 proof (deterministic, mechanism) — the model READS the authoritative
// «الطلب الحالي» block instead of re-deriving from chat.
//   1) STATE-READ: build 2 items with stateful_orders ON, then a pure review
//      turn («اقرا لي الطلب») → reply names BOTH items, NO add_to_order/clear,
//      draft unchanged (= read from state, not rebuilt).
//   2) EMPTY-DRAFT: fresh conversation, ON, review turn → model says the cart is
//      empty (block's explicit "no order being built" note), no phantom items.
// Toggles stateful_orders ON for the tenant, restores afterward, cleans up.
// Usage: BASE_URL=… [PROOF_TENANT=<id>] node scripts/proof-b1-stateread.mjs
// ===========================================================================
const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const TENANT = process.env.PROOF_TENANT || "0de3c0de-0001-4a00-8a00-000000000001"; // demo-pro
const WESAYA = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };
const j = (r) => r.json();
const has = (s, words) => words.filter((w) => String(s).includes(w));

// Two real items + the expected name fragments to find in a read-back.
const ITEMS = TENANT === WESAYA
  ? { add: ["ضيف برجر لحم عادي واحد من غير إضافات", "ضيف مياه معدنية واحدة"], names: ["برجر", "مياه"] }
  : { add: ["ضيف ساندويتش فراخ مشوية واحد من غير إضافات", "ضيف كولا واحدة"], names: ["فراخ", "كولا"] };
const REVIEW = "اقرا لي الطلب اللي عندي دلوقتي";

async function getFlags() {
  const r = await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}&select=feature_flags`, { headers: H }).then(j);
  return r?.[0]?.feature_flags ?? {};
}
async function patchFlags(flags) {
  await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}`, { method: "PATCH", headers: H, body: JSON.stringify({ feature_flags: flags }) });
}
async function makeConversation(phone) {
  const cust = await fetch(`${SB}/rest/v1/customers`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: TENANT, phone, name: "B1 stateread" }) }).then(j);
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

const results = [];
const rec = (id, pass, notes) => { results.push({ id, pass }); console.log(`  → ${pass ? "✅ PASS" : "❌ FAIL"} — ${notes}`); };

async function main() {
  for (const [k, v] of [["SB", SB], ["SR", SR], ["SECRET", SECRET]]) if (!v) { console.error(`MISSING ENV ${k}`); process.exit(2); }
  const original = await getFlags();
  console.log(`BASE=${BASE} · tenant=${TENANT} · original flags=${JSON.stringify(original)}`);
  try {
    await patchFlags({ ...original, stateful_orders: true });

    // 1) STATE-READ
    {
      const phone = `+20100${Math.floor(1000000 + Math.random() * 8999999)}`;
      const { customerId, conversationId } = await makeConversation(phone);
      console.log(`\n=== STATE-READ (ON) ===`);
      try {
        for (const a of ITEMS.add) {
          const o = await callAgent(conversationId, a);
          console.log(`  add «${a}» → lines=${(o.draft?.lines || []).length} tools=[${(o.toolsUsed || []).join(",")}]`);
        }
        const out = await callAgent(conversationId, REVIEW);
        const r = out.reply || "";
        const tools = out.toolsUsed || [];
        const namedBoth = has(r, ITEMS.names).length >= 2;
        const noRebuild = !tools.includes("add_to_order") && !tools.includes("clear_order");
        const unchanged = (out.draft?.lines || []).length === 2;
        console.log(`  review «${REVIEW}»`);
        console.log(`  K: ${r.replace(/\n/g, " ⏎ ")}`);
        console.log(`     tools=[${tools.join(",")}] lines=${(out.draft?.lines || []).length}`);
        rec("STATE-READ", namedBoth && noRebuild && unchanged, `namedBoth=${namedBoth}; noRebuild(no add/clear)=${noRebuild}; draftUnchanged(2)=${unchanged}`);
      } finally { await cleanup(conversationId, customerId); }
    }

    // 2) EMPTY-DRAFT
    {
      const phone = `+20100${Math.floor(1000000 + Math.random() * 8999999)}`;
      const { customerId, conversationId } = await makeConversation(phone);
      console.log(`\n=== EMPTY-DRAFT (ON) ===`);
      try {
        const out = await callAgent(conversationId, REVIEW);
        const r = out.reply || "";
        const lines = (out.draft?.lines || []).length;
        const saysEmpty = has(r, ["فاضي", "فاضية", "مفيش طلب", "لا يوجد", "مافيش", "ما عندكش طلب", "لسه ما طلبت", "ابدأ", "تحب تطلب"]).length > 0;
        const noPhantom = lines === 0;
        console.log(`  review «${REVIEW}» on fresh convo`);
        console.log(`  K: ${r.replace(/\n/g, " ⏎ ")}`);
        console.log(`     lines=${lines}`);
        rec("EMPTY-DRAFT", saysEmpty && noPhantom, `saysEmpty=${saysEmpty}; noPhantomCart(0 lines)=${noPhantom}`);
      } finally { await cleanup(conversationId, customerId); }
    }
  } finally {
    await patchFlags(original);
    console.log(`\nrestored flags=${JSON.stringify(original)}`);
  }
  const passed = results.filter((x) => x.pass).length;
  console.log(`\n──────── B1 STATE-READ PROOF: ${passed}/${results.length} ────────`);
  process.exit(passed === results.length ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(3); });
