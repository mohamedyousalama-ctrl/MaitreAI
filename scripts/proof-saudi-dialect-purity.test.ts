// ============================================================================
// WO-KHALID-DIALECT — the SAUDI branch of every dialect conditional must be Saudi.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-saudi-dialect-purity.test.ts
//
// WHY THIS EXISTS
// ---------------
// The codebase already owns a dialect linter — lib/ai/personas/khalid-dialect-linter.mjs,
// with curated Egyptian / Levantine / Iraqi banlists and proper Arabic word-boundary
// logic. It was pointed at Khalid's OUTPUT (as observability) and never at his SOURCE.
//
// So nothing checked whether the strings we ship AS SAUDI are actually Saudi. They were
// not: `recoveryReply`'s Saudi branch said «إذا لسا ما وصلك» — «لسا» is Levantine and is
// on this project's own LEVANTINE banlist. It shipped to Saudi customers.
//
// This walks every `dialect === "egyptian" ? X : Y` conditional in the agent surface and
// runs the linter over Y. The Egyptian branch is deliberately NOT checked — Egyptian
// markers are correct there.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findLeakage } from "../lib/ai/personas/khalid-dialect-linter.mjs";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};

// Files carrying customer-facing dialect conditionals.
const FILES = [
  "lib/ai/allergen-companion-flow.ts",
  "lib/ai/turn-contract.ts",
  "lib/ai/customer-turn.ts",
  "lib/ai/allergy-simple.ts",
  "lib/ai/allergy-calm-hold.ts",
];

/**
 * Extract the NON-Egyptian side of every dialect ternary.
 *
 * Both shapes occur in this codebase:
 *   dialect === "egyptian" ? "<eg>" : "<sa>"      → the Saudi string follows the colon
 *   eg ? "<eg>" : "<sa>"                           → same, abbreviated
 * Only string literals are considered; a ternary over identifiers is skipped rather
 * than guessed at.
 */
function saudiBranches(path: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const src = readFileSync(resolve(ROOT, path), "utf8");
  const lines = src.split("\n");
  const joined = lines.map((l, i) => ({ l, i }));
  for (const { l, i } of joined) {
    const t = l.trimStart();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
    // ternary fully on one line
    const inline = l.match(/(?:dialect === "egyptian"|(?:^|[^A-Za-z])eg)\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/);
    if (inline) { out.push({ line: i + 1, text: inline[2] }); continue; }
    // multi-line: a lone `: "…"` continuation directly after a `? "…"`
    const cont = l.match(/^\s*:\s*"([^"]+)"/);
    if (cont) {
      const prev = lines[i - 1] ?? "";
      if (/\?\s*"/.test(prev) || /"\s*$/.test(prev)) out.push({ line: i + 1, text: cont[1] });
    }
  }
  return out;
}

let checked = 0;
const offenders: string[] = [];
for (const f of FILES) {
  for (const { line, text } of saudiBranches(f)) {
    checked++;
    const leak = findLeakage(text);
    if (!leak.ok) {
      offenders.push(`${f}:${line} [${leak.hits.map((h) => `${h.marker}(${h.category})`).join(", ")}] ${text.slice(0, 70)}`);
    }
  }
}

ok(`the extractor actually found Saudi branches to check (found ${checked})`, checked >= 12);
ok("no SAUDI branch contains an Egyptian / Levantine / Iraqi marker", offenders.length === 0);
for (const o of offenders) console.log(`      ${o}`);

// Pin the specific regression: «لسا» is Levantine and shipped in a Saudi branch.
const flow = readFileSync(resolve(ROOT, "lib/ai/allergen-companion-flow.ts"), "utf8");
ok("recoveryReply's Saudi branch no longer uses the Levantine «لسا»", !/إذا لسا ما وصلك/.test(flow));
ok("it uses the Najdi «لين الحين» instead", /إذا لين الحين ما وصلك/.test(flow));
// The Egyptian branch must be untouched — this test must never "fix" Karim into Saudi.
ok("the Egyptian branch keeps its own «لسه»", /لو لسه ما وصلكش/.test(flow));

// The linter itself must still be the real thing, not a stub that always passes.
ok("the linter still detects a known Egyptian marker", !findLeakage("انا عايز اطلب").ok);
ok("the linter still detects a known Levantine marker", !findLeakage("بدي اطلب هلق").ok);
ok("the linter passes clean Najdi", findLeakage("هلا والله، وش تحب تطلب اليوم؟").ok);

console.log(`\nSAUDI DIALECT PURITY PROOF: ${pass} passed, ${fail} failed  (${checked} Saudi branches scanned)`);
process.exit(fail === 0 ? 0 : 1);
