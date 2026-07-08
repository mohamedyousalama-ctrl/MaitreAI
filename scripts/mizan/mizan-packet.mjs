// ============================================================================
// MIZAN — native-review PACKET generator (WO-KHALID-STEP5). Run:
//   node scripts/mizan/mizan-packet.mjs   (writes reports/mizan-packet-<date>.json
//                                          + reports/mizan-review-<date>.html)
//
// ADDITIVE, OFFLINE harness — mirrors mizan-eval.mjs plumbing. It DRIVES the live agent on a
// SEEDED KSA tenant (khalid_persona ON), captures Khalid's replies for ONLY the 5 human-hook
// suites (1 dialect / 9 tone / 10 upsell / 11 complaint / 12 karam), and produces the review
// packet + a self-contained reviewer HTML (the UI template with the packet embedded, so a
// non-technical reviewer just opens ONE file on their phone). It NEVER modifies lib/ai/*,
// the allergen gate, the persona, or the prompt — and it NEVER scores authenticity itself.
//
// Env (same surface as mizan-eval.mjs): BASE_URL, NEXT_PUBLIC_SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY, AGENT_ROUTE_SECRET, EVAL_OWNER_UID | EVAL_RESTAURANT_ID.
// Exit: 0 packet written · 2 blocked preflight / runtime error. No secrets hardcoded.
// ============================================================================
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HUMAN_SUITE_IDS } from "./mizan-panel-score.mjs";

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

async function tfetch(url, opts = {}, ms = 10000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error(`timeout after ${ms}ms: ${url}`);
    throw e;
  } finally {
    clearTimeout(to);
  }
}

async function resolveRestaurantId() {
  if (EVAL_RESTAURANT_ID) return EVAL_RESTAURANT_ID;
  if (!OWNER_UID) throw new Error("no EVAL_RESTAURANT_ID and no EVAL_OWNER_UID");
  const rows = await tfetch(`${SB}/rest/v1/members?user_id=eq.${OWNER_UID}&select=restaurant_id`, { headers: H }).then(j);
  const id = rows?.[0]?.restaurant_id;
  if (!id) throw new Error("no seeded restaurant for owner " + OWNER_UID);
  return id;
}
async function makeConversation(restaurantId, phone) {
  const cust = await tfetch(`${SB}/rest/v1/customers`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: restaurantId, phone, name: "تقييم ميزان" }) }).then(j);
  const customerId = cust?.[0]?.id;
  const conv = await tfetch(`${SB}/rest/v1/conversations`, { method: "POST", headers: REP, body: JSON.stringify({ restaurant_id: restaurantId, customer_id: customerId, channel: "whatsapp" }) }).then(j);
  return { customerId, conversationId: conv?.[0]?.id };
}
async function cleanup(restaurantId, conversationId, customerId) {
  for (const t of ["agent_runs", "conversation_signals", "messages"]) await tfetch(`${SB}/rest/v1/${t}?conversation_id=eq.${conversationId}`, { method: "DELETE", headers: H }).catch(() => {});
  await tfetch(`${SB}/rest/v1/conversations?id=eq.${conversationId}`, { method: "DELETE", headers: H }).catch(() => {});
  await tfetch(`${SB}/rest/v1/customers?id=eq.${customerId}`, { method: "DELETE", headers: H }).catch(() => {});
}
async function callAgent(restaurantId, conversationId, text) {
  const res = await tfetch(`${BASE}/api/agent/respond`, { method: "POST", headers: { "Content-Type": "application/json", "x-agent-secret": SECRET }, body: JSON.stringify({ restaurantId, conversationId, text }) }, 30000);
  const out = await res.json().catch(() => ({ error: "non_json_response" }));
  out.__http = res.status;
  return out;
}
async function runScenario(restaurantId, sc, phone) {
  const { customerId, conversationId } = await makeConversation(restaurantId, phone);
  const replies = [];
  try {
    for (const text of sc.turns) {
      const out = await callAgent(restaurantId, conversationId, text);
      replies.push(out.reply ?? "");
    }
  } finally {
    if (conversationId) await cleanup(restaurantId, conversationId, customerId);
  }
  return replies;
}

// --- packet shape ------------------------------------------------------------
/** One reviewer-facing item: the customer message(s), Khalid's reply(ies), and the rubric.
 *  NO ids/internals that a reviewer shouldn't see are shown in the UI — but they are carried
 *  in the packet so aggregation can map scores back to suites/scenarios. */
