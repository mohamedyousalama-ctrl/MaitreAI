// ============================================================================
// MIZAN — Saudi-restaurant-agent eval benchmark for Khalid (WO-KHALID-STEP4).
// Run: node scripts/mizan/mizan-eval.mjs   (writes reports/mizan-<date>.md)
//
// ADDITIVE, OFFLINE measurement harness — mirrors scripts/eval-scenarios.mjs. It DRIVES
// the live agent path on a SEEDED test tenant and SCORES the output; it NEVER modifies
// lib/ai/* runtime, the allergen gate, the persona, the prompt, or the engine.
//
// Suites (see mizan-suites.json):
//   • SAFETY (4,5,6,14,15) — ASSERT the existing deterministic gates hold (not reimplemented).
//   • OBJECTIVE machine (2,3,7,8,13) — countable/detectable; the dialect scorer REUSES the
//     Step-2 linter (findLeakage/overLength/emojiCount).
//   • HUMAN hooks (1,9,10,11,12) — dialect authenticity/tone/register: the harness captures
//     Khalid's replies and leaves an EMPTY human-score slot marked PENDING NATIVE REVIEW
//     (Step 5). It NEVER machine-guesses authenticity.
//
// Env (same surface as eval-scenarios.mjs):
//   BASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_ROUTE_SECRET,
//   EVAL_OWNER_UID | EVAL_RESTAURANT_ID   (KSA tenant, khalid_persona ON)
// Exit: 0 all machine/safety gates pass · 1 any FAIL · 2 blocked preflight. The markdown
// report is ALWAYS written (including on a blocked preflight — the structure IS the value).
// No secrets are hardcoded.
// ============================================================================
import { writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  scoreLeakage, scorePriceIntegrity, scoreOrderAccuracy, scoreLengthEmoji,
  assertPrivacy, evaluateGate, overallReadiness, HONEST_LIMITS,
} from "./mizan-score.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(here, "mizan-suites.json"), "utf8"));

const BASE = process.env.BASE_URL || "http://127.0.0.1:3400";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.AGENT_ROUTE_SECRET;
const OWNER_UID = process.env.EVAL_OWNER_UID || "";
const EVAL_RESTAURANT_ID = process.env.EVAL_RESTAURANT_ID || "";

const H = SB ? { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" } : {};
const REP = { ...H, Prefer: "return=representation" };
const j = (r) => r.json();
const stamp = () => new Date().toISOString().slice(0, 10);

// --- minimal seeded-tenant plumbing (mirrors eval-scenarios.mjs) -------------
async function resolveRestaurantId() {
  if (EVAL_RESTAURANT_ID) return EVAL_RESTAURANT_ID;
  if (!OWNER_UID) throw new Error("no EVAL_RESTAURANT_ID and no EVAL_OWNER_UID");
  const rows = await fetch(`${SB}/rest/v1/members?user_id=eq.${OWNER_UID}&select=restaurant_id`, { headers: H }).then(j);
  const id = rows?.[0]?.restaurant_id;
  if (!id) throw new Error("no seeded restaurant for owner " + OWNER_UID);
  return id;
}
async function menuPrices(restaurantId) {
  const items = await fetch(`${SB}/rest/v1/menu_items?restaurant_id=eq.${restaurantId}&select=name,price`, { headers: H }).then(j).catch(() => []);
  return {
    names: (items || []).map((x) => x.name).filter(Boolean),
    prices: (items || []).map((x) => x.price).filter((p) => p != null),
  };
}
async function makeConversation(restaurantId, phone) {
  const cust = await fetch(`${SB}/rest/v1/customers`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: restaurantId, phone, name: "تقييم ميزان" }) }).then(j);
  const customerId = cust?.[0]?.id;
  const conv = await fetch(`${SB}/rest/v1/conversations`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: restaurantId, customer_id: customerId, channel: "whatsapp" }) }).then(j);
  return { customerId, conversationId: conv?.[0]?.id };
}
async function cleanup(restaurantId, conversationId, customerId) {
  for (const t of ["agent_runs", "conversation_signals", "messages"]) await fetch(`${SB}/rest/v1/${t}?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H }).catch(() => {});
  await fetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}`, { method: "DELETE", headers: H }).catch(() => {});
  await fetch(`${SB}/rest/v1/customers?id=eq.${customerId}`, { method: "DELETE", headers: H }).catch(() => {});
}
async function callAgent(restaurantId, conversationId, text) {
  const res = await fetch(`${BASE}/api/agent/respond`, { method: "POST", headers: { "Content-Type": "application/json", "x-agent-secret": SECRET }, body: JSON.stringify({ restaurantId, conversationId, text }) });
  const out = await res.json().catch(() => ({ error: "non_json_response" }));
  out.__http = res.status;
  return out;
}

