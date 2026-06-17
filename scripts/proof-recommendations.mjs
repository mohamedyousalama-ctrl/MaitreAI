// ============================================================================
// MaitreAI — Learning System Piece 5 proof: smart recommendations (both sides).
// OWNER (deterministic): grounded recs cite real signals; no signal → empty;
// read-only (no auto-change). CUSTOMER (behavioral): a returning diner gets ONE
// tasteful grounded suggestion, not auto-added, never an unavailable item, not
// pushy on every message, respecting preferences. Money/availability from tools.
//
// Usage: set -a; . ./.env.local; set +a; BASE_URL=http://127.0.0.1:3411 node scripts/proof-recommendations.mjs
// ============================================================================

const BASE = process.env.BASE_URL || "http://127.0.0.1:3411";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const RID = "d9cfd4d5-c128-4116-a907-ff863abb2a96";
const pass = (b) => (b ? "✅" : "❌");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (p, i = {}) => { const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.method && i.method !== "DELETE" ? { Prefer: "return=representation" } : {}), ...(i.headers || {}) } }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const recsApi = (restaurantId) => fetch(`${BASE}/api/brain/recommendations?restaurantId=${restaurantId}`, { headers: { "x-agent-secret": SECRET } }).then((r) => r.json());
const hasNum = (s) => /[0-9٠-٩]/.test(s || "");

