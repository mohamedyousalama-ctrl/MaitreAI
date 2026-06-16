// ============================================================================
// MaitreAI — Step 2 proof: deterministic tap-routing.
// Drives real WhatsApp INTERACTIVE replies (button_reply / list_reply with
// stable IDs) through the webhook and verifies each tap is acted on by the
// router — no LLM call (agent_runs.model = "deterministic", 0 tokens) — against
// the Step-1 session. Proves: exact item by ID, qty recompute, idempotent
// double-tap, graceful stale-ID fallback, free-text still hits the Brain, and a
// full tap-only order finalizing with the correct tool-computed total. Cleans up.
//
// Usage: set -a; . ./.env.local; set +a; BASE_URL=http://127.0.0.1:3406 node scripts/proof-tap-routing.mjs
// ============================================================================

const BASE = process.env.BASE_URL || "http://127.0.0.1:3406";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = (b) => (b ? "✅" : "❌");
const rest = async (p, i = {}) => {
  const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers || {}) } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return t; }
};

const BURGER = "05cb4d50-d322-4f96-9515-eec7046b9f90"; // برجر كلاسيك 32
const ZONE = "الياسمين"; // fee 10

function makePhone() { return "20122" + Math.floor(Math.random() * 1e7).toString().padStart(7, "0"); }

// Interactive reply inbound (a tap). kind "list" or "button" — both carry id+title.
function tapPayload(phone, id, title, n, kind = "button") {
  const reply = { id, title };
  const interactive = kind === "list" ? { type: "list_reply", list_reply: reply } : { type: "button_reply", button_reply: reply };
  return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
    contacts: [{ profile: { name: "اختبار اللمس" }, wa_id: phone }],
    messages: [{ from: phone, id: `tap-${phone}-${n}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "interactive", interactive }] } }] }] };
}
function textPayload(phone, body, n) {
  return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
    contacts: [{ profile: { name: "اختبار اللمس" }, wa_id: phone }],
    messages: [{ from: phone, id: `txt-${phone}-${n}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "text", text: { body } }] } }] }] };
}
const post = (payload) => fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

async function convFor(phone) {
  const c = await rest(`customers?phone=eq.${phone}&select=id`);
  const cid = c?.[0]?.id; if (!cid) return { conversationId: null, customerId: null };
  const cv = await rest(`conversations?customer_id=eq.${cid}&select=id&order=created_at.desc&limit=1`);
  return { conversationId: cv?.[0]?.id ?? null, customerId: cid };
}
async function lastRun(conversationId) {
  const r = await rest(`agent_runs?conversation_id=eq.${conversationId}&select=trigger,model,input_tokens,output_tokens&order=created_at.desc&limit=1`);
  return Array.isArray(r) ? r[0] : null;
}
async function sessionState(conversationId) {
  const s = await rest(`order_sessions?conversation_id=eq.${conversationId}&select=id,status,subtotal,delivery_fee,total,fulfillment_type,delivery_zone&order=created_at.desc&limit=1`);
  const sess = Array.isArray(s) ? s[0] : null;
  if (!sess) return null;
  const lines = await rest(`order_session_lines?order_session_id=eq.${sess.id}&select=item_id,name,qty,unit_price,line_total&order=position`);
  return { sess, lines: Array.isArray(lines) ? lines : [] };
}
async function tap(phone, id, title, n, kind) { const r = await post(tapPayload(phone, id, title, n, kind)); await sleep(450); return r.status; }
async function txt(phone, body, n) { const r = await post(textPayload(phone, body, n)); await sleep(450); return r.status; }

const cleanupPhones = [];
async function cleanup() {
  console.log("\n=== Cleanup ===");
  for (const p of cleanupPhones) {
    const { conversationId, customerId } = await convFor(p);
    if (conversationId) { await rest(`orders?conversation_id=eq.${conversationId}`, { method: "DELETE" }); await rest(`conversations?id=eq.${conversationId}`, { method: "DELETE" }); }
    if (customerId) await rest(`customers?id=eq.${customerId}`, { method: "DELETE" });
  }
  const s = await rest(`order_sessions?select=id`);
  console.log(`residual order_sessions=${Array.isArray(s) ? s.length : s}`);
}