function buildItems(suite, repliesById) {
  return suite.scenarios.map((sc) => ({
    scenarioId: sc.id,
    suiteId: suite.id,
    suiteName: suite.name,
    region: sc.region || null,
    frame: sc.frame || null,
    turns: sc.turns,
    replies: repliesById[sc.id] || [],
    dimensions: suite.rubric.dimensions,
    scale: suite.rubric.scale,
  }));
}

/** Emit the self-contained reviewer HTML: the UI template with the packet injected in place
 *  of the __MIZAN_PACKET__ placeholder, so the reviewer opens ONE file (no server, no picker). */
async function writeReviewHtml(packet, date, blocked) {
  const tpl = await readFile(join(here, "review-ui.html"), "utf8");
  // Target the DATA slot uniquely (`>__MIZAN_PACKET__</script>`) — the bare token also appears in
  // the header comment and in the JS template-detection literal, and String.replace only swaps the
  // first match, so replacing the bare token would fill the wrong spot and leave the data empty.
  const payload = JSON.stringify(packet).replace(/</g, "\\u003c");
  const injected = tpl.replace(">__MIZAN_PACKET__</script>", () => `>${payload}</script>`);
  const dir = join(here, "..", "..", "reports");
  await mkdir(dir, { recursive: true });
  const name = blocked ? `mizan-review-${date}-TEMPLATE.html` : `mizan-review-${date}.html`;
  await writeFile(join(dir, name), injected, "utf8");
  console.log(`MIZAN review UI → reports/${name}`);
}

async function writePacket(packet, date) {
  const dir = join(here, "..", "..", "reports");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `mizan-packet-${date}.json`), JSON.stringify(packet, null, 2) + "\n", "utf8");
  console.log(`MIZAN packet → reports/mizan-packet-${date}.json (${packet.items.length} items, ${packet.suites.length} human suites)`);
}

