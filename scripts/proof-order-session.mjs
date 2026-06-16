// ============================================================================
// MaitreAI — Step 1 proof: persistent order session across multiple turns.
// Drives the REAL inbound chain (POST /api/whatsapp/webhook → persist inbound →
// runCustomerTurn → load/persist order_sessions → on finalize: real orders row),
// printing the session + lines + total after each turn, then verifying the order
// total is tool-computed (== sum of line_totals + delivery_fee + tax). Cleans up
// all of its own test rows afterward so production data is left exactly as found.
//
// Env: BASE_URL (default http://127.0.0.1:3400) + the .env.local Supabase keys.
// Usage:  set -a; . ./.env.local; set +a; node scripts/proof-order-session.mjs
// ============================================================================

const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SR) { console.error("Missing Supabase env"); process.exit(2); }
const H = { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json" };
const PHONE = "20100" + Math.floor(Math.random() * 1e7).toString().padStart(7, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rest = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
};

// Build a minimal-but-real WhatsApp Cloud inbound payload for one text message.
function inbound(text, i) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          contacts: [{ profile: { name: "اختبار الجلسة" }, wa_id: PHONE }],
          messages: [{ from: PHONE, id: `proof-${PHONE}-${i}-${Date.now()}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "text", text: { body: text } }],
        },
      }],
    }],
  };
}

async function deliver(text, i) {
  const res = await fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inbound(text, i)) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function findConversationId() {
  const cust = await rest(`customers?phone=eq.${PHONE}&select=id`);
  const customerId = cust?.[0]?.id;
  if (!customerId) return { conversationId: null, customerId: null };
  const conv = await rest(`conversations?customer_id=eq.${customerId}&select=id&order=created_at.desc&limit=1`);
  return { conversationId: conv?.[0]?.id ?? null, customerId };
}

async function sessionState(conversationId) {
  const sess = await rest(`order_sessions?conversation_id=eq.${conversationId}&select=*&order=created_at.asc`);
  if (!Array.isArray(sess) || !sess.length) return null;
  // The most-recent session is the live one.
  const s = sess[sess.length - 1];
  const lines = await rest(`order_session_lines?order_session_id=eq.${s.id}&select=name,qty,unit_price,line_total,position&order=position`);
  const events = await rest(`order_session_events?order_session_id=eq.${s.id}&select=type&order=created_at`);
  return { s, lines: Array.isArray(lines) ? lines : [], events: Array.isArray(events) ? events : [], allSessions: sess };
}

function fmtLines(lines) {
  return lines.map((l) => `${l.qty}× ${l.name} @${l.unit_price} = ${l.line_total}`).join(" | ") || "(none)";
}

const TURNS = [
  "السلام عليكم، عايز اتنين برجر كلاسيك",   // 1: 2× burger → session created (64)
  "وكمان واحدة بطاطس كبيرة",                // 2: distinct item, SAME session → 79 (persistence)
  "توصيل لمنطقة الياسمين",                  // 3: delivery + zone fee → recomputed 89
  "تأكيد الطلب",                            // 4: confirm tap → agent collects payment
  "الدفع عند الاستلام",                     // 5: COD selected
  "تأكيد الطلب",                            // 6: final confirm → finalize → real order (89)
];

(async () => {
  console.log(`\n=== Step 1 proof — persistent order session ===`);
  console.log(`base=${BASE}  test phone=${PHONE}\n`);

  let conversationId = null;
  let firstSessionId = null;

  for (let i = 0; i < TURNS.length; i++) {
    const text = TURNS[i];
    const r = await deliver(text, i);
    await sleep(400); // let the async chain settle
    if (!conversationId) ({ conversationId } = await findConversationId());
    const st = conversationId ? await sessionState(conversationId) : null;
    let run = null;
    if (conversationId) {
      const runs = await rest(`agent_runs?conversation_id=eq.${conversationId}&select=output,tools_used&order=created_at.desc&limit=1`);
      run = Array.isArray(runs) ? runs[0] : null;
    }
    console.log(`── Turn ${i + 1}: «${text}»   (webhook ${r.status}, responded=${r.body?.responded ?? "?"})`);
    if (run) console.log(`   tools=[${(run.tools_used || []).join(", ")}]  reply="${String(run.output || "").replace(/\n/g, " ").slice(0, 90)}"`);
    if (!st) { console.log("   session: (none yet)\n"); continue; }
    if (!firstSessionId) firstSessionId = st.s.id;
    const sameSession = st.s.id === firstSessionId || st.allSessions.some((x) => x.id === firstSessionId);
    console.log(`   session_id=${st.s.id.slice(0, 8)} status=${st.s.status} sameSessionLineage=${sameSession} totalSessions=${st.allSessions.length}`);
    console.log(`   lines: ${fmtLines(st.lines)}`);
    console.log(`   subtotal=${st.s.subtotal} fee=${st.s.delivery_fee} tax=${st.s.tax_amount} TOTAL=${st.s.total}  zone=${st.s.delivery_zone ?? "-"} fulfil=${st.s.fulfillment_type ?? "-"}`);
    console.log(`   events: ${st.events.map((e) => e.type).join(" → ")}\n`);
  }

  // --- Verify the finalized order: real row + tool-computed total -------------
  await sleep(600);
  const orders = await rest(`orders?conversation_id=eq.${conversationId}&select=id,order_number,subtotal,delivery_fee,tax_amount,total,items,order_status&order=created_at.desc`);
  const order = Array.isArray(orders) ? orders[0] : null;
  console.log("=== Finalize check ===");
  if (!order) {
    console.log("❌ no order row created");
  } else {
    const lineSum = (order.items || []).reduce((s, it) => s + Number(it.total || 0), 0);
    const recomputed = Math.round((lineSum + Number(order.delivery_fee) + Number(order.tax_amount)) * 100) / 100;
    const ok = recomputed === Number(order.total);
    console.log(`order #${order.order_number} status=${order.order_status}`);
    console.log(`items: ${(order.items || []).map((it) => `${it.quantity}× ${it.name}=${it.total}`).join(" | ")}`);
    console.log(`subtotal=${order.subtotal} fee=${order.delivery_fee} tax=${order.tax_amount} TOTAL=${order.total}`);
    console.log(`Σ(lines)+fee+tax = ${lineSum}+${order.delivery_fee}+${order.tax_amount} = ${recomputed}  →  ${ok ? "✅ MATCHES order total (tool-computed)" : "❌ MISMATCH"}`);
    // Session linked + finalized?
    const sess = await rest(`order_sessions?conversation_id=eq.${conversationId}&order_id=eq.${order.id}&select=id,status,order_id`);
    const linked = Array.isArray(sess) && sess.length;
    console.log(`session linkage: ${linked ? `✅ session ${sess[0].id.slice(0,8)} status=${sess[0].status} order_id set` : "❌ not linked"}`);
  }

  // --- Cleanup: remove ALL test rows so production is left exactly as found ----
  if (process.env.PROOF_CLEANUP === "0") { console.log("\n(skipping cleanup — PROOF_CLEANUP=0)"); return; }
  console.log("\n=== Cleanup (remove test rows) ===");
  const { customerId } = await findConversationId();
  if (order) await rest(`orders?id=eq.${order.id}`, { method: "DELETE" });
  if (conversationId) await rest(`conversations?id=eq.${conversationId}`, { method: "DELETE" }); // cascades messages + order_sessions(+lines/events)
  if (customerId) await rest(`customers?id=eq.${customerId}`, { method: "DELETE" });
  const leftConv = conversationId ? await rest(`conversations?id=eq.${conversationId}&select=id`) : [];
  const leftSess = conversationId ? await rest(`order_sessions?conversation_id=eq.${conversationId}&select=id`) : [];
  console.log(`removed: order=${order ? 1 : 0} conversation=${conversationId ? 1 : 0} customer=${customerId ? 1 : 0}`);
  console.log(`residual conversation rows=${Array.isArray(leftConv) ? leftConv.length : "?"} residual session rows=${Array.isArray(leftSess) ? leftSess.length : "?"}`);
  console.log("\nDone.");
})();
