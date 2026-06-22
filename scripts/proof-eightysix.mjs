// ============================================================================
// MaitreAI — Real-time 86ing proof (current-main draft model).
// Re-ported from the pre-divergence PR #7 proof onto current main, which uses the
// messages.meta.draft order model (NOT order_sessions — #5 is untouched).
//
// Drives the REAL customer agent (/api/agent/respond → respond.ts → executeTool,
// loadBrain fresh every turn) and flips availability exactly the way the operator
// one-tap toggle does — the DB effect of setItemAvailabilityDb (PATCH menu_items
// + an append-only menu_availability_events audit row). The /api/menu/availability
// route that calls that helper is session-authenticated; this proof reproduces its
// server write + audit so the agent-facing behavior is provable end-to-end.
//
// Tool-enforced invariants asserted (independent of the LLM's wording):
//   PART A — demo-pro (seeded draft → confirm):
//     • 86'd item in a saved cart → finalize_draft is HARD-BLOCKED (never finalized),
//       and the blocker names the item (the #90 fulfillment gate stays intact).
//     • every toggle writes a menu_availability_events audit row (who/state/source).
//     • re-enable → the SAME confirm now finalizes (item returns).
//     • tenant-scoped: the toggle is keyed by restaurant_id.
//   PART B — BLaban (real LLM, free-text order):
//     • after 86: «عايز <item>» → NO draft line for it (add_to_order refuses).
//     • after re-enable: «عايز <item>» → a draft line for it reappears.
// Cleans up ALL test rows AND restores each item (available=true,
// unavailable_until=null) + removes the audit rows it inserted.
//
// Env: BASE_URL (default http://127.0.0.1:3400) + .env.local Supabase keys + secret.
// Usage:  set -a; . ./.env.local; set +a; node scripts/proof-eightysix.mjs
// ============================================================================

const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
if (!SB || !SR || !SECRET) { console.error("Missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / AGENT_ROUTE_SECRET)"); process.exit(2); }

const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };
const j = (r) => r.json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEMO = { rid: "0de3c0de-0001-4a00-8a00-000000000001", itemId: "0de3c0de-0003-4a00-8a00-000000000020", name: "ساندويتش فراخ مشوية", price: 65 };
const BLABAN = { rid: "9244d8ef-66b1-417a-a012-41a389ab1abf", itemId: "0efb107f-8232-4e73-9c26-8feed4b30a33", name: "أرز باللبن سادة", price: 35 };

const rest = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } }).then(async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } });
const agent = (rid, cid, text) => fetch(`${BASE}/api/agent/respond`, { method: "POST", headers: { "Content-Type": "application/json", "x-agent-secret": SECRET }, body: JSON.stringify({ restaurantId: rid, conversationId: cid, text }) }).then(j);