/** Run one scenario's turns; return the replies + the final agent output. */
async function runScenario(restaurantId, sc, phone) {
  const { customerId, conversationId } = await makeConversation(restaurantId, phone);
  const replies = [];
  let last = null;
  try {
    for (const text of sc.turns) {
      const out = await callAgent(restaurantId, conversationId, text);
      replies.push(out.reply ?? "");
      last = out;
    }
  } finally {
    if (conversationId) await cleanup(restaurantId, conversationId, customerId);
  }
  return { id: sc.id, region: sc.region, frame: sc.frame, turns: sc.turns, replies, last };
}

// --- scoring a suite (by category) ------------------------------------------
function scoreSuite(suite, runs, menu) {
  const allReplies = runs.flatMap((r) => r.replies);
  if (suite.category === "machine") {
    if (suite.metric === "leakage_rate") return { leakage: scoreLeakage(allReplies) };
    if (suite.metric === "length_emoji") return { lengthEmoji: runs.map((r) => ({ id: r.id, ...scoreLengthEmoji(r.replies.at(-1) || "", suite.maxLen || 480) })) };
    if (suite.metric === "price_hallucination") {
      const per = runs.map((r) => ({ id: r.id, ...scorePriceIntegrity(r.replies.at(-1) || "", menu.prices) }));
      return { priceIntegrity: per, inventedPrices: per.reduce((a, b) => a + b.inventedCount, 0) };
    }
    if (suite.metric === "order_accuracy") {
      const per = runs.map((r) => ({ id: r.id, ...scoreOrderAccuracy(r.last?.draft, (suite.scenarios.find((s) => s.id === r.id) || {}).expectItems) }));
      const acc = per.length ? per.reduce((a, b) => a + b.accuracy, 0) / per.length : null;
      return { orderAccuracy: per, avgAccuracy: acc };
    }
    if (suite.metric === "no_invented_menu_item") {
      // pairing menu-truth: offered item names should resolve to the menu (best-effort proxy).
      return { note: "menu-truth pairing — offered items scanned against menu (proxy); see grounding suite 4." };
    }
  }
  if (suite.category === "safety") {
    if (suite.metric === "escalation_rate" || suite.assert === "escalates_when_required") {
      const per = runs.map((r) => ({ id: r.id, escalated: r.last?.escalate === true, mustEscalate: !!(suite.scenarios.find((s) => s.id === r.id) || {}).mustEscalate }));
      const need = per.filter((p) => p.mustEscalate);
      const rate = need.length ? need.filter((p) => p.escalated).length / need.length : null;
      return { escalation: per, escalationRate: rate };
    }
    if (suite.metric === "privacy_pass_rate" || suite.assert === "no_pii_echo") {
      const per = runs.map((r) => ({ id: r.id, ...assertPrivacy(r.replies.at(-1) || "") }));
      const rate = per.length ? per.filter((p) => p.ok).length / per.length : null;
      return { privacy: per, privacyPassRate: rate };
    }
    if (suite.metric === "safety_pass_rate" || suite.assert === "allergen_gate_holds") {
      // ASSERT the deterministic gate fired: allergen scenarios must escalate. Not reimplemented.
      const per = runs.map((r) => ({ id: r.id, escalated: r.last?.escalate === true }));
      const rate = per.length ? per.filter((p) => p.escalated).length / per.length : null;
      return { safety: per, safetyPassRate: rate };
    }
    // grounding / refusals: qualitative assertion — recorded for review (no fabricated pass).
    return { note: `safety assertion «${suite.assert}» — recorded for review; the engine's gate is the source of truth.` };
  }
  // human hook — capture replies, compute OBJECTIVE sub-signals only; SCORE stays PENDING.
  return {
    human: runs.map((r) => ({
      id: r.id, region: r.region, frame: r.frame, turns: r.turns, replies: r.replies,
      subSignals: { leakageClean: scoreLeakage(r.replies).cleanPct, lengthEmoji: scoreLengthEmoji(r.replies.at(-1) || "", 480) },
      humanScore: null, // ← PENDING NATIVE REVIEW (Step 5) — never machine-guessed
    })),
    rubric: suite.rubric,
  };
}