const phones = [];
function txt(phone, body, n) { return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ profile: { name: "زبون عائد" }, wa_id: phone }], messages: [{ from: phone, id: `rc-${phone}-${n}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "text", text: { body } }] } }] }] }; }
const say = async (phone, body, n) => { await fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(txt(phone, body, n)) }); await sleep(800); };
async function cid(phone) { const c = await rest(`customers?phone=eq.${phone}&restaurant_id=eq.${RID}&select=id`); return c?.[0]?.id; }
async function lastReply(phone) { const id = await cid(phone); if (!id) return ""; const cv = await rest(`conversations?customer_id=eq.${id}&select=id&order=created_at.desc&limit=1`); if (!cv?.[0]?.id) return ""; const m = await rest(`messages?conversation_id=eq.${cv[0].id}&sender=eq.ai&select=text&order=created_at.desc&limit=1`); return m?.[0]?.text ?? ""; }

(async () => {
  console.log("\n=== Piece 5 proof — smart recommendations (both sides) ===\n");
  const seededOrderNos = [];
  await rest(`brain_insights?restaurant_id=eq.${RID}`, { method: "DELETE" });

  // ===== OWNER SIDE (deterministic) =========================================
  // #5 no signal → empty (clean throwaway tenant). active:false so it never
  // hijacks the webhook's "newest active restaurant" routing during this proof.
  const r2 = await rest(`restaurants`, { method: "POST", body: JSON.stringify({ name: "مطعم-توصيات-فارغ", active: false }) });
  const r2id = Array.isArray(r2) ? r2[0]?.id : null;
  const emptyRecs = r2id ? (await recsApi(r2id)).recommendations : [];
  console.log(`#5 OWNER no-signal tenant → no manufactured advice: ${pass(Array.isArray(emptyRecs) && emptyRecs.length === 0)} (${emptyRecs.length} recs)`);
  if (r2id) await rest(`restaurants?id=eq.${r2id}`, { method: "DELETE" }); // remove immediately

  // #4 grounded advice from real signals: seed a pending insight + several orders.
  await rest(`brain_insights`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, type: "menu_gap", summary: "عدة عملاء سألوا عن أصناف نباتية غير متوفرة", evidence: { key: "menu_gap:veg", count: 4 }, status: "pending" }) });
  const menuBefore = (await rest(`menu_items?restaurant_id=eq.${RID}&select=id`)).length;
  const promoBefore = (await rest(`promotions?restaurant_id=eq.${RID}&select=id`)).length;
  for (let i = 0; i < 6; i++) {
    const on = `T5-${Date.now()}-${i}`;
    seededOrderNos.push(on);
    await rest(`orders`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, order_number: on, items: [{ name: "برجر كلاسيك", quantity: 2, total: 64 }], subtotal: 64, total: 64, fulfillment: "delivery", order_status: "delivered" }) });
  }
  const recs = (await recsApi(RID)).recommendations ?? [];
  const grounded = recs.length > 0 && recs.every((r) => r.text && r.signal);
  const citesReal = recs.some((r) => hasNum(r.signal) || /إشارة|محادثات|طُلب|طلب/.test(r.signal));
  const suggestOnly = recs.every((r) => /تفكر|تجرب|تبرز|كومبو|عرض|تعالج|تضيف/.test(r.text)) && !recs.some((r) => /تم |سويت|أضفت|نفّذت/.test(r.text));
  const hasDemandGap = recs.some((r) => r.type === "demand_gap");
  const hasItemSignal = recs.some((r) => r.type === "popular_item" || r.type === "slow_item");
  console.log(`#4 OWNER grounded recommendation citing a real signal: ${pass(grounded && citesReal)}`);
  recs.forEach((r) => console.log(`     • [${r.type}] ${r.text}  ↳ ${r.signal}`));
  console.log(`#4 cites demand-gap insight + order signal: ${pass(hasDemandGap && hasItemSignal)} | #6 suggest-only phrasing (proposes, never "done"): ${pass(suggestOnly)}`);

  const menuAfter = (await rest(`menu_items?restaurant_id=eq.${RID}&select=id`)).length;
  const promoAfter = (await rest(`promotions?restaurant_id=eq.${RID}&select=id`)).length;
  console.log(`#6 OWNER suggest-only (no auto change): menu ${menuBefore}→${menuAfter}, promos ${promoBefore}→${promoAfter}: ${pass(menuAfter === menuBefore && promoAfter === promoBefore)}`);

  // ===== CUSTOMER SIDE (behavioral) =========================================
  // Seed a returning customer P1 via the webhook (canonical customer row), then
  // upgrade it to a returning profile: 1 past burger order + anti-chicken pref.
  const P1 = "20177" + Math.floor(Math.random()*1e7).toString().padStart(7,"0"); phones.push(P1);
  await say(P1, "أهلاً", 0); // creates the customer + conversation
  const custId = await cid(P1);
  const cust = { id: custId };
  await rest(`customers?id=eq.${custId}`, { method: "PATCH", body: JSON.stringify({ name: "محمود", orders_count: 1, usual_address: "الياسمين", ltv: 64 }) });
  const pastNo = `T5P-${Date.now()}`; seededOrderNos.push(pastNo);
  await rest(`orders`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, order_number: pastNo, customer_id: cust.id, items: [{ name: "برجر كلاسيك", quantity: 2, total: 64 }], subtotal: 64, total: 64, fulfillment: "delivery", order_status: "delivered" }) });
  await rest(`customer_preferences`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, customer_id: cust.id, type: "favorite_item", value: "برجر كلاسيك", source: "observed", confidence: 1 }) });
  await rest(`customer_preferences`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, customer_id: cust.id, type: "dietary", value: "لا يأكل الدجاج", source: "stated" }) });

  // #1/#7 returning customer ordering → ONE tasteful suggestion at the natural
  // moment (the agent rightly asks quantity first, then offers a pairing).
  const sug = /بطاطس|كولا|مشروب|مقبّلات|مقبلات|تحب تضيف|تحب أضيف|أضيفها|المعتاد|تكرر|تكمّل|كومبو/;
  await say(P1, "السلام عليكم، عايز برجر كلاسيك", 1);
  const r1 = await lastReply(P1);
  await say(P1, "واحدة بس", 2); // settle quantity → natural moment for a side offer
  const r1b = await lastReply(P1);

  // #6 CUSTOMER suggest-only: nothing auto-added — the session has ONLY what P1 ordered.
  const cv = await rest(`conversations?customer_id=eq.${cust.id}&select=id&order=created_at.desc&limit=1`);
  const sess = cv?.[0]?.id ? await rest(`order_sessions?conversation_id=eq.${cv[0].id}&select=id&order=created_at.desc&limit=1`) : [];
  let lineNames = [];
  if (sess?.[0]?.id) lineNames = (await rest(`order_session_lines?order_session_id=eq.${sess[0].id}&select=name`)).map((l) => l.name);
  const noAutoAdd = lineNames.every((n) => /برجر كلاسيك/.test(n)); // only the burger, no auto-added side

  // #3 not pushy: a plain thanks shouldn't trigger a fresh upsell.
  await say(P1, "تمام شكراً", 3);
  const r3 = await lastReply(P1);
  const notPushy = !sug.test(r3);

  // #2 respects preference: asked for a suggestion → offers one, but NOT chicken.
  await say(P1, "اقترحلي حاجة من عندكم", 4);
  const r2c = await lastReply(P1);
  const respectsPref = !/برجر دجاج/.test(r2c);

  // A tasteful grounded suggestion appears at the natural moment (after settling
  // the main item, or when asked) — not on the first message.
  const replies = [r1, r1b, r3, r2c];
  const suggested = sug.test(r1b) || sug.test(r2c);
  const noUnavailable = !replies.some((r) => /كنافة/.test(r));
  console.log(`\n#1 CUSTOMER returning diner gets a tasteful grounded suggestion: ${pass(suggested)}`);
  console.log(`     r1 (order):  "${r1.replace(/\n/g," ").slice(0,90)}"`);
  console.log(`     r1b (qty):   "${r1b.replace(/\n/g," ").slice(0,90)}"`);
  console.log(`     r2c (asked): "${r2c.replace(/\n/g," ").slice(0,90)}"`);
  console.log(`#7 CUSTOMER never suggests an unavailable item (كنافة): ${pass(noUnavailable)}`);
  console.log(`#6 CUSTOMER suggest-only — side NOT auto-added (session lines: ${JSON.stringify(lineNames)}): ${pass(noAutoAdd)}`);
  console.log(`#3 CUSTOMER not pushy (no upsell on a plain "thanks"): ${pass(notPushy)} — "${r3.replace(/\n/g," ").slice(0,70)}"`);
  console.log(`#2 CUSTOMER suggestion respects preference (no برجر دجاج for a no-chicken diner): ${pass(respectsPref)} — "${r2c.replace(/\n/g," ").slice(0,80)}"`);

  // ===== cleanup ============================================================
  console.log("\n=== Cleanup ===");
  if (r2id) await rest(`restaurants?id=eq.${r2id}`, { method: "DELETE" });
  for (const on of seededOrderNos) await rest(`orders?order_number=eq.${on}`, { method: "DELETE" });
  await rest(`brain_insights?restaurant_id=eq.${RID}`, { method: "DELETE" });
  for (const p of phones) { const id = await cid(p); if (id) { const c = await rest(`conversations?customer_id=eq.${id}&select=id`); for (const x of (c||[])) await rest(`conversations?id=eq.${x.id}`, { method: "DELETE" }); await rest(`customers?id=eq.${id}`, { method: "DELETE" }); } }
  const leftPrefs = (await rest(`customer_preferences?restaurant_id=eq.${RID}&select=id`)).length;
  const leftIns = (await rest(`brain_insights?restaurant_id=eq.${RID}&select=id`)).length;
  console.log(`residual customer_preferences=${leftPrefs} insights=${leftIns}`);
  console.log("Done.");
})();