(async () => {
  console.log("\n=== Step 2 proof — deterministic tap-routing ===\n");

  // ---- Conv A: tap-driven order (#1 #2 #4 #5 #7) ----------------------------
  const A = makePhone(); cleanupPhones.push(A);
  console.log(`Conv A (tap order)  phone=${A}`);
  await tap(A, `item:${BURGER}`, "برجر كلاسيك", 1, "list");
  let { conversationId: ca } = await convFor(A);
  let st = await sessionState(ca); let run = await lastRun(ca);
  const exactItem = st?.lines.length === 1 && st.lines[0].item_id === BURGER;
  const noLLM = run && run.model === "deterministic" && run.input_tokens === 0 && run.output_tokens === 0;
  console.log(`  #1 tap item → exact item by ID: ${pass(exactItem)} (line=${st?.lines[0]?.name})  | bypasses LLM: ${pass(noLLM)} (model=${run?.model}, tokens=${run?.input_tokens}/${run?.output_tokens})`);

  await tap(A, `item:${BURGER}`, "برجر كلاسيك", 2, "list"); // repeat tap
  st = await sessionState(ca);
  console.log(`  #5 double-tap same item → no double-add: ${pass(st?.lines.length === 1)} (lines=${st?.lines.length})`);

  await tap(A, "qty:2", "2", 3);
  st = await sessionState(ca);
  const qtyOk = st?.lines[0]?.qty === 2 && Number(st.sess.subtotal) === 64 && Number(st.lines[0].line_total) === 64;
  console.log(`  #2 qty:2 → recomputed (tool): ${pass(qtyOk)} (qty=${st?.lines[0]?.qty}, line=${st?.lines[0]?.line_total}, subtotal=${st?.sess.subtotal})`);

  await tap(A, `item:deadbeef-not-real`, "صنف قديم", 4, "list"); // stale id
  st = await sessionState(ca);
  const staleOk = st?.lines.length === 1 && st.lines[0].qty === 2; // cart untouched, no crash
  console.log(`  #4 stale ID → graceful (cart intact, no crash): ${pass(staleOk)}`);

  await tap(A, "fulfillment:delivery", "توصيل", 5);
  await tap(A, `zone:${ZONE}`, ZONE, 6, "list");
  st = await sessionState(ca);
  const zoneOk = st?.sess.fulfillment_type === "delivery" && Number(st.sess.delivery_fee) === 10 && Number(st.sess.total) === 74;
  console.log(`  #7 zone tap → fee applied + recompute: ${pass(zoneOk)} (zone=${st?.sess.delivery_zone}, fee=${st?.sess.delivery_fee}, total=${st?.sess.total})`);

  await tap(A, "confirm_order", "تأكيد الطلب", 7);
  st = await sessionState(ca);
  console.log(`  #3 confirm (complete) → advances, not yet finalized: ${pass(st?.sess.status === "building")} (status=${st?.sess.status})`);

  await tap(A, "pay_cod", "الدفع عند الاستلام", 8);
  await sleep(500);
  const orders = await rest(`orders?conversation_id=eq.${ca}&select=order_number,subtotal,delivery_fee,total,items&order=created_at.desc`);
  const order = Array.isArray(orders) ? orders[0] : null;
  let totalOk = false;
  if (order) {
    const lineSum = (order.items || []).reduce((s, it) => s + Number(it.total || 0), 0);
    totalOk = Math.round((lineSum + Number(order.delivery_fee)) * 100) / 100 === Number(order.total) && Number(order.total) === 74;
  }
  console.log(`  #7 pay_cod → finalized order: ${pass(!!order)} #${order?.order_number} total=${order?.total}  | tool-computed Σ+fee=74: ${pass(totalOk)}`);

  // ---- Conv B: cancel (#3) --------------------------------------------------
  const B = makePhone(); cleanupPhones.push(B);
  console.log(`\nConv B (cancel)  phone=${B}`);
  await tap(B, `item:${BURGER}`, "برجر كلاسيك", 1, "list");
  await tap(B, "cancel_order", "إلغاء", 2);
  const { conversationId: cb } = await convFor(B);
  const sb = await rest(`order_sessions?conversation_id=eq.${cb}&select=status&order=created_at.desc&limit=1`);
  console.log(`  #3 cancel_order → session cancelled: ${pass(sb?.[0]?.status === "cancelled")} (status=${sb?.[0]?.status})`);

  // ---- Conv C: free-text still hits the Brain (#6) --------------------------
  const C = makePhone(); cleanupPhones.push(C);
  console.log(`\nConv C (free-text)  phone=${C}`);
  await txt(C, "عايز اشوف المنيو", 1);
  const { conversationId: cc } = await convFor(C);
  const rc = await lastRun(cc);
  const usedBrain = rc && rc.model !== "deterministic" && (rc.input_tokens > 0 || rc.model?.includes("claude"));
  console.log(`  #6 free-text → Brain (LLM), not the tap router: ${pass(usedBrain)} (model=${rc?.model}, tokens=${rc?.input_tokens})`);

  await cleanup();
  console.log("\nDone.");
})();
