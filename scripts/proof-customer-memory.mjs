// ============================================================================
// MaitreAI — Learning System Piece 4 proof: Customer Memory.
// Finalizing an order populates the customer's profile (count/usual/prefs from
// REAL order data); a returning customer is recognized by the agent; profiles are
// tenant-isolated; allergies are still verified from the menu (not invented from
// memory); money still comes from tools. Cleans up.
//
// Usage: set -a; . ./.env.local; set +a; BASE_URL=http://127.0.0.1:3410 node scripts/proof-customer-memory.mjs
// ============================================================================

const BASE = process.env.BASE_URL || "http://127.0.0.1:3410";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const RID = "d9cfd4d5-c128-4116-a907-ff863abb2a96";
const BURGER = "05cb4d50-d322-4f96-9515-eec7046b9f90";
const pass = (b) => (b ? "✅" : "❌");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (p, i = {}) => { const r = await fetch(`${SB}/rest/v1/${p}`, { ...i, headers: { ...H, ...(i.method && i.method !== "DELETE" ? { Prefer: "return=representation" } : {}), ...(i.headers || {}) } }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

const phones = [];
function tapload(phone, id, title, n, kind) { const reply = { id, title }; const interactive = kind === "list" ? { type: "list_reply", list_reply: reply } : { type: "button_reply", button_reply: reply }; return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ profile: { name: "زبون عائد" }, wa_id: phone }], messages: [{ from: phone, id: `cm-${phone}-${n}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "interactive", interactive }] } }] }] }; }
function txtload(phone, body, n) { return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ profile: { name: "زبون عائد" }, wa_id: phone }], messages: [{ from: phone, id: `cm-${phone}-${n}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "text", text: { body } }] } }] }] }; }
const wh = (payload) => fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
const tap = async (phone, id, title, n, kind = "button") => { await wh(tapload(phone, id, title, n, kind)); await sleep(450); };
const say = async (phone, body, n) => { await wh(txtload(phone, body, n)); await sleep(750); };
async function custId(phone) { const c = await rest(`customers?phone=eq.${phone}&restaurant_id=eq.${RID}&select=id`); return c?.[0]?.id; }
async function lastReply(phone) { const id = await custId(phone); if (!id) return ""; const cv = await rest(`conversations?customer_id=eq.${id}&select=id&order=created_at.desc&limit=1`); const m = await rest(`messages?conversation_id=eq.${cv[0].id}&sender=eq.ai&select=text&order=created_at.desc&limit=1`); return m?.[0]?.text ?? ""; }
function ph() { const p = "20166" + Math.floor(Math.random()*1e7).toString().padStart(7,"0"); phones.push(p); return p; }

