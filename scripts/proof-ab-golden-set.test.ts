// ============================================================================
// WO-VOICE-DEEPGRAM-SPIKE (live A/B) — RED-FIRST: imports buildAbEntry / summarizeAb
// (absent on the pre-WO tree → ESM link fails → red). Proves the per-clip A/B verdict
// (groq vs deepgram, slot-level not char-level) + the aggregate, and the route wiring:
// token-authed, reads the manifest, runs BOTH adapters, writes ab-report.json.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-ab-golden-set.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildAbEntry, summarizeAb } from "../lib/voice/ab-report.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

const MENU = ["ستربس دجاج", "بروست", "بطاطس", "شاورما"];

// ══ LEG 1 — per-clip A/B entry: slot-level agreement, not characters ═════════
{
  // Same order, different spelling → the two adapters AGREE on slots.
  const agree = buildAbEntry({
    goldenId: "b68666f5", conversationId: "c016a121", objectKey: "b68666f5.ogg", menuItemNames: MENU,
    groq: { text: "عايز ستربس دجاج اتنين", costUsd: 0.0002, confidence: 0.67, durationSec: 3 },
    deepgram: { text: "أبغى ستربس دجاج إثنين", costUsd: 0.0004, confidence: 0.9, durationSec: 3 },
  });
  ok("LEG1: same meaning / different spelling → full slot agreement",
    agree.agreement.all === true && agree.groq.slots.quantity === 2 && agree.deepgram.slots.quantity === 2);
  ok("LEG1: costs + confidence carried per adapter",
    agree.groq.costUsd === 0.0002 && agree.deepgram.costUsd === 0.0004 && agree.deepgram.confidence === 0.9);
  // A genuine quantity difference → the quantity slot DISAGREES.
  const disagree = buildAbEntry({
    goldenId: "1224f0c0", conversationId: "c016a121", objectKey: "1224f0c0.ogg", menuItemNames: MENU,
    groq: { text: "عايز بروست اتنين" },
    deepgram: { text: "عايز بروست تلاتة" },
  });
  ok("LEG1: a real quantity divergence is caught (items agree, quantity does not)",
    disagree.agreement.items === true && disagree.agreement.quantity === false && disagree.agreement.all === false);
}

// ══ LEG 2 — aggregate summary: agreement counts + per-adapter cost ═══════════
{
  const entries = [
    buildAbEntry({ goldenId: "a", conversationId: "c", objectKey: "a.ogg", menuItemNames: MENU,
      groq: { text: "عايز بروست اتنين", costUsd: 0.0002 }, deepgram: { text: "أبغى بروست إثنين", costUsd: 0.0004 } }),
    buildAbEntry({ goldenId: "b", conversationId: "c", objectKey: "b.ogg", menuItemNames: MENU,
      groq: { text: "عايز بروست اتنين", costUsd: 0.0002 }, deepgram: { text: "عايز بروست تلاتة", costUsd: 0.0004 } }),
  ];
  const s = summarizeAb(entries);
  ok("LEG2: clip + agreement counts", s.clips === 2 && s.fullAgree === 1 && s.disagree === 1 && s.quantityAgree === 1);
  ok("LEG2: per-adapter cost totals", s.groqCostUsd === 0.0004 && s.deepgramCostUsd === 0.0008);
}

// ══ LEG 3 — route WIRING: token-authed, manifest, both adapters, report ══════
{
  const r = read("app/api/admin/voice/ab-golden-set/route.ts");
  ok("WIRE: closed by default (CRON_SECRET) + 401", /const secret = process\.env\.CRON_SECRET;/.test(r) && /"unauthorized" \}, \{ status: 401 \}/.test(r));
  ok("WIRE: reads the archived manifest, filters golden", /download\("manifest\.json"\)/.test(r) && /\.filter\(\(e\) => e\.golden\)/.test(r));
  ok("WIRE: runs BOTH adapters on the same clip",
    /groqSttAdapter\.transcribe\(bytes/.test(r) && /deepgramSttAdapter\.transcribe\(bytes/.test(r));
  ok("WIRE: deepgram gets menu keyterms; groq gets the prompt bias",
    /buildDeepgramKeyterms\(menu\)/.test(r) && /buildSttPromptVocab\(menu/.test(r));
  ok("WIRE: writes ab-report.json", /\.upload\("ab-report\.json"/.test(r));
}

console.log(`\nWO-VOICE-AB PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
