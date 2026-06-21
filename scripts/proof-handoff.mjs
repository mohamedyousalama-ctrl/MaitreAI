// ===========================================================================
// HANDOFF-HARDENING proof — timeout→idle safe auto-return + safety carve-out +
// server-side lock behavior. Drives the REAL webhook path (persist → respond-
// and-send) so the idle policy in respondAndSendWhatsApp is exercised end-to-end.
// Targets demo-pro (no WhatsApp creds → test mode → replies persisted, NOT
// transmitted). Each scenario seeds a human-owned conversation with a chosen
// escalation_reason + a backdated updated_at, POSTs an inbound, then inspects the
// resulting DB state. Flags + seeds are restored/cleaned up after.
//
// Run the server with: WHATSAPP_RESTAURANT_ID=<demo-pro> PORT=3400 npm run start
// Usage: BASE_URL=http://127.0.0.1:3400 node scripts/proof-handoff.mjs
// ===========================================================================
const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.PROOF_TENANT || "0de3c0de-0001-4a00-8a00-000000000001"; // demo-pro
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };
const j = (r) => r.json();
const minsAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

async function getFlags() {
  const r = await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}&select=feature_flags`, { headers: H }).then(j);
  return r?.[0]?.feature_flags ?? {};
}
async function patchFlags(flags) {
  await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}`, { method: "PATCH", headers: H, body: JSON.stringify({ feature_flags: flags }) });
}
async function seed({ phone, owner, reason, updatedAt }) {
  const cust = await fetch(`${SB}/rest/v1/customers`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: TENANT, phone, name: "هاندوف تست" }) }).then(j);
  const customerId = cust?.[0]?.id;
  const conv = await fetch(`${SB}/rest/v1/conversations`, {
    method: "POST", headers: REP,
    body: JSON.stringify({ restaurant_id: TENANT, customer_id: customerId, channel: "whatsapp", owner, status: owner === "human" ? "يحتاج تدخل موظف" : "AI نشط", escalation_reason: reason, updated_at: updatedAt }),
  }).then(j);
  return { customerId, conversationId: conv?.[0]?.id };
}
async function bumpUpdatedAt(conversationId, iso) {
  await fetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}`, { method: "PATCH", headers: H, body: JSON.stringify({ updated_at: iso }) });
}
async function cleanup(conversationId, customerId) {
  await fetch(`${SB}/rest/v1/orders?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H });
  for (const t of ["agent_runs", "conversation_signals", "messages"]) {
    await fetch(`${SB}/rest/v1/${t}?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H });
  }
  await fetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}`, { method: "DELETE", headers: H });
  await fetch(`${SB}/rest/v1/customers?id=eq.${customerId}`, { method: "DELETE", headers: H });
}
async function postInbound(phone, text) {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "0", phone_number_id: "PNID_NO_MATCH_ENV_FALLBACK" },
      contacts: [{ profile: { name: "هاندوف تست" }, wa_id: phone }],
      messages: [{ from: phone, id: `wamid.${Date.now()}.${Math.floor(Math.random()*1e6)}`, timestamp: `${Math.floor(Date.now()/1000)}`, type: "text", text: { body: text } }],
    } }] }],
  };
  const res = await fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return res.json().catch(() => ({ error: "non_json", status: res.status }));
}
async function inspect(conversationId) {
  const conv = await fetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}&select=owner,status,escalation_reason`, { headers: H }).then(j);
  const msgs = await fetch(`${SB}/rest/v1/messages?conversation_id=eq.${conversationId}&select=sender,text,meta,created_at&order=created_at.asc`, { headers: H }).then(j);
  const kinds = (msgs || []).map((m) => (m.meta && m.meta.kind) || null);
  return {
    owner: conv?.[0]?.owner,
    autoReturnNote: kinds.includes("handoff_auto_return"),
    idleAlert: (msgs || []).find((m) => m.meta && m.meta.kind === "handoff_idle_alert") || null,
    resumeMsg: (msgs || []).find((m) => m.meta && m.meta.kind === "handoff_resume") || null,
    aiReplies: (msgs || []).filter((m) => m.sender === "ai"),
  };
}

const results = [];
const rec = (id, pass, notes) => { results.push({ id, pass }); console.log(`  → ${pass ? "✅ PASS" : "❌ FAIL"} — ${notes}`); };
let uid = Date.now();
const newPhone = () => `2010${String(uid++).slice(-9)}`;

async function scenario(title, { owner, reason, idleMin, action, bumpToNow, enabled = true }, assertFn) {
  const phone = newPhone();
  const updatedAt = minsAgo(idleMin);
  const { customerId, conversationId } = await seed({ phone, owner, reason, updatedAt });
  console.log(`\n=== ${title} ===`);
  console.log(`  seed: owner=${owner} reason="${reason ?? "—"}" updated_at=${idleMin}min ago action=${action} handoff_timeout=${enabled}`);
  try {
    const flags = await getFlags();
    const next = { ...flags, handoff_idle_minutes: 15, handoff_idle_action: action };
    if (enabled) next.handoff_timeout = true; else delete next.handoff_timeout;
    await patchFlags(next);
    if (bumpToNow) await bumpUpdatedAt(conversationId, new Date().toISOString()); // simulate operator reply (Fix 2 effect)
    const resp = await postInbound(phone, "حد رد عليا؟");
    console.log(`  webhook: persisted=${resp.persisted} responded=${resp.responded} resolvedBy=${resp.resolvedBy}`);
    const st = await inspect(conversationId);
    console.log(`  state: owner=${st.owner} autoReturnNote=${st.autoReturnNote} idleAlert=${!!st.idleAlert}${st.idleAlert ? `(safety=${st.idleAlert.meta.safety})` : ""} resumeMsg=${!!st.resumeMsg} aiReplies=${st.aiReplies.length}`);
    if (st.resumeMsg) console.log(`  resume: «${st.resumeMsg.text}»`);
    assertFn(st);
  } finally {
    await cleanup(conversationId, customerId);
  }
}

async function main() {
  for (const [k, v] of [["SB", SB], ["SR", SR]]) if (!v) { console.error(`MISSING ENV ${k}`); process.exit(2); }
  console.log(`BASE=${BASE} · tenant=${TENANT}`);
  const original = await getFlags();
  try {
    // 0) ISOLATION — flag OFF (default): an idle human-owned conv behaves EXACTLY
    //    as before — skipped_takeover, no auto-return, no alert, AI silent.
    await scenario("ISOLATION (handoff_timeout OFF = current behavior)", { owner: "human", reason: "العميل عايز موظف", idleMin: 30, action: "auto_return", enabled: false },
      (st) => rec("ISOLATION-OFF", st.owner === "human" && !st.autoReturnNote && !st.idleAlert && !st.resumeMsg && st.aiReplies.length === 0,
        `ownerStaysHuman=${st.owner === "human"}; noAutoReturn=${!st.autoReturnNote}; noAlert=${!st.idleAlert}; noAiReply=${st.aiReplies.length === 0}`));

    // 1) SILENT-DEATH CLOSED — non-safety, idle, auto_return → return to AI + resume + answer.
    await scenario("SILENT-DEATH CLOSED (auto_return)", { owner: "human", reason: "العميل عايز يكلم موظف بخصوص استفسار", idleMin: 20, action: "auto_return" },
      (st) => rec("SILENT-DEATH", st.owner === "ai" && st.autoReturnNote && !!st.resumeMsg && st.aiReplies.length >= 2,
        `owner→ai=${st.owner === "ai"}; autoReturnNote=${st.autoReturnNote}; resume=${!!st.resumeMsg}; aiReplies(resume+answer)=${st.aiReplies.length}`));

    // 2) SAFETY CARVE-OUT — allergy reason, idle → NEVER auto-return; re-alert; AI silent.
    await scenario("SAFETY CARVE-OUT (allergy)", { owner: "human", reason: "العميل عنده حساسية من المكسرات ومحتاج تأكيد من المطبخ", idleMin: 20, action: "auto_return" },
      (st) => rec("SAFETY", st.owner === "human" && !!st.idleAlert && st.idleAlert.meta.safety === true && !st.resumeMsg && st.aiReplies.length === 0,
        `ownerStaysHuman=${st.owner === "human"}; safetyAlert=${!!st.idleAlert && st.idleAlert.meta.safety === true}; noResume=${!st.resumeMsg}; noAiReply=${st.aiReplies.length === 0}`));

    // 3) NO PREMATURE RETURN — non-safety but within idle window → stays human, AI silent.
    await scenario("NO PREMATURE RETURN (fresh)", { owner: "human", reason: "العميل عايز موظف", idleMin: 3, action: "auto_return" },
      (st) => rec("NO-PREMATURE", st.owner === "human" && !st.autoReturnNote && !st.idleAlert && st.aiReplies.length === 0,
        `ownerStaysHuman=${st.owner === "human"}; noAutoReturn=${!st.autoReturnNote}; noAlert=${!st.idleAlert}; noAiReply=${st.aiReplies.length === 0}`));

    // 4) REALERT-ONLY action — non-safety, idle → re-alert, stay human, AI silent.
    await scenario("REALERT-ONLY (config)", { owner: "human", reason: "العميل عايز موظف", idleMin: 20, action: "realert_only" },
      (st) => rec("REALERT-ONLY", st.owner === "human" && !!st.idleAlert && st.idleAlert.meta.safety === false && st.aiReplies.length === 0,
        `ownerStaysHuman=${st.owner === "human"}; realert=${!!st.idleAlert}; noAiReply=${st.aiReplies.length === 0}`));

    // 5) IDLE CLOCK RESETS on operator reply (Fix 2 effect) — was idle, but updated_at
    //    bumped to now (as the server-side operator send does) → NO auto-return.
    await scenario("IDLE-RESET on operator reply", { owner: "human", reason: "العميل عايز موظف", idleMin: 20, action: "auto_return", bumpToNow: true },
      (st) => rec("IDLE-RESET", st.owner === "human" && !st.autoReturnNote && st.aiReplies.length === 0,
        `ownerStaysHuman=${st.owner === "human"}; noAutoReturn=${!st.autoReturnNote}; noAiReply=${st.aiReplies.length === 0}`));
  } finally {
    await patchFlags(original);
    console.log(`\nrestored flags=${JSON.stringify(original)}`);
  }
  const passed = results.filter((x) => x.pass).length;
  console.log(`\n──────── HANDOFF PROOF: ${passed}/${results.length} ────────`);
  for (const x of results) console.log(`  ${x.pass ? "✅" : "❌"} ${x.id}`);
  process.exit(passed === results.length ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(3); });
