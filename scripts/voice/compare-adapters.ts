// ============================================================================
// MaitreAI — WO-VOICE-DEEPGRAM-SPIKE: side-by-side STT adapter comparison harness.
// Runs the SAME audio through every adapter that has a key, reduces each transcript to
// CANONICAL SLOTS (item / quantity / negation) and reports per-slot AGREEMENT — never a
// character diff. Adapter-agnostic: add an adapter to ADAPTERS and it joins the table.
//
// Usage:
//   # live A/B over the archived golden clips (needs the provider keys + local audio):
//   GROQ_API_KEY=… DEEPGRAM_API_KEY=… VOICE_MENU_JSON='["ستربس دجاج","بروست",…]' \
//   node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//     scripts/voice/compare-adapters.ts clip1.ogg clip2.ogg …
//
//   # logic demo (no keys, no audio) — shows the slot comparison over sample transcripts:
//   node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//     scripts/voice/compare-adapters.ts
//
// The golden clips live in the private `voice-golden-set` bucket (see the archival
// route); download them locally or via a signed URL to feed the live path.
// ============================================================================

import { readFileSync } from "node:fs";
import { mockSttAdapter } from "../../lib/ai/stt/mock";
import { groqSttAdapter } from "../../lib/ai/stt/groq";
import { deepgramSttAdapter } from "../../lib/ai/stt/deepgram";
import { buildSttPromptVocab } from "../../lib/ai/voice-quality";
import { buildDeepgramKeyterms } from "../../lib/ai/stt/deepgram-keyterms";
import { buildSlotComparison, type AdapterTranscript } from "../../lib/ai/stt/slots";

const MENU: string[] = (() => {
  try { return JSON.parse(process.env.VOICE_MENU_JSON || "[]"); } catch { return []; }
})();
const DEFAULT_MENU = ["ستربس دجاج", "بروست", "بطاطس", "كومبو كبير", "شير بوكس", "شاورما"];
const menu = MENU.length ? MENU : DEFAULT_MENU;

// Every adapter available; each is skipped when its key is absent (key gates live only).
const ADAPTERS = [
  { name: "groq", adapter: groqSttAdapter, keyed: () => !!process.env.GROQ_API_KEY },
  { name: "deepgram", adapter: deepgramSttAdapter, keyed: () => !!process.env.DEEPGRAM_API_KEY },
  { name: "mock", adapter: mockSttAdapter, keyed: () => true },
];

function fmtSlots(s: { items: string[]; quantity: number | null; negation: boolean }): string {
  return `items=[${s.items.join("، ")}] qty=${s.quantity ?? "∅"} neg=${s.negation}`;
}

async function compareOne(label: string, audio: Buffer): Promise<void> {
  const prompt = buildSttPromptVocab(menu, 200);
  const keyterms = buildDeepgramKeyterms(menu);
  const outputs: AdapterTranscript[] = [];
  for (const a of ADAPTERS) {
    if (!a.keyed()) continue;
    try {
      const r = await a.adapter.transcribe(audio, { mimeType: "audio/ogg", languageHint: "ar", prompt, keyterms });
      outputs.push({ adapter: a.name, transcript: r.text });
    } catch (e) {
      console.log(`  [${a.name}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (outputs.length === 0) { console.log(`  (no adapters ran)`); return; }
  const { rows, agreement } = buildSlotComparison(outputs, menu);
  console.log(`\n▸ ${label}`);
  for (const row of rows) console.log(`  ${row.adapter.padEnd(9)} «${row.transcript}»\n    ${fmtSlots(row.slots)}`);
  console.log(`  SLOT AGREEMENT: items=${agreement.items} quantity=${agreement.quantity} negation=${agreement.negation} → ${agreement.all ? "MATCH" : "DIVERGE"}`);
}

async function main(): Promise<void> {
  const audioPaths = process.argv.slice(2);
  console.log(`STT adapter comparison — menu(${menu.length}), keyterms(${buildDeepgramKeyterms(menu).length}), adapters: ${ADAPTERS.filter((a) => a.keyed()).map((a) => a.name).join(", ")}`);

  if (audioPaths.length === 0) {
    // Logic demo: prove the slot comparison over sample transcripts (no keys/audio).
    console.log("\n(no audio paths — running the slot-comparison logic demo)");
    const demo: AdapterTranscript[] = [
      { adapter: "groq", transcript: "عايز ستربس دجاج اتنين" },
      { adapter: "deepgram", transcript: "أبغى ستربس دجاج إثنين" }, // same order, different spelling
    ];
    const { rows, agreement } = buildSlotComparison(demo, menu);
    for (const row of rows) console.log(`  ${row.adapter.padEnd(9)} «${row.transcript}»\n    ${fmtSlots(row.slots)}`);
    console.log(`  SLOT AGREEMENT: items=${agreement.items} quantity=${agreement.quantity} negation=${agreement.negation} → ${agreement.all ? "MATCH (spelling differs, MEANING agrees)" : "DIVERGE"}`);
    return;
  }

  for (const p of audioPaths) {
    try { await compareOne(p, readFileSync(p)); }
    catch (e) { console.log(`\n▸ ${p} — read error: ${e instanceof Error ? e.message : String(e)}`); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