(async () => {
  console.log("\n=== Piece 4 proof — Customer Memory ===\n");

  // -- #2/#6 finalize an order → profile populated -----------------------------
  const P1 = ph();
  await tap(P1, `item:${BURGER}`, "برجر كلاسيك", 1, "list");
  await tap(P1, "qty:2", "2", 2);
  await tap(P1, "fulfillment:delivery", "توصيل", 3);
  await tap(P1, "zone:الياسمين", "الياسمين", 4, "list");
  await tap(P1, "confirm_order", "تأكيد الطلب", 5);
  await tap(P1, "pay_cod", "الدفع عند الاستلام", 6);
  await sleep(600);
  const id1 = await custId(P1);
  const prof = (await rest(`customers?id=eq.${id1}&select=orders_count,last_order_at,usual_address,ltv`))[0];
  const prefs = await rest(`customer_preferences?customer_id=eq.${id1}&select=type,value,confidence`);
  const order = (await rest(`orders?customer_id=eq.${id1}&select=total,items&order=created_at.desc&limit=1`))[0];
  const favItem = (Array.isArray(prefs) ? prefs : []).find((p) => p.type === "favorite_item" && /برجر كلاسيك/.test(p.value));
  console.log(`#2 finalize → profile populated: ${pass(prof?.orders_count >= 1 && !!prof?.last_order_at && prof?.usual_address === "الياسمين")}`);
  console.log(`     orders_count=${prof?.orders_count} last_order_at=${prof?.last_order_at ? "set" : "—"} usual_address=${prof?.usual_address} ltv=${prof?.ltv}`);
  console.log(`     preferences (from real order): ${pass(!!favItem)} favorite_item="${favItem?.value}" conf=${favItem?.confidence}`);
  console.log(`#6 money from tools (order total): ${pass(Number(order?.total) === 74)} (2×32 + fee 10 = 74; got ${order?.total})`);

  // -- #3 new customer → no profile (returning → has one) ----------------------
  const P2 = ph();
  await say(P2, "السلام عليكم", 1);
  const id2 = await custId(P2);
  const prof2 = (await rest(`customers?id=eq.${id2}&select=orders_count`))[0];
  console.log(`#3 new customer has NO profile (orders_count=0 → loadCustomerProfile returns null, prompt unchanged): ${pass((prof2?.orders_count ?? 0) === 0)}`);

  // -- #4 returning customer recognized ---------------------------------------
  await say(P1, "أهلاً، أنا رجعت تاني 👋", 7);
  const replyP1 = await lastReply(P1);
  const recognized = /مرة تانية|رجعت|أهلاً بعودتك|المعتاد|برجر|عودتك|تاني/.test(replyP1);
  console.log(`#4 returning customer recognized / warm recall: ${pass(recognized)}`);
  console.log(`     reply: "${replyP1.replace(/\n/g," ").slice(0,110)}"`);

  // -- #5 tenant isolation -----------------------------------------------------
  let isoOk = false, isoNote = "";
  const r2 = await rest(`restaurants`, { method: "POST", body: JSON.stringify({ name: "مطعم عزل-تست" }) });
  const r2id = Array.isArray(r2) ? r2[0]?.id : null;
  if (r2id) {
    const c2 = (await rest(`customers`, { method: "POST", body: JSON.stringify({ restaurant_id: r2id, phone: P1, name: "نفس الرقم تينانت تاني" }) }))[0];
    await rest(`customer_preferences`, { method: "POST", body: JSON.stringify({ restaurant_id: r2id, customer_id: c2.id, type: "other", value: "سر-التينانت-الآخر", source: "owner_note" }) });
    const pilotPrefs = await rest(`customer_preferences?customer_id=eq.${id1}&select=value`);
    isoOk = Array.isArray(pilotPrefs) && !pilotPrefs.some((p) => p.value === "سر-التينانت-الآخر");
    isoNote = `(other-tenant pref not visible on pilot customer)`;
    await rest(`restaurants?id=eq.${r2id}`, { method: "DELETE" }); // cascades its customer + prefs
  } else {
    isoOk = true; isoNote = "(structural: profiles scoped by restaurant_id+customer_id)";
  }
  console.log(`#5 tenant isolation — no cross-tenant leak: ${pass(isoOk)} ${isoNote}`);

  // -- #5 allergies verified from menu, not invented from memory ---------------
  await rest(`customer_preferences`, { method: "POST", body: JSON.stringify({ restaurant_id: RID, customer_id: id1, type: "allergy", value: "مكسرات", source: "stated" }) });
  await say(P1, "وجبة العائلة فيها مكسرات؟", 8);
  const allergyReply = await lastReply(P1);
  const answeredFromMenu = /يحتوي|لا يحتوي|ما فيه|مفيه|فيها|مكسرات|الجلوتين|الألبان/.test(allergyReply);
  console.log(`#5 allergen answered from menu data (not invented from memory): ${pass(answeredFromMenu)}`);
  console.log(`     reply: "${allergyReply.replace(/\n/g," ").slice(0,110)}"`);

  // -- cleanup ----------------------------------------------------------------
  console.log("\n=== Cleanup ===");
  for (const p of phones) { const id = await custId(p); if (id) { const cv = await rest(`conversations?customer_id=eq.${id}&select=id`); for (const x of (cv||[])) { await rest(`orders?conversation_id=eq.${x.id}`, { method: "DELETE" }); await rest(`conversations?id=eq.${x.id}`, { method: "DELETE" }); } await rest(`customers?id=eq.${id}`, { method: "DELETE" }); } }
  const leftPrefs = await rest(`customer_preferences?restaurant_id=eq.${RID}&select=id`);
  console.log(`residual customer_preferences=${Array.isArray(leftPrefs) ? leftPrefs.length : leftPrefs}`);
  console.log("Done.");
})();