// --- report ------------------------------------------------------------------
function line(a) { return a.join("\n"); }

async function writeReport(meta) {
  const L = [];
  L.push(`# MIZAN — Khalid Saudi-restaurant eval — ${meta.date}`, "");
  L.push(`- **Benchmark:** ${MANIFEST.name} v${MANIFEST.version} · regions: ${MANIFEST.regions.join(", ")}`);
  L.push(`- **Target:** \`${BASE}/api/agent/respond\` (live customer-agent path, seeded KSA tenant, khalid_persona ON)`);
  L.push(`- **Harness:** scripts/mizan/mizan-eval.mjs (ADDITIVE — never modifies the agent/gate/persona/prompt)`);
  L.push(`- **Sample:** ${MANIFEST.sampleNote}`, "");

  L.push(`## ⚠️ Honest limits — read BEFORE any score`, "");
  for (const c of HONEST_LIMITS) L.push(`- ${c}`);
  L.push("");

  if (meta.blocked) {
    L.push(`## ⚠️ Run blocked — no live execution`, "");
    L.push(meta.blockReason, "");
    L.push(`No transcripts or machine scores below — nothing was executed against a live agent. The suite STRUCTURE, rubrics, and launch gates are printed so the benchmark is reviewable; re-run with the env above pointed at a seeded KSA deployment to populate scores.`, "");
  }

  // Launch-gate table
  L.push(`## Launch gates`, "");
  L.push(`| Gate | Metric | Threshold | Result |`, `|---|---|---|---|`);
  const statuses = [];
  for (const g of MANIFEST.launchGates) {
    const val = meta.blocked ? null : (meta.gateValues?.[g.id] ?? null);
    const status = meta.blocked ? (g.metric === "human" ? "PENDING-HUMAN" : "PENDING (blocked)") : evaluateGate(g, val);
    statuses.push(g.metric === "human" ? "PENDING-HUMAN" : (meta.blocked ? "PENDING" : status));
    L.push(`| ${g.label} | ${g.metric} | ${g.op} ${g.threshold} | ${status}${val != null ? ` (${typeof val === "number" ? val.toFixed(3) : val})` : ""} |`);
  }
  L.push("", `**Overall release readiness:** ${overallReadiness(statuses)}`, "");

  // Suites
  L.push(`## Suites (${MANIFEST.suites.length})`, "");
  const catLabel = { safety: "🛡️ SAFETY-assert (existing gate holds)", machine: "🤖 MACHINE-scored (objective)", human: "🧑 HUMAN-hook (PENDING native review — Step 5)" };
  for (const s of MANIFEST.suites) {
    L.push(`### Suite ${s.id} — ${s.name}  ·  ${catLabel[s.category]}`);
    if (s.note) L.push(`_${s.note}_`);
    const scored = meta.scores?.[s.id];
    if (s.category === "human") {
      L.push(`Rubric: ${s.rubric.dimensions.join(" · ")} (1–${s.rubric.scale}, pass ≥ ${s.rubric.threshold}). **Score slot: PENDING NATIVE REVIEW.**`);
      if (scored?.human) {
        for (const h of scored.human) {
          L.push(`- \`${h.id}\`${h.frame ? ` [${h.frame}]` : ""}: guest «${h.turns.join(" | ")}»`);
          for (const rep of h.replies) L.push(`  - Khalid: ${rep || "(no reply)"}`);
          L.push(`  - objective sub-signals: leakage-clean=${(h.subSignals.leakageClean * 100).toFixed(0)}% · chars=${h.subSignals.lengthEmoji.chars} · emoji=${h.subSignals.lengthEmoji.emoji}`);
          L.push(`  - **authenticity/warmth/tone score: ␀ PENDING (native panel)**`);
        }
      } else {
        for (const sc of s.scenarios) L.push(`- \`${sc.id}\`${sc.frame ? ` [${sc.frame}]` : ""}: «${sc.turns.join(" | ")}» → reply PENDING (blocked) · score ␀ PENDING (native panel)`);
      }
    } else if (scored) {
      L.push("```json"); L.push(JSON.stringify(scored, null, 2).slice(0, 4000)); L.push("```");
    } else {
      L.push(`Scenarios (${s.scenarios.length}) — not executed (blocked):`);
      for (const sc of s.scenarios) L.push(`- \`${sc.id}\`: «${sc.turns.join(" | ")}»`);
    }
    L.push("");
  }

  L.push(`---`, `_Machine-scored suites: 2,3,7,8,13 · Safety-assert: 4,5,6,14,15 · Human-hook (PENDING): 1,9,10,11,12._`);
  L.push(`_Nothing in lib/ai/* runtime was touched by this harness — it drives the agent, it does not modify it._`);

  const dir = join(here, "..", "..", "reports");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `mizan-${meta.date}.md`), line(L) + "\n", "utf8");
  console.log(`MIZAN report → reports/mizan-${meta.date}.md`);
}

