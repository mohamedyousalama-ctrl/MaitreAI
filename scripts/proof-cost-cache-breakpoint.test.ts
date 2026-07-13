// ============================================================================
// WO-COST-1 (1/2) — red-first proof: the system-prompt cache breakpoint.
// The STATIC block is byte-identical no matter which per-turn directives fire, so a
// firing directive no longer forces a full cache write. The re-layering is content-
// preserving: static + tail === the old inline concatenation, byte-for-byte.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-cost-cache-breakpoint.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSystemBlocks, composeSystemTail } from "../lib/ai/llm/system-blocks.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

const STATIC = "PERSONA + RULEBOOK + MENU (byte-stable per tenant+menu-version)";

// --- THE breakpoint guarantee: static block identical across DIFFERENT directives ---
const withPerception = buildSystemBlocks(STATIC, composeSystemTail(["PERCEPTION"]));
const withGeoImage = buildSystemBlocks(STATIC, composeSystemTail([null, null, "GEO", "IMAGE"]));
const noDirectives = buildSystemBlocks(STATIC, composeSystemTail([null, null, null, null, null, null]));

check("static block (index 0) is BYTE-IDENTICAL across different firing directives",
  withPerception[0].text === withGeoImage[0].text && withGeoImage[0].text === noDirectives[0].text && withPerception[0].text === STATIC);
check("the cache_control breakpoint sits on the STATIC block only",
  withPerception[0].cache_control?.type === "ephemeral" && (withPerception[1] ? withPerception[1].cache_control === undefined : true));
check("a firing directive adds an UNCACHED tail block after the breakpoint",
  withPerception.length === 2 && withGeoImage.length === 2);

// --- no directive → the single cached block, byte-identical to the old shape ---------
check("no directive → a single block (byte-identical to the pre-change single-block send)", noDirectives.length === 1);
check("no directive block carries cache_control and IS the static prompt", noDirectives[0].text === STATIC && noDirectives[0].cache_control?.type === "ephemeral");

// --- CONTENT identity: the model receives byte-identical instructions ----------------
// Old inline formula (respond.ts before the fix): static + (p?\n\np:"") + (c?...) + …
const p = "PERCEPTION", c = "CADENCE", g = "GEO", im = "IMG", md = "MEDIA", af = "ANSWER1";
const oldInline =
  STATIC + (p ? `\n\n${p}` : "") + (c ? `\n\n${c}` : "") + (g ? `\n\n${g}` : "") +
  (im ? `\n\n${im}` : "") + (md ? `\n\n${md}` : "") + (af ? `\n\n${af}` : "");
const tail = composeSystemTail([p, c, g, im, md, af]);
check("re-layering is content-preserving: static + tail === the old inline concatenation", STATIC + tail === oldInline);
const blocks = buildSystemBlocks(STATIC, tail);
check("the two blocks concatenate to the identical instructions the model used to get",
  blocks[0].text + (blocks[1]?.text ?? "") === oldInline);

// --- composeSystemTail: only present directives, each on a blank line -----------------
check("composeSystemTail drops absent directives, keeps order", composeSystemTail([null, "A", undefined, "B"]) === "\n\nA\n\nB");
check("composeSystemTail is empty when nothing fires", composeSystemTail([null, undefined, ""]) === "");

// --- wiring (source): respond splits, claude sends two blocks -------------------------
const respond = read("lib/ai/respond.ts");
check("(respond) passes the STATIC block + an uncached systemTail", /system: systemStatic, systemTail: systemTail \|\| undefined/.test(respond));
check("(respond) static block is buildCustomerAgentSystemPrompt (byte-stable, no directives)", /const systemStatic = buildCustomerAgentSystemPrompt\(input\.brain\)/.test(respond));
const claude = read("lib/ai/llm/claude.ts");
check("(claude) sends system via buildSystemBlocks (breakpoint on static, tail after)", /system: buildSystemBlocks\(req\.system, req\.systemTail\)/.test(claude));

console.log(`\nCOST-CACHE-BREAKPOINT PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
