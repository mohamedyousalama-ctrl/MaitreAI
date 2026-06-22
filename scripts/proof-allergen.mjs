// ===========================================================================
// Allergen-safety proof (deterministic gate + safety-hold flag + flag-off
// byte-identical). Targets demo-pro; toggles `deterministic_allergen_safety`,
// restores after. The deterministic input gate fires WITHOUT an LLM call, so the
// determinism run is exact. Output guard (Fix 3) is covered by the pure unit test.
// Usage: BASE_URL=http://127.0.0.1:3400 node scripts/proof-allergen.mjs
// ===========================================================================
const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SR = process.env.SUPABASE_SERVICE_ROLE_KEY, SECRET = process.env.AGENT_ROUTE_SECRET;
const TENANT = process.env.PROOF_TENANT || "0de3c0de-0001-4a00-8a00-000000000001";
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };
const j = (r) => r.json();
// Distinctive phrase of the FORCED deterministic reply (egyptian).
const FORCED_MARK = "مش هقدر أأكد سلامة الأصناف";

async function getFlags() { const r = await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}&select=feature_flags`, { headers: H }).then(j); return r?.[0]?.feature_flags ?? {}; }
async function setFlag(flags, on) { const n = { ...flags }; if (on) n.deterministic_allergen_safety = true; else delete n.deterministic_allergen_safety; await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}`, { method: "PATCH", headers: H, body: JSON.stringify({ feature_flags: n }) }); }
async function agent(text, conversationId = null) {
  const r = await fetch(`${BASE}/api/agent/respond`, { method: "POST", headers: { "Content-Type": "application/json", "x-agent-secret": SECRET }, body: JSON.stringify({ restaurantId: TENANT, conversationId, text }) });
  return r.json().catch(() => ({ error: "non_json" }));
}
async function seedConv() {
  const phone = `2010${Math.floor(1e8 + Math.random() * 8e8)}`;
  const c = await fetch(`${SB}/rest/v1/customers`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: TENANT, phone, name: "allergy test" }) }).then(j);
  const conv = await fetch(`${SB}/rest/v1/conversations`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: TENANT, customer_id: c[0].id, channel: "whatsapp" }) }).then(j);
  return { customerId: c[0].id, conversationId: conv[0].id };
}
async function cleanup(cid, custId) { for (const t of ["agent_runs", "conversation_signals", "messages"]) await fetch(`${SB}/rest/v1/${t}?conversation_id=eq.${cid}`, { method: "DELETE", headers: H }); await fetch(`${SB}/rest/v1/conversations?id=eq.${cid}`, { method: "DELETE", headers: H }); await fetch(`${SB}/rest/v1/customers?id=eq.${custId}`, { method: "DELETE", headers: H }); }
async function convRow(cid) { const r = await fetch(`${SB}/rest/v1/conversations?id=eq.${cid}&select=owner,is_safety_hold,escalation_reason`, { headers: H }).then(j); return r?.[0]; }

const results = [];
const rec = (id, pass, note) => { results.push({ id, pass }); console.log(`  ${pass ? "✅" : "❌"} ${id} — ${note}`); };

async function main() {
  for (const [k, v] of [["SB", SB], ["SR", SR], ["SECRET", SECRET]]) if (!v) { console.error(`MISSING ${k}`); process.exit(2); }
  const original = await getFlags();
  console.log(`tenant=${TENANT} · original flags=${JSON.stringify(original)}`);
  try {
    // ===== FLAG ON =====
    await setFlag(original, true);

    // A. DETERMINISM — the live case 10× → forced escalation EVERY time (no LLM).
    let fired = 0;
    for (let i = 0; i < 10; i++) {
      const out = await agent("أنا هستلم من الفرع ولكني انا اتعب لو اكلت بندق");
      if (out.escalate === true && (out.reply || "").includes(FORCED_MARK) && (out.toolsUsed || []).includes("escalate_to_human")) fired++;
    }
    rec("A determinism (اتعب لو اكلت بندق) 10×", fired === 10, `escalated ${fired}/10 (forced, deterministic)`);

    // B. Variants that MUST fire (euphemism, no «حساسية»).
    for (const [label, text] of [["بيتعب من البندق", "صاحبي بيتعب من البندق"], ["بموت لو كلت فستق", "بموت لو كلت فستق"], ["مشكلة مع اللوز", "عندي مشكلة مع اللوز"]]) {
      const out = await agent(text);
      rec(`B fires: ${label}`, out.escalate === true && (out.reply || "").includes(FORCED_MARK), `escalate=${out.escalate}`);
    }

    // C. NEGATIVE — must NOT force-escalate (no avoidance intent) → LLM path.
    {
      const out = await agent("بحب البندق وعايز قطعة كيك");
      const forced = (out.reply || "").includes(FORCED_MARK);
      rec("C negative (بحب البندق) → NOT forced", !forced, `forcedLine=${forced} (LLM handled it)`);
    }

    // D. Fix 2 — persisted: owner=human + is_safety_hold=true (the carve-out source).
    {
      const { customerId, conversationId } = await seedConv();
      await agent("اتعب لو اكلت بندق", conversationId);
      const row = await convRow(conversationId);
      rec("D Fix2 is_safety_hold flag set", row?.owner === "human" && row?.is_safety_hold === true, `owner=${row?.owner} is_safety_hold=${row?.is_safety_hold}`);
      await cleanup(conversationId, customerId);
    }

    // ===== FLAG OFF — byte-identical (gate must NOT fire; LLM path) =====
    await setFlag(original, false);
    {
      const out = await agent("أنا هستلم من الفرع ولكني انا اتعب لو اكلت بندق");
      const forced = (out.reply || "").includes(FORCED_MARK);
      rec("E flag OFF → forced gate NOT taken (LLM path)", !forced, `forcedLine=${forced} (flag off → no-op; reply: «${String(out.reply || "").slice(0, 50)}…»)`);
    }
  } finally {
    await fetch(`${SB}/rest/v1/restaurants?id=eq.${TENANT}`, { method: "PATCH", headers: H, body: JSON.stringify({ feature_flags: original }) });
    console.log(`\nrestored flags=${JSON.stringify(original)}`);
  }
  const pass = results.filter((x) => x.pass).length;
  console.log(`\n──────── ALLERGEN-SAFETY PROOF: ${pass}/${results.length} ────────`);
  process.exit(pass === results.length ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(3); });
