// ===========================================================================
// Quick-wins live proof on Wesaya (real tenant 5acbc72f…, agent_mode=test).
// Wesaya carries the items demo-pro lacks: «برجر لحم» with عادي/دوبل variants
// (FIX A) and a البيتزا category of 12 items (deflection overflow >10). This
// script seeds a THROWAWAY customer+conversation, runs the four quick-win cases
// over the real /api/agent/respond route (so prompt.ts + respond.ts changes are
// live), prints reply/draft/toolsUsed, asserts the fix, then deletes everything
// it created (messages, agent_runs, signals, any finalized order, conversation,
// customer) so Wesaya stays pristine. READ of the menu only; no schema change.
// Usage: BASE_URL=http://127.0.0.1:3400 node scripts/proof-quickwins-wesaya.mjs
// ===========================================================================
const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const WESAYA = process.env.WESAYA_RESTAURANT_ID || "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };
const j = (r) => r.json();

function arabicOnly(s) {
  // Latin letters (beyond the odd unit) would mean it leaked the input register.
  const latin = (String(s).match(/[A-Za-z]/g) || []).length;
  return { pass: latin <= 2, notes: `latin=${latin}` };
}
const has = (s, words) => words.filter((w) => String(s).includes(w));

async function makeConversation(phone) {
  const cust = await fetch(`${SB}/rest/v1/customers`, {
    method: "POST", headers: REP,
    body: JSON.stringify({ restaurant_id: WESAYA, phone, name: "تجربة كويك-وين" }),
  }).then(j);
  const customerId = cust?.[0]?.id;
  const conv = await fetch(`${SB}/rest/v1/conversations`, {
    method: "POST", headers: REP,
    body: JSON.stringify({ restaurant_id: WESAYA, customer_id: customerId, channel: "whatsapp" }),
  }).then(j);
  return { customerId, conversationId: conv?.[0]?.id };
}

async function cleanup(conversationId, customerId) {
  // Delete the throwaway order(s) this conversation may have finalized FIRST.
  await fetch(`${SB}/rest/v1/orders?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H });
  await fetch(`${SB}/rest/v1/conversation_reports?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H });
  await fetch(`${SB}/rest/v1/customer_memory?restaurant_id=eq.${WESAYA}&customer_id=eq.${customerId}`, { method: "DELETE", headers: H });
  for (const t of ["agent_runs", "conversation_signals", "messages"]) {
    await fetch(`${SB}/rest/v1/${t}?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H });
  }
  await fetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}`, { method: "DELETE", headers: H });
  await fetch(`${SB}/rest/v1/customers?id=eq.${customerId}`, { method: "DELETE", headers: H });
}