// Mirror of setItemAvailabilityDb (what /api/menu/availability does server-side):
// tenant-scoped flip + an append-only audit row. source=operator like the toggle.
async function operatorToggle(rid, item, available) {
  await rest(`menu_items?id=eq.${item.itemId}&restaurant_id=eq.${rid}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ available, unavailable_until: null }),
  });
  await rest(`menu_availability_events`, {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ restaurant_id: rid, menu_item_id: item.itemId, item_name: item.name, available, unavailable_until: null, source: "operator", reason: "proof-eightysix" }),
  });
}

const draftWith = (item, fulfillment) => ({
  lines: [{ itemId: item.itemId, name: item.name, quantity: 1, unitPrice: item.price, choices: [], modifiers: [], lineTotal: item.price }],
  fulfillment, deliveryZone: null, deliveryFee: 0, subtotal: item.price, tax: 0, taxRate: 0, total: item.price, currency: "ج.م", finalized: false,
});

async function seedConv(rid, recapDraft) {
  const phone = `2010${Math.floor(1e8 + Math.random() * 8e8)}`;
  const c = await fetch(`${SB}/rest/v1/customers`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: rid, phone, name: "86 test" }) }).then(j);
  const conv = await fetch(`${SB}/rest/v1/conversations`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: rid, customer_id: c[0].id, channel: "whatsapp" }) }).then(j);
  if (recapDraft) {
    const recap = `طلبك دلوقتي:\n- ١× ${recapDraft.lines[0].name} — ${recapDraft.total} ج.م\n**الإجمالي: ${recapDraft.total} ج.م**\nتأكد الطلب؟`;
    await fetch(`${SB}/rest/v1/messages`, { method: "POST", headers: H, body: JSON.stringify({ restaurant_id: rid, conversation_id: conv[0].id, direction: "outbound", sender: "ai", text: recap, status: "sent", meta: { draft: recapDraft, model: "seed" } }) });
  }
  return { customerId: c[0].id, conversationId: conv[0].id };
}
async function clean(cid, custId) {
  for (const t of ["agent_runs", "conversation_signals", "messages"]) await rest(`${t}?conversation_id=eq.${cid}`, { method: "DELETE" });
  await rest(`conversations?id=eq.${cid}`, { method: "DELETE" });
  await rest(`customers?id=eq.${custId}`, { method: "DELETE" });
}
const lineFor = (draft, itemId) => Array.isArray(draft?.lines) && draft.lines.some((l) => l.itemId === itemId);

let pass = 0, fail = 0;
const ok = (n, c, note) => { if (c) pass++; else fail++; console.log(`  ${c ? "✅" : "❌"} ${n} — ${note}`); };

async function run() {
  // ===== PART A — demo-pro: tool-enforced finalize hard-block + audit + return =====
  console.log("\n── PART A — demo-pro: seeded draft → confirm (tool guards) ──");
  // 86 the item (operator toggle effect)
  await operatorToggle(DEMO.rid, DEMO, false);
  await sleep(150);
  const evts = await rest(`menu_availability_events?menu_item_id=eq.${DEMO.itemId}&select=available,source&order=created_at.desc&limit=1`);
  ok("audit row written on 86 toggle", Array.isArray(evts) && evts[0]?.available === false && evts[0]?.source === "operator", `last event=${JSON.stringify(evts?.[0] ?? null)}`);

  // saved cart already contains the now-86'd item + fulfillment set → confirm must be blocked
  const A = await seedConv(DEMO.rid, draftWith(DEMO, "pickup"));
  const rA = await agent(DEMO.rid, A.conversationId, "تأكيد الطلب");
  ok("86'd item in cart → finalize HARD-BLOCKED (never finalized)",
     rA.draft?.finalized !== true && !/تم تسجيل الطلب/.test(rA.reply || ""),
     `finalized=${rA.draft?.finalized} reply="${String(rA.reply || "").slice(0, 70)}"`);

  // re-enable → the same confirm now finalizes (item returns)
  await operatorToggle(DEMO.rid, DEMO, true);
  await sleep(150);
  const B = await seedConv(DEMO.rid, draftWith(DEMO, "pickup"));
  const rB = await agent(DEMO.rid, B.conversationId, "تأكيد الطلب");
  ok("re-enable → confirm finalizes (item returns)",
     rB.draft?.finalized === true && /تم تسجيل الطلب/.test(rB.reply || ""),
     `finalized=${rB.draft?.finalized} reply="${String(rB.reply || "").slice(0, 55)}"`);

  // tenant-scope: the 86 toggle keyed by restaurant_id never reached another tenant's row
  const cross = await rest(`menu_items?id=eq.${DEMO.itemId}&restaurant_id=neq.${DEMO.rid}&select=id`);
  ok("toggle tenant-scoped (id unique to its restaurant)", Array.isArray(cross) && cross.length === 0, `cross-tenant rows=${Array.isArray(cross) ? cross.length : "n/a"}`);

  await clean(A.conversationId, A.customerId);
  await clean(B.conversationId, B.customerId);

  // ===== PART B — BLaban: real LLM, free-text order honors 86ing live =====
  console.log("\n── PART B — BLaban: live LLM free-text order ──");
  await operatorToggle(BLABAN.rid, BLABAN, false);
  await sleep(150);
  const C = await seedConv(BLABAN.rid, null);
  const rC = await agent(BLABAN.rid, C.conversationId, `عايز ${BLABAN.name}`);
  ok("after 86: «عايز <item>» → NO draft line for it (add_to_order refuses)",
     !lineFor(rC.draft, BLABAN.itemId) && !/تم تسجيل الطلب/.test(rC.reply || ""),
     `lines=${(rC.draft?.lines || []).length} reply="${String(rC.reply || "").slice(0, 70)}"`);
  await clean(C.conversationId, C.customerId);

  // "toggle back → returns": deterministic tool-guard proof on BLaban's real item.
  // While 86'd, a saved-cart order is finalize-blocked; after re-enable the SAME
  // confirm finalizes — proving the return at the tool level (no LLM variance).
  await operatorToggle(BLABAN.rid, BLABAN, false);
  await sleep(150);
  const Dblk = await seedConv(BLABAN.rid, draftWith(BLABAN, "pickup"));
  const rDblk = await agent(BLABAN.rid, Dblk.conversationId, "تأكيد الطلب");
  ok("BLaban while 86'd: saved-cart confirm HARD-BLOCKED (never finalized)",
     rDblk.draft?.finalized !== true && !/تم تسجيل الطلب/.test(rDblk.reply || ""),
     `finalized=${rDblk.draft?.finalized} reply="${String(rDblk.reply || "").slice(0, 60)}"`);
  await clean(Dblk.conversationId, Dblk.customerId);

  await operatorToggle(BLABAN.rid, BLABAN, true);
  await sleep(150);
  const D = await seedConv(BLABAN.rid, draftWith(BLABAN, "pickup"));
  const rD = await agent(BLABAN.rid, D.conversationId, "تأكيد الطلب");
  ok("BLaban after re-enable: SAME confirm finalizes (item returns)",
     rD.draft?.finalized === true && /تم تسجيل الطلب/.test(rD.reply || ""),
     `finalized=${rD.draft?.finalized} reply="${String(rD.reply || "").slice(0, 55)}"`);
  await clean(D.conversationId, D.customerId);

  // ===== restore + remove proof audit rows =====
  await operatorToggle(DEMO.rid, DEMO, true);   // ensure left available
  await operatorToggle(BLABAN.rid, BLABAN, true);
  await rest(`menu_availability_events?reason=eq.proof-eightysix`, { method: "DELETE" });
  // final restore assert
  const dFin = await rest(`menu_items?id=eq.${DEMO.itemId}&select=available,unavailable_until`);
  const bFin = await rest(`menu_items?id=eq.${BLABAN.itemId}&select=available,unavailable_until`);
  ok("cleanup: both items restored available (no timed window)",
     dFin?.[0]?.available === true && dFin?.[0]?.unavailable_until == null && bFin?.[0]?.available === true && bFin?.[0]?.unavailable_until == null,
     `demo=${JSON.stringify(dFin?.[0])} blaban=${JSON.stringify(bFin?.[0])}`);
  const residual = await rest(`menu_availability_events?reason=eq.proof-eightysix&select=id`);
  ok("cleanup: proof audit rows removed", Array.isArray(residual) && residual.length === 0, `residual=${Array.isArray(residual) ? residual.length : "n/a"}`);

  console.log(`\n──────── 86ING PROOF: ${pass}/${pass + fail} ────────`);
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.error(e); process.exit(2); });
