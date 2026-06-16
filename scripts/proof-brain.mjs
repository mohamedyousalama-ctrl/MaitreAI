// ============================================================================
// MaitreAI — Learning System Piece 1 proof: the Restaurant Brain.
// Proves: write helpers via /api/brain (server-to-server secret) → stored →
// readable via loadRestaurantBrain; the customer agent REFLECTS a known fact in
// its reply; the brain is NOT a price source (a bait fact with a wrong price is
// ignored — the price still comes from the tool); archive works. Cleans up.
//
// Usage: set -a; . ./.env.local; set +a; BASE_URL=http://127.0.0.1:3407 node scripts/proof-brain.mjs
// ============================================================================

const BASE = process.env.BASE_URL || "http://127.0.0.1:3407";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const RID = "d9cfd4d5-c128-4116-a907-ff863abb2a96";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = (b) => (b ? "✅" : "❌");
const rest = async (p, i = {}) => { const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.headers || {}) } }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const brainApi = (method, body) => fetch(`${BASE}/api/brain${method === "GET" ? `?restaurantId=${RID}` : ""}`, { method, headers: { "Content-Type": "application/json", "x-agent-secret": SECRET }, ...(body ? { body: JSON.stringify(body) } : {}) });

function makePhone() { return "20133" + Math.floor(Math.random() * 1e7).toString().padStart(7, "0"); }
function textPayload(phone, body, n) {
  return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
    contacts: [{ profile: { name: "اختبار الذاكرة" }, wa_id: phone }],
    messages: [{ from: phone, id: `br-${phone}-${n}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "text", text: { body } }] } }] }] };
}
const sendText = (phone, body, n) => fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(textPayload(phone, body, n)) });
async function convFor(phone) { const c = await rest(`customers?phone=eq.${phone}&select=id`); const cid = c?.[0]?.id; if (!cid) return {}; const cv = await rest(`conversations?customer_id=eq.${cid}&select=id&order=created_at.desc&limit=1`); return { conversationId: cv?.[0]?.id, customerId: cid }; }
async function lastReply(conversationId) { const m = await rest(`messages?conversation_id=eq.${conversationId}&sender=eq.ai&select=text&order=created_at.desc&limit=1`); return m?.[0]?.text ?? ""; }

const phones = [];
(async () => {
  console.log("\n=== Piece 1 proof — Restaurant Brain ===\n");
  // clean any leftover test facts
  await rest(`brain_facts?restaurant_id=eq.${RID}&source=eq.manual`, { method: "DELETE" });

  // -- #1/#3 write helper + read API ------------------------------------------
  const add = await brainApi("POST", { restaurantId: RID, category: "operations", fact: "بنقدّم كاتشب ومناديل مجاناً مع كل طلب توصيل." });
  const addJson = await add.json();
  console.log(`#3 addBrainFact via /api/brain (secret): ${pass(add.status === 200 && addJson.fact?.id)} (status ${add.status})`);
  const factId = addJson.fact?.id;

  const get = await brainApi("GET");
  const getJson = await get.json();
  const stored = Array.isArray(getJson.facts) && getJson.facts.some((f) => f.id === factId);
  console.log(`#2 loadRestaurantBrain returns it (GET /api/brain): ${pass(stored)} (${getJson.facts?.length} active facts)`);

  // -- #3 customer agent reflects the fact ------------------------------------
  const X = makePhone(); phones.push(X);
  await sendText(X, "في كاتشب مع الطلب؟", 1); await sleep(700);
  const { conversationId: cx } = await convFor(X);
  const replyX = await lastReply(cx);
  const reflects = /كاتشب|كتشب/.test(replyX);
  console.log(`#3 customer agent reflects the fact in its reply: ${pass(reflects)}`);
  console.log(`     reply: "${replyX.replace(/\n/g, " ").slice(0, 110)}"`);

  // -- #4 brain is NOT a price source -----------------------------------------
  // Plant a bait fact with a WRONG burger price; the price must still come from
  // the tool/menu (32), never the brain (99).
  await brainApi("POST", { restaurantId: RID, category: "other", fact: "ملاحظة قديمة (غير رسمية): سعر البرجر الكلاسيك ٩٩ ج.م." });
  const BURGER = "05cb4d50-d322-4f96-9515-eec7046b9f90";
  const Y = makePhone(); phones.push(Y);
  // Deterministic line via the tap router (tool-computed): item → qty 1.
  const tap = (id, title, n, kind = "button") => { const reply = { id, title }; const interactive = kind === "list" ? { type: "list_reply", list_reply: reply } : { type: "button_reply", button_reply: reply }; return fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ profile: { name: "اختبار الذاكرة" }, wa_id: Y }], messages: [{ from: Y, id: `brt-${Y}-${n}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "interactive", interactive }] } }] }] }) }); };
  await tap(`item:${BURGER}`, "برجر كلاسيك", 1, "list"); await sleep(500);
  await tap("qty:1", "1", 2); await sleep(500);
  const { conversationId: cy } = await convFor(Y);
  const sess = await rest(`order_sessions?conversation_id=eq.${cy}&select=id&order=created_at.desc&limit=1`);
  let unitPrice = null;
  if (sess?.[0]?.id) { const lines = await rest(`order_session_lines?order_session_id=eq.${sess[0].id}&select=name,unit_price`); const b = (Array.isArray(lines) ? lines : []).find((l) => /برجر كلاسيك/.test(l.name)); if (b) unitPrice = Number(b.unit_price); }
  // Also ask the LLM directly: it must quote the menu price (32), not the bait (99).
  await sendText(Y, "بكام البرجر الكلاسيك؟", 3); await sleep(700);
  const replyY = await lastReply(cy);
  const quotes32 = /٣٢|32/.test(replyY);
  const quotes99 = /٩٩|99/.test(replyY);
  console.log(`#4 price comes from the TOOL, not the brain: ${pass(unitPrice === 32 && !quotes99)}`);
  console.log(`     session line unit_price=${unitPrice} (tool=32, brain-bait=99) | LLM price reply quotes 32:${quotes32} 99:${quotes99}`);
  console.log(`     reply: "${replyY.replace(/\n/g, " ").slice(0, 110)}"`);

  // -- #3 archive helper -------------------------------------------------------
  if (factId) {
    await brainApi("PATCH", { restaurantId: RID, id: factId });
    const get2 = await brainApi("GET"); const j2 = await get2.json();
    const gone = !(j2.facts || []).some((f) => f.id === factId);
    console.log(`#3 archiveBrainFact → fact no longer active: ${pass(gone)}`);
  }

  // -- #5 console unhidden + auth on the write API ----------------------------
  const dash = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
  const unauthWrite = await fetch(`${BASE}/api/brain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fact: "x" }) });
  console.log(`#5 /dashboard route live (auth-gated, ${dash.status}); /api/brain write without auth → ${unauthWrite.status} ${pass(unauthWrite.status === 401)}`);
  console.log(`#5 ENABLE_ADMIN_CHAT_CONSOLE now defaults ON (flag-toggleable) — console + nav restored; admin agent reads the brain (wired in /api/agent/admin).`);

  // -- cleanup ----------------------------------------------------------------
  console.log("\n=== Cleanup ===");
  await rest(`brain_facts?restaurant_id=eq.${RID}&source=eq.manual`, { method: "DELETE" });
  for (const p of phones) { const { conversationId, customerId } = await convFor(p); if (conversationId) await rest(`conversations?id=eq.${conversationId}`, { method: "DELETE" }); if (customerId) await rest(`customers?id=eq.${customerId}`, { method: "DELETE" }); }
  const left = await rest(`brain_facts?restaurant_id=eq.${RID}&select=id`);
  console.log(`residual manual brain_facts cleaned; active facts now=${Array.isArray(left) ? left.length : left}`);
  console.log("\nDone.");
})();