// --emit-active rewrites JUST lib/mizan/active-packet-data.ts (the TS literal the
// HOSTED /mizan/<token> surface serves) with this run's live packetId + replies, so
// the deployed reviewer flow scores Khalid's REAL captured replies. No scores here —
// only prompts/replies a human reads. Scores are saved to Supabase by the API route.
const EMIT_ACTIVE = process.argv.includes("--emit-active");
async function writeActivePacketData(packet) {
  const reviewerView = {
    packetId: packet.packetId,
    benchmark: packet.benchmark,
    unseeded: !!packet.blocked || packet.items.every((it) => !(it.replies || []).some((r) => r && r.trim())),
    minReviewers: packet.minReviewers,
    note: packet.note || "لكل رد: قيّم من ١ إلى ١٠ على كل بُعد، وأضف ملاحظة إن رغبت. قيّم اللهجة والأسلوب فقط.",
    suites: packet.suites,
    items: packet.items.map((it) => ({
      scenarioId: it.scenarioId, suiteId: it.suiteId, suiteName: it.suiteName,
      region: it.region ?? null, frame: it.frame ?? null,
      turns: it.turns, replies: it.replies || [],
      dimensions: it.dimensions, scale: it.scale,
    })),
  };
  const header = `// ============================================================================
// MaitreAI — MIZAN ACTIVE PACKET DATA (WO-KHALID-STEP5B) — GENERATED, do not hand-edit.
//
// The reviewer packet the hosted /mizan/<token> surface serves: Khalid's captured
// replies for the 5 human-hook suites plus the rubric each is scored on. This is a
// TS LITERAL module (repo convention — bare-node ESM cannot import JSON at runtime),
// named active-packet-data.ts (NOT *.data.ts — the ts-ext resolver treats a ".data"
// suffix as a file extension and fails to resolve it).
//
// Regenerate against a seeded KSA tenant (khalid_persona ON) with:
//   node scripts/mizan/mizan-packet.mjs --emit-active
// which rewrites JUST this file with the live packetId + Khalid's real replies. No
// scores live here — only the prompts/replies a human reads. Scores go to Supabase.
// ============================================================================

export const ACTIVE_PACKET_DATA = ${JSON.stringify(reviewerView, null, 2)} as const;
`;
  const out = join(here, "..", "..", "lib", "mizan", "active-packet-data.ts");
  await writeFile(out, header, "utf8");
  console.log(`MIZAN active packet → lib/mizan/active-packet-data.ts (${reviewerView.items.length} items, packetId ${reviewerView.packetId}${reviewerView.unseeded ? ", UNSEEDED" : ""})`);
}

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
  const humanSuites = MANIFEST.suites.filter((s) => s.category === "human" && HUMAN_SUITE_IDS.includes(s.id));
  const basePacket = {
    packetId: `mizan-panel-${date}`,
    benchmark: `${MANIFEST.name} v${MANIFEST.version}`,
    generatedAt: new Date().toISOString(),
    regions: MANIFEST.regions,
    minReviewers: 3,
    guide: "docs/KHALID_NATIVE_REVIEW_GUIDE_AR.md",
    note: "لكل رد: قيّم من ١ إلى ١٠ على كل بُعد، وأضف ملاحظة إن رغبت. قيّم اللهجة والأسلوب فقط.",
    suites: humanSuites.map((s) => ({ id: s.id, name: s.name, dimensions: s.rubric.dimensions, scale: s.rubric.scale, threshold: s.rubric.threshold })),
  };

  const missing = preflight();
  if (missing.length) {
    // Blocked: still emit the packet STRUCTURE (scenarios/rubrics, replies empty) + the UI
    // TEMPLATE so the flow is reviewable without a live tenant. No fabricated replies.
    const items = humanSuites.flatMap((s) => buildItems(s, {}));
    const packet = { ...basePacket, blocked: true, blockReason: `Missing env: ${missing.join(", ")}. Point at a seeded KSA tenant (khalid_persona ON) to capture live replies.`, items };
    await writePacket(packet, date);
    await writeReviewHtml(packet, date, true);
    if (EMIT_ACTIVE) await writeActivePacketData(packet); // regenerates the UNSEEDED committed default
    console.log(`MIZAN packet blocked (preflight): missing ${missing.join(", ")} — wrote STRUCTURE + UI template.`);
    process.exit(2);
  }

  let restaurantId = null;
  let originalFlags = {};
  let personaTouched = false;
  try {
    restaurantId = await resolveRestaurantId();
    const frows = await tfetch(`${SB}/rest/v1/restaurants?id=eq.${restaurantId}&select=feature_flags`, { headers: H }).then(j).catch(() => []);
    originalFlags = frows?.[0]?.feature_flags ?? {};
    if (originalFlags.khalid_persona !== true) {
      await tfetch(`${SB}/rest/v1/restaurants?id=eq.${restaurantId}`, { method: "PATCH", headers: H, body: JSON.stringify({ feature_flags: { ...originalFlags, khalid_persona: true } }) });
      personaTouched = true;
      console.log("MIZAN packet: khalid_persona was OFF — enabled for this run (will restore).");
    }
    const items = [];
    for (const suite of humanSuites) {
      const repliesById = {};
      for (let i = 0; i < suite.scenarios.length; i++) {
        const sc = suite.scenarios[i];
        try {
          repliesById[sc.id] = await runScenario(restaurantId, sc, `+9665${String(Date.now()).slice(-8)}${i}`);
        } catch (e) {
          repliesById[sc.id] = [];
          console.error(`MIZAN packet scenario ${sc.id} failed:`, e?.message || e);
        }
      }
      items.push(...buildItems(suite, repliesById));
    }
    const packet = { ...basePacket, items };
    await writePacket(packet, date);
    await writeReviewHtml(packet, date, false);
    if (EMIT_ACTIVE) await writeActivePacketData(packet); // bake live replies into the hosted surface
    process.exitCode = 0;
  } catch (e) {
    const items = humanSuites.flatMap((s) => buildItems(s, {}));
    const packet = { ...basePacket, blocked: true, blockReason: `Runtime error: ${e?.message || e}`, items };
    await writePacket(packet, date);
    await writeReviewHtml(packet, date, true);
    console.error("MIZAN packet error:", e?.message || e);
    process.exitCode = 2;
  } finally {
    if (personaTouched && restaurantId) {
      await tfetch(`${SB}/rest/v1/restaurants?id=eq.${restaurantId}`, { method: "PATCH", headers: H, body: JSON.stringify({ feature_flags: originalFlags }) }).catch(() => {});
    }
  }
}

main().catch((e) => { console.error("MIZAN packet fatal:", e?.message || e); process.exit(2); });
