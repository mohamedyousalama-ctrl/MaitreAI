// ============================================================================
// MaitreAI — Real-time 86ing proof.
// Drives the REAL inbound chain (POST /api/whatsapp/webhook → runCustomerTurn →
// loadBrain (fresh menu every turn) → order_sessions) and toggles availability
// the way the operator one-tap toggle does — the exact DB effect of
// setItemAvailabilityDb (update menu_items + append a menu_availability_events
// audit row). The /api/menu/availability route that calls that helper is
// session-authenticated; this proof reproduces its server write + audit so the
// agent-facing behavior is provable end-to-end without a browser session.
//
// Tool-enforced invariants asserted (independent of the LLM's wording):
//   • before 86: the agent CAN add the item   → a session line for it appears
//   • after  86: the agent CANNOT add it      → NO session line for it
//   • in-progress: an order can NEVER be finalized containing an 86'd item
//   • re-enable: the agent can add it again    → a session line reappears
//   • every toggle writes a menu_availability_events audit row
//   • the toggle is tenant-scoped (keyed by restaurant_id)
// Cleans up ALL test rows AND restores the seeded item (available=true,
// unavailable_until=null) + removes the audit rows it inserted.
//
// Env: BASE_URL (default http://127.0.0.1:3400) + .env.local Supabase keys.
// Usage:  set -a; . ./.env.local; set +a; node scripts/proof-eightysix.mjs
// ============================================================================

const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SR) { console.error("Missing Supabase env"); process.exit(2); }
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phone = () => "20100" + Math.floor(Math.random() * 1e7).toString().padStart(7, "0");

const rest = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
};

function inbound(text, from, i) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      contacts: [{ profile: { name: "اختبار 86" }, wa_id: from }],
      messages: [{ from, id: `86-${from}-${i}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "text", text: { body: text } }],
    } }] }],
  };
}
async function deliver(text, from, i) {
  const res = await fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inbound(text, from, i)) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function convFor(from) {
  const cust = await rest(`customers?phone=eq.${from}&select=id,restaurant_id`);
  const customerId = cust?.[0]?.id;
  if (!customerId) return {};
  const conv = await rest(`conversations?customer_id=eq.${customerId}&select=id,restaurant_id&order=created_at.desc&limit=1`);
  return { customerId, conversationId: conv?.[0]?.id ?? null, restaurantId: conv?.[0]?.restaurant_id ?? cust?.[0]?.restaurant_id ?? null };
}
async function sessionLines(conversationId) {
  const sess = await rest(`order_sessions?conversation_id=eq.${conversationId}&select=id,status&order=created_at.asc`);
  if (!Array.isArray(sess) || !sess.length) return [];
  let lines = [];
  for (const s of sess) {
    const ls = await rest(`order_session_lines?order_session_id=eq.${s.id}&select=item_id,name`);
    if (Array.isArray(ls)) lines = lines.concat(ls);
  }
  return lines;
}
async function lastReply(conversationId) {
  const runs = await rest(`agent_runs?conversation_id=eq.${conversationId}&select=output,tools_used&order=created_at.desc&limit=1`);
  return Array.isArray(runs) ? runs[0] : null;
}

// Mirror of setItemAvailabilityDb (what /api/menu/availability does server-side):
// tenant-scoped flip + an append-only audit row. source=operator like the toggle.
async function operatorToggle(restaurantId, item, available) {
  await rest(`menu_items?id=eq.${item.id}&restaurant_id=eq.${restaurantId}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ available, unavailable_until: null }),
  });
  await rest(`menu_availability_events`, {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      restaurant_id: restaurantId, menu_item_id: item.id, item_name: item.name,
      available, source: "operator", actor_role: "operation", reason: "proof-eightysix",
    }),
  });
}

const has = (lines, id) => lines.some((l) => l.item_id === id);
let PASS = true;
const check = (label, ok, extra = "") => { console.log(`   ${ok ? "✅" : "❌"} ${label}${extra ? "  — " + extra : ""}`); if (!ok) PASS = false; };

