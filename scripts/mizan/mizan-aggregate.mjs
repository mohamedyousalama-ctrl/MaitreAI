// ============================================================================
// MIZAN — native-panel AGGREGATE (WO-KHALID-STEP5). Run:
//   node scripts/mizan/mizan-aggregate.mjs <reviewers-dir> [--label=SAMPLE] [--packet=path]
//   (default reviewers dir: reports/reviews/ ; writes reports/mizan-panel-<date>.md)
//
// Reads the reviewer result JSON files (one per human), aggregates ≥3 reviewers per item with
// inter-reviewer VARIANCE surfaced, feeds the aggregate into the EXISTING MIZAN evaluateGate /
// overallReadiness (Step 4 — NOT rebuilt), and writes an updated report where the human suites
// show a real PASS/FAIL (or HIGH-VARIANCE / PENDING-HUMAN) instead of a blank slot.
//
// ★★ It NEVER produces a score. Under-reviewed items stay PENDING-HUMAN. There is no machine
// guess of authenticity anywhere. ADDITIVE/OFFLINE — no runtime/gate/persona/prompt touched.
// ============================================================================
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluateGate, overallReadiness, HONEST_LIMITS } from "./mizan-score.mjs";
import { HUMAN_SUITE_IDS, MIN_REVIEWERS, VARIANCE_RANGE_FLAG, collectByScenario, aggregateSuite, panelGateStatus } from "./mizan-panel-score.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(await readFile(join(here, "mizan-suites.json"), "utf8"));
const stamp = () => new Date().toISOString().slice(0, 10);

function arg(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
}
const REVIEWS_DIR = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : (process.env.MIZAN_REVIEWS_DIR || join(here, "..", "..", "reports", "reviews"));
const LABEL = arg("label", process.env.MIZAN_PANEL_LABEL || "");
const PACKET_PATH = arg("packet", "");
const EXPECTED_PACKET_ID = arg("packetId", "");
const isSample = /sample/i.test(LABEL);

/** Reject reviewer files exported against a DIFFERENT packet run. Scenario IDs (S1-01…) are
 *  stable across runs, so stale ratings for old replies/persona could otherwise be counted toward
 *  the live gate and wrongly resolve the dialect slot (Codex P1). Expected packetId = --packetId,
 *  else the packet file's id (--packet), else the single distinct id among the files. If the files
 *  carry MORE than one packetId and none was named, we refuse to blend them. */
function partitionByPacket(files, expected) {
  const kept = [], packetSkips = [];
  for (const f of files) {
    const pid = f && f.packetId ? String(f.packetId) : "";
    if (expected && pid !== expected) { packetSkips.push({ reason: pid ? `packetId mismatch (${pid} ≠ ${expected})` : `missing packetId (expected ${expected})`, file: f.reviewerName || f.reviewerId }); continue; }
    kept.push(f);
  }
  return { kept, packetSkips };
}
function resolveExpectedPacketId(files, explicit, packet) {
  if (explicit) return { id: explicit, mixed: false };
  if (packet && packet.packetId) return { id: String(packet.packetId), mixed: false };
  const ids = [...new Set(files.map((f) => f && f.packetId).filter(Boolean))];
  if (ids.length <= 1) return { id: ids[0] || "", mixed: false };
  return { id: "", mixed: true, ids };
}

async function loadReviewerFiles(dir) {
  let names = [];
  try { names = (await readdir(dir)).filter((n) => n.endsWith(".json")); } catch { return { files: [], dir, missing: true }; }
  const files = [];
  for (const n of names) {
    try {
      const obj = JSON.parse(await readFile(join(dir, n), "utf8"));
      if (obj && Array.isArray(obj.scores)) files.push(obj);
    } catch (e) { console.error(`skip unreadable ${n}: ${e?.message || e}`); }
  }
  return { files, dir, missing: false };
}

async function loadPacket() {
  if (!PACKET_PATH) return { byId: {}, packet: null };
  try {
    const p = JSON.parse(await readFile(PACKET_PATH, "utf8"));
    const byId = {};
    for (const it of (p.items || [])) byId[it.scenarioId] = { turns: it.turns, replies: it.replies };
    return { byId, packet: p };
  } catch { return { byId: {}, packet: null }; }
}