async function callAgent(conversationId, text) {
  const res = await fetch(`${BASE}/api/agent/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-agent-secret": SECRET },
    body: JSON.stringify({ restaurantId: WESAYA, conversationId, text }),
  });
  const out = await res.json().catch(() => ({ error: "non_json_response" }));
  out.__http = res.status;
  return out;
}

// Run a multi-turn case in its own throwaway conversation; return the LAST out.
async function run(caseId, turns) {
  const phone = `+201000${Math.floor(100000 + Math.random() * 899999)}`;
  const { customerId, conversationId } = await makeConversation(phone);
  let last = null;
  console.log(`\n=== ${caseId} ===`);
  try {
    for (const t of turns) {
      last = await callAgent(conversationId, t);
      const tools = (last.toolsUsed || []).join(",");
      console.log(`  C: «${t}»`);
      console.log(`  K[${last.__http}]: ${String(last.reply || last.error || "").replace(/\n/g, " ⏎ ")}`);
      console.log(`     tools=[${tools}] finalized=${last.draft?.finalized} lines=${JSON.stringify((last.draft?.lines || []).map((l) => ({ n: l.name, v: l.variant?.name, q: l.quantity })))}`);
    }
  } finally {
    await cleanup(conversationId, customerId);
  }
  return last;
}

const results = [];
function record(id, pass, notes) {
  results.push({ id, pass, notes });
  console.log(`  → ${pass ? "✅ PASS" : "❌ FAIL"} — ${notes}`);
}

async function main() {
  for (const k of [["NEXT_PUBLIC_SUPABASE_URL", SB], ["SUPABASE_SERVICE_ROLE_KEY", SR], ["AGENT_ROUTE_SECRET", SECRET]]) {
    if (!k[1]) { console.error(`MISSING ENV: ${k[0]}`); process.exit(2); }
  }
  console.log(`BASE=${BASE} · tenant=${WESAYA} (Wesaya, test mode)`);

  // FIX A — ambiguous terse «دبل» (the real incident wording) → ASK before encoding.
  {
    const out = await run("A-AMBIGUOUS (دبل terse)", ["عايز سندوتشين برجر عادي. دبل ومايه"]);
    const r = out.reply || "";
    const ao = arabicOnly(r);
    const asks = r.includes("؟") && has(r, ["دوبل", "دبل"]).length > 0;
    const notFinalized = out.draft?.finalized !== true;
    record("A-AMBIGUOUS", ao.pass && asks && notFinalized, `${ao.notes}; asksAboutDouble=${asks}; notFinalized=${notFinalized}`);
  }

  // FIX A — clearly bound «برجر لحم دوبل واحد» → direct add, NO re-confirm friction.
  {
    const out = await run("A-CLEAR (دوبل bound)", ["عايز برجر لحم دوبل واحد"]);
    const r = out.reply || "";
    const ao = arabicOnly(r);
    const lines = out.draft?.lines || [];
    const addedDouble = lines.some((l) => /برجر/.test(l.name || "") && /دوبل/.test(l.variant?.name || ""));
    // Over-fire guard: it must NOT re-ask «قصدك دوبل؟» for a clearly bound token.
    const reConfirms = /قصدك.*دوبل|دوبل.*\?|تقصد.*دوبل/.test(r);
    record("A-CLEAR", ao.pass && addedDouble && !reConfirms, `${ao.notes}; addedDoubleDirect=${addedDouble}; reConfirmedClear=${reConfirms}`);
  }

  // FIX deflection — «كل أنواع البيتزا» (12 items, >10 cap) → NAME them, never deflect.
  {
    const out = await run("DEFLECT-OVERFLOW (12 pizzas)", ["وريني كل أنواع البيتزا اللي عندكم"]);
    const r = out.reply || "";
    const ao = arabicOnly(r);
    const deflects = has(r, ["اختار اللي يعجبك", "اختار وقوللي", "اختار وقللي", "شوف اللي يعجبك", "اختر اللي يعجبك"]).length > 0;
    const presented = (out.presentation || out.toolsUsed?.includes?.("present_menu")) ? true : false;
    // Helpful = either it presented the list OR it named several pizza types in text.
    const namedCount = has(r, ["مارجريتا", "بيبروني", "سوبر", "خضار", "فراخ", "دجاج", "مشروم", "جبنة", "مكس", "باربكيو", "بيتزا"]).length;
    record("DEFLECT-OVERFLOW", ao.pass && !deflects && (presented || namedCount >= 3), `${ao.notes}; deflects=${deflects}; presented=${presented}; namedTypes=${namedCount}`);
  }

  // FIX «هات» — bare «هات البرجر» on an existing line → affirmation, qty stays 1.
  {
    const out = await run("HAAT (affirmation)", ["عايز برجر لحم عادي واحد", "من غير إضافات، ضيفه", "هات البرجر"]);
    const lines = out.draft?.lines || [];
    const qty = lines.filter((l) => /برجر/.test(l.name || "")).reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    record("HAAT", qty === 1, `burgerQty=${qty} (expected 1, no bump)`);
  }

  // FIX C — order ready → «تاكيد» (hamza-less) finalizes in-turn, no async promise.
  {
    const out = await run("C-NOASYNC (تاكيد typo)", ["عايز برجر لحم عادي واحد", "من غير إضافات، ضيفه", "عايز توصيل لمنطقة الهرم", "تاكيد"]);
    const r = out.reply || "";
    const ao = arabicOnly(r);
    const finalized = out.draft?.finalized === true || (out.toolsUsed || []).includes("finalize_draft");
    const asyncPromise = /أجهّز|أجهز|بحضّر|بحضر|هرجعل|أرجعل|هكلّمك|هكلمك|هبعتل|لحظة بسيطة|من السيستم/.test(r);
    record("C-NOASYNC", ao.pass && finalized && !asyncPromise, `${ao.notes}; finalized=${finalized}; asyncPromise=${asyncPromise}`);
  }

  const passed = results.filter((x) => x.pass).length;
  console.log(`\n──────── WESAYA QUICK-WIN PROOF: ${passed}/${results.length} passed ────────`);
  for (const x of results) console.log(`  ${x.pass ? "✅" : "❌"} ${x.id} — ${x.notes}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(3); });