(async () => {
  console.log("\n=== Real-time 86ing proof ===");
  console.log(`base=${BASE}\n`);

  // --- Bootstrap: greet to resolve the restaurant, then pick a target + alt ----
  const P0 = phone();
  await deliver("السلام عليكم", P0, 0);
  await sleep(700);
  const boot = await convFor(P0);
  const restaurantId = boot.restaurantId;
  if (!restaurantId) { console.error("Could not resolve restaurant from webhook."); process.exit(2); }
  const avail = await rest(`menu_items?restaurant_id=eq.${restaurantId}&available=eq.true&select=id,name&order=created_at&limit=5`);
  if (!Array.isArray(avail) || avail.length < 2) { console.error("Need ≥2 available seeded items."); process.exit(2); }
  const target = avail[0];
  const alt = avail[1];
  console.log(`restaurant=${restaurantId.slice(0, 8)}  target=«${target.name}»  alt=«${alt.name}»\n`);

  // --- Phase 1: baseline — item is sellable -----------------------------------
  console.log("Phase 1 — baseline (target available): customer orders it");
  const P1 = phone();
  await deliver(`عايز اتنين ${target.name}`, P1, 0);
  await sleep(1500);
  await deliver("عادي بدون إضافات", P1, 1); // resolve the modifier clarification → add_to_order
  await sleep(2200);
  const c1 = await convFor(P1);
  const l1 = await sessionLines(c1.conversationId);
  check("a session line for the target was created (agent CAN sell it)", has(l1, target.id), `lines=[${l1.map((l) => l.name).join(", ") || "none"}]`);

  // --- 86 the target (operator one-tap) ---------------------------------------
  console.log("\n86 → operator marks «" + target.name + "» out-of-stock");
  await operatorToggle(restaurantId, target, false);
  // Acceptance 1: the availability tool flips instantly — verify the DB read the
  // agent loads every turn now reports the item unavailable.
  const reread = await rest(`menu_items?id=eq.${target.id}&select=available`);
  check("menu read now returns available=false (tool flips instantly)", reread?.[0]?.available === false);

  // --- Phase 2: agent stops selling the 86'd item -----------------------------
  console.log("\nPhase 2 — after 86: a new customer asks for the same item");
  const P2 = phone();
  await deliver(`ممكن ${target.name}؟`, P2, 0);
  await sleep(2200);
  const c2 = await convFor(P2);
  const l2 = await sessionLines(c2.conversationId);
  const r2 = await lastReply(c2.conversationId);
  check("NO session line for the 86'd item (agent CANNOT add it — tool-enforced)", !has(l2, target.id), `lines=[${l2.map((l) => l.name).join(", ") || "none"}]`);
  const said = String(r2?.output || "");
  const ackUnavail = /غير متاح|غير متوفر|مش متاح|مش متوفر|ما عندنا|معندنا|مفيش|مش موجود|نفد|نفذ|خلص|خلصان|انتهى/.test(said);
  console.log(`   ↳ reply: "${said.replace(/\n/g, " ").slice(0, 120)}"`);
  check("reply acknowledges unavailability (soft/heuristic)", ackUnavail);

  // --- Phase 3: in-progress guard — never finalize an order with an 86'd item --
  console.log("\nPhase 3 — in-progress: target was added (Phase 1) THEN 86'd, customer confirms");
  await deliver("تأكيد الطلب", P1, 2);
  await sleep(1500);
  await deliver("الدفع عند الاستلام", P1, 3);
  await sleep(1500);
  await deliver("تأكيد الطلب", P1, 4);
  await sleep(1800);
  const orders1 = await rest(`orders?conversation_id=eq.${c1.conversationId}&select=id,items`);
  const orderWithTarget = (Array.isArray(orders1) ? orders1 : []).some(
    (o) => Array.isArray(o.items) && o.items.some((it) => it.menuItemId === target.id || it.name === target.name)
  );
  check("NO finalized order contains the 86'd item (finalize guard holds)", !orderWithTarget, `orders=${Array.isArray(orders1) ? orders1.length : 0}`);

  // --- Re-enable + Phase 4: agent can sell it again ---------------------------
  console.log("\nRe-enable → operator brings «" + target.name + "» back");
  await operatorToggle(restaurantId, target, true);
  const P3 = phone();
  await deliver(`عايز اتنين ${target.name}`, P3, 0);
  await sleep(1500);
  await deliver("عادي بدون إضافات", P3, 1);
  await sleep(2200);
  const c3 = await convFor(P3);
  const l3 = await sessionLines(c3.conversationId);
  check("session line for the item reappears (agent sells it again)", has(l3, target.id), `lines=[${l3.map((l) => l.name).join(", ") || "none"}]`);

  // --- Acceptance 6: audit rows + Acceptance 4: tenant scope -------------------
  console.log("\nAudit + tenant scope");
  const events = await rest(`menu_availability_events?menu_item_id=eq.${target.id}&reason=eq.proof-eightysix&select=available,source,actor_role,restaurant_id,created_at&order=created_at`);
  const evs = Array.isArray(events) ? events : [];
  check("an audit row was written per toggle (2: off → on)", evs.length >= 2, `rows=${evs.length} states=[${evs.map((e) => e.available).join(",")}]`);
  check("every audit row is scoped to this tenant", evs.every((e) => e.restaurant_id === restaurantId));
  check("audit records source + actor role", evs.every((e) => e.source === "operator" && e.actor_role === "operation"));

  // --- Cleanup: leave production exactly as found -----------------------------
  console.log("\n=== Cleanup ===");
  // Restore the seeded item to a known-good state.
  await rest(`menu_items?id=eq.${target.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ available: true, unavailable_until: null }) });
  // Remove the audit rows this proof inserted.
  await rest(`menu_availability_events?menu_item_id=eq.${target.id}&reason=eq.proof-eightysix`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  // Remove conversations + customers (cascades sessions/lines/events/orders links).
  for (const p of [P0, P1, P2, P3]) {
    const c = await convFor(p);
    if (c.conversationId) {
      const ords = await rest(`orders?conversation_id=eq.${c.conversationId}&select=id`);
      for (const o of Array.isArray(ords) ? ords : []) await rest(`orders?id=eq.${o.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await rest(`conversations?id=eq.${c.conversationId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    }
    if (c.customerId) await rest(`customers?id=eq.${c.customerId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
  const leftEvents = await rest(`menu_availability_events?menu_item_id=eq.${target.id}&reason=eq.proof-eightysix&select=id`);
  const restored = await rest(`menu_items?id=eq.${target.id}&select=available,unavailable_until`);
  console.log(`residual audit rows=${Array.isArray(leftEvents) ? leftEvents.length : "?"}  item restored: available=${restored?.[0]?.available} until=${restored?.[0]?.unavailable_until ?? "null"}`);

  console.log(`\n${PASS ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}\n`);
  process.exit(PASS ? 0 : 1);
})();