function fmt(n, d = 2) { return typeof n === "number" ? n.toFixed(d) : "—"; }

async function main() {
  const date = stamp();
  const humanSuites = MANIFEST.suites.filter((s) => s.category === "human" && HUMAN_SUITE_IDS.includes(s.id));
  const { files: allFiles, dir, missing } = await loadReviewerFiles(REVIEWS_DIR);
  const { byId: replies, packet } = await loadPacket();

  // Enforce packetId BEFORE aggregating — never blend ratings from different packet runs.
  const expected = resolveExpectedPacketId(allFiles, EXPECTED_PACKET_ID, packet);
  if (expected.mixed) {
    const outDir = join(here, "..", "..", "reports");
    await mkdir(outDir, { recursive: true });
    const msg = `Reviewer files carry MULTIPLE packetIds (${expected.ids.join(", ")}) and none was named. Refusing to blend runs — pass --packetId=<id> (or --packet=<path>) to pick the target packet.`;
    await writeFile(join(outDir, `mizan-panel-${date}.md`), `# MIZAN — native-panel results — BLOCKED — ${date}\n\n> ⚠️ ${msg}\n`, "utf8");
    console.error("MIZAN aggregate blocked:", msg);
    process.exitCode = 2;
    return;
  }
  const { kept: files, packetSkips } = partitionByPacket(allFiles, expected.id);
  const { byScenario, skipped: idSkips } = collectByScenario(files);
  const skipped = [...idSkips, ...packetSkips];
  const expectedPacketId = expected.id;

  // Aggregate every human suite.
  const aggBySuite = {};
  for (const s of humanSuites) aggBySuite[s.id] = aggregateSuite(s, byScenario);

  // Resolve gate statuses: the ONE human launch gate is dialect_authenticity (suite 1). The
  // machine/safety launch gates are measured by mizan-eval.mjs, NOT here — this panel step only
  // resolves the human slots, so we mark the others as measured-elsewhere and keep overall honest.
  const gateRows = [];
  const statuses = [];
  for (const g of MANIFEST.launchGates) {
    if (g.metric === "human") {
      const agg = aggBySuite[g.suite];
      const pg = panelGateStatus(g, agg, evaluateGate);
      gateRows.push({ g, label: pg.label, value: agg ? agg.gateValue : null, panel: true });
      statuses.push(pg.status);
    } else {
      gateRows.push({ g, label: "— (from mizan-eval machine/safety run)", value: null, panel: false });
      statuses.push("PENDING"); // not re-measured in the panel step
    }
  }

  const reviewerIds = [...new Set(files.map((f) => f.reviewerId).filter(Boolean))];

  // --- report -----------------------------------------------------------------
  const L = [];
  L.push(`# MIZAN — native-panel results — Khalid — ${date}`, "");
  if (isSample) {
    L.push(`> ## 🧪 SAMPLE — NOT REAL REVIEWER DATA`);
    L.push(`> These scores are DUMMY inputs to demonstrate the aggregate→gate flow. They do **not** resolve the real launch gate. The dialect gate stays PENDING-HUMAN until ≥${MIN_REVIEWERS} real Saudi reviewers score the live packet.`, "");
  }
  L.push(`- **Benchmark:** ${MANIFEST.name} v${MANIFEST.version} · human-hook suites: ${HUMAN_SUITE_IDS.join(", ")}`);
  L.push(`- **Reviewers found:** ${reviewerIds.length}${reviewerIds.length ? ` (${reviewerIds.join(", ")})` : ""} · min per item required: ${MIN_REVIEWERS} (and every rubric dimension needs ≥${MIN_REVIEWERS} scores)`);
  L.push(`- **Packet:** ${expectedPacketId ? `\`${expectedPacketId}\` (reviewer files for other packets are rejected)` : "not specified — no packetId cross-check"}`);
  L.push(`- **Reviews dir:** \`${dir.replace(join(here, "..", ".."), ".")}\`${missing ? " (not found — no reviewer files yet)" : ""}`);
  L.push(`- **Variance flag:** an item whose reviewers span ≥ ${VARIANCE_RANGE_FLAG} points on a dimension is flagged HIGH-VARIANCE (adjudicate, don't average).`, "");

  L.push(`## ⚠️ Honest limits — read BEFORE any score`, "");
  for (const c of HONEST_LIMITS) L.push(`- ${c}`);
  L.push(`- This panel step aggregates HUMAN scores only — it never machine-scores authenticity. Under-reviewed items stay PENDING-HUMAN.`, "");

  L.push(`## Launch gates (human slots resolved by this panel)`, "");
  L.push(`| Gate | Metric | Threshold | Result | Value |`, `|---|---|---|---|---|`);
  for (const r of gateRows) {
    L.push(`| ${r.g.label} | ${r.g.metric} | ${r.g.op} ${r.g.threshold} | ${r.label} | ${r.value != null ? fmt(r.value) : "—"} |`);
  }
  L.push("", `**Overall release readiness:** ${overallReadiness(statuses)}`, "");
  if (statuses.includes("PENDING") && !isSample) L.push(`_Machine/safety gates are resolved by \`node scripts/mizan/mizan-eval.mjs\` (Step 4), not this panel step — combine both reports for full readiness._`, "");
  L.push("");

  // Per-suite detail
  L.push(`## Human suites — per-item aggregate`, "");
  for (const s of humanSuites) {
    const agg = aggBySuite[s.id];
    L.push(`### Suite ${s.id} — ${s.name}  ·  status: **${agg.status}**${agg.highVariance ? " ⚠️ HIGH-VARIANCE" : ""}`);
    L.push(`Rubric: ${s.rubric.dimensions.join(" · ")} (1–${s.rubric.scale}, pass ≥ ${s.rubric.threshold}) · min reviewers seen: ${agg.minReviewers}`);
    for (const it of agg.items) {
      const rep = replies[it.scenarioId];
      L.push(`- \`${it.scenarioId}\` — reviewers: ${it.reviewerCount} · status: ${it.status}${it.highVariance ? " ⚠️" : ""}`);
      if (rep) { for (const r of (rep.replies || []).filter(Boolean)) L.push(`  - Khalid: ${r}`); }
      for (const d of s.rubric.dimensions) {
        const dd = it.dims[d];
        L.push(`  - ${d}: mean ${fmt(dd.mean)} · range ${dd.range}${dd.highVariance ? " ⚠️ high-variance" : ""} · votes [${dd.values.join(", ")}]`);
      }
      if (it.itemMean != null) L.push(`  - **item mean: ${fmt(it.itemMean)}**`);
      if (it.notes.length) for (const n of it.notes) L.push(`  - note (${n.reviewerId}): ${n.note}`);
    }
    L.push("");
  }

  if (skipped.length) { L.push(`## ⚠️ Skipped submissions (${skipped.length})`, ""); for (const sk of skipped) L.push(`- ${sk.reason}${sk.file ? ` — ${sk.file}` : ""}`); L.push(""); }

  L.push(`---`, `_Human-hook suites ${HUMAN_SUITE_IDS.join(",")} · aggregated from ${reviewerIds.length} reviewer file(s) · ≥${MIN_REVIEWERS}/item required, else PENDING-HUMAN._`);
  L.push(`_Nothing in lib/ai/* runtime was touched — this reads human scores and re-runs the existing MIZAN gate. Authenticity is NEVER machine-scored._`);

  const outDir = join(here, "..", "..", "reports");
  await mkdir(outDir, { recursive: true });
  const outName = isSample ? `mizan-panel-SAMPLE.md` : `mizan-panel-${date}.md`;
  await writeFile(join(outDir, outName), L.join("\n") + "\n", "utf8");
  console.log(`MIZAN panel report → reports/${outName} (${reviewerIds.length} reviewers, dialect gate: ${gateRows[0]?.label})`);
}

main().catch((e) => { console.error("MIZAN aggregate fatal:", e?.message || e); process.exit(2); });