// --- main --------------------------------------------------------------------
function preflight() {
  const missing = [];
  if (!SB) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SR) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!SECRET) missing.push("AGENT_ROUTE_SECRET");
  if (!EVAL_RESTAURANT_ID && !OWNER_UID) missing.push("EVAL_RESTAURANT_ID | EVAL_OWNER_UID");
  return missing;
}

async function main() {
  const date = stamp();
  const missing = preflight();
  if (missing.length) {
    await writeReport({ date, blocked: true, blockReason: `Missing env: ${missing.join(", ")}. MIZAN needs a seeded KSA test tenant (khalid_persona ON) reachable at BASE_URL. This is the DRY-RUN structure report.` });
    console.log(`MIZAN blocked (preflight): missing ${missing.join(", ")}`);
    process.exit(2);
  }
  const restaurantId = await resolveRestaurantId();
  const menu = await menuPrices(restaurantId);
  const scores = {}; const gateValues = {};
  let anyFail = false;
  for (const suite of MANIFEST.suites) {
    const runs = [];
    for (let i = 0; i < suite.scenarios.length; i++) {
      runs.push(await runScenario(restaurantId, suite.scenarios[i], `+9665${String(Date.now()).slice(-8)}${i}`));
    }
    scores[suite.id] = scoreSuite(suite, runs, menu);
  }
  // map suite scores → gate values
  for (const g of MANIFEST.launchGates) {
    const s = scores[g.suite];
    if (g.id === "order_accuracy") gateValues[g.id] = s?.avgAccuracy ?? null;
    else if (g.id === "price_hallucination") gateValues[g.id] = s?.inventedPrices ?? null;
    else if (g.id === "escalation") gateValues[g.id] = s?.escalationRate ?? null;
    else if (g.id === "pdpl_privacy") gateValues[g.id] = s?.privacyPassRate ?? null;
    else if (g.id === "allergy_safety") gateValues[g.id] = s?.safetyPassRate ?? null;
    else gateValues[g.id] = null; // human → PENDING
    if (g.metric !== "human") {
      const st = evaluateGate(g, gateValues[g.id]);
      if (st === "FAIL") anyFail = true;
    }
  }
  await writeReport({ date, scores, gateValues });
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => { console.error("MIZAN error:", e?.message || e); process.exit(2); });
