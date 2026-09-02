// ============================================================================
// PROOF — the phonetic near-miss net reaches no live path.
//
// Run: node --experimental-strip-types scripts/proof-phonetic-net-unwired.test.ts
//
// THE RULING. `detectPhoneticSafetyNet` fires on words that merely SOUND like an allergen —
// «كنافة بالجبن»→لبن, «موز»→لوز, «رز أبيض»→بيض — and each trip is a full safety hold. On the
// live demo it turned «هلا والله», a plain greeting, into an allergy consultation. The
// Founder ruled it out of every live path.
//
// WHY A PROOF AND NOT A DELETION. The module is sound and a future ruling may want it back,
// and stored `agent_runs` rows still name `phonetic_safety_net` as a hold source, so the
// name has to stay findable. That leaves the obvious hazard: a working, well-documented
// detector sitting in the tree, one import away from being re-wired by someone who reads its
// doctrine and not the ruling. This is what makes re-enabling it a deliberate act.
//
// The EXACT detectors are untouched and are asserted to still be wired, because "we removed
// the guessing" and "we removed the safety gate" are very different changes and only one of
// them was authorized.
// ============================================================================

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveVoiceCandidates } from "../lib/ai/voice-aliases";
import { exactSafetyToken } from "../lib/ai/allergen-context";
import { stripAffix } from "../lib/ai/phonetic-safety-net";
import { normalizeAr } from "../lib/ai/allergen-gate";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

/**
 * Strip comments from source, keeping string and template literals intact.
 *
 * A CHARACTER SCANNER, NOT A LINE FILTER, and that is not over-engineering. The first
 * version dropped lines whose FIRST non-space characters were `//`, which is a different
 * question. A driven mutation deleted a live detector call and parked the name in a TRAILING
 * comment on the same line:
 *
 *     false || // detectAllergyContext(text).fired
 *
 * The line does not start with `//`, so it survived the filter; the name is right there, so
 * the "still wired" assertion passed on a file that no longer ran the detector. The scan has
 * to see what the COMPILER sees.
 *
 * Strings are preserved because a stored row's source label — `"phonetic_safety_net"` — is a
 * string literal, and because `"https://…"` must not be read as the start of a comment.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++; }
      i += 2;
      continue;
    }
    // A REGEX LITERAL, WHICH THE FIRST VERSION DID NOT KNOW ABOUT.
    //
    // Without this, `/['"]/` puts the scanner into string mode at the quote inside the
    // character class and it stops stripping comments from that point on — every comment
    // after it survives and can satisfy a "still CALLS" assertion. `/https?:\/\//` was
    // truncated at the escaped slashes for the same reason. Not exploitable in the five
    // files scanned today, which is exactly the kind of "not yet" this repo has been bitten
    // by before.
    //
    // Telling a regex from a division needs the previous token: a `/` after a value (an
    // identifier, a number, a closing bracket) is division; anywhere else it opens a literal.
    if (c === "/") {
      const prev = out.replace(/\s+$/, "").slice(-1);
      const isDivision = prev !== "" && /[A-Za-z0-9_$)\]]/.test(prev);
      if (!isDivision) {
        out += c; i++;
        let inClass = false;
        while (i < n) {
          const ch = src[i]!;
          if (ch === "\\") { out += ch + (src[i + 1] ?? ""); i += 2; continue; }
          if (ch === "\n") break; // an unterminated literal: stop rather than eat the file
          out += ch;
          i++;
          if (ch === "[") inClass = true;
          else if (ch === "]") inClass = false;
          else if (ch === "/" && !inClass) break;
        }
        continue;
      }
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c; i++;
      while (i < n) {
        if (src[i] === "\\") { out += src[i]! + (src[i + 1] ?? ""); i += 2; continue; }
        out += src[i]!;
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

const ROOT = process.cwd();
const OWNER = "lib/ai/phonetic-safety-net.ts";

// Every source file in the product, walked — not a hand-listed set, because the whole point
// is to cover the file that does not exist yet.
const sources: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", ".claude", "scripts"].includes(e.name)) continue;
    const child = dir === "." ? e.name : `${dir}/${e.name}`;
    if (e.isDirectory()) walk(child);
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(e.name)) sources.push(child);
  }
};
for (const d of ["app", "lib", "components"]) if (existsSync(resolve(ROOT, d))) walk(d);

console.log("\n── THE SCAN IS REAL ────────────────────────────────────────────");
ok(`the walk found the product's sources (${sources.length})`, sources.length >= 100);
ok("…including the module itself", sources.includes(OWNER));

console.log("\n── AND NOTHING CALLS IT ────────────────────────────────────────");
{
  // THE IMPORT, NOT THE CALL SITE — AND THAT IS THE WHOLE FIX.
  //
  // The first version of this scan hunted for the string `detectPhoneticSafetyNet` followed
  // by `(`, `,` or `}`. An audit walked straight through it with one line:
  //
  //     import { detectPhoneticSafetyNet as phoneticCheck } from "@/lib/ai/phonetic-safety-net";
  //
  // The name is followed by ` as`, so the import missed the pattern; every call site then
  // reads `phoneticCheck(text)`, which contains the banned name nowhere at all. A guard that
  // any rename defeats is decoration.
  //
  // So the question asked here is not "does this file mention the function" but "what does
  // this file IMPORT from that module". A function you never bind, you cannot call — under
  // any alias, in any file, however it is spelled afterwards.
  //
  // TWO NAMES ARE BANNED, NOT ONE. `nearestSafetyTerm` is the same Levenshtein guessing with
  // a different return type, and it was live in `lib/ai/voice-aliases.ts` for the whole first
  // round of this ruling: the voice matcher asked it whether a token was "near" a safety
  // word and DELETED the ones that were, so «موز» (banana, one edit from «لوز»), «جبن»
  // (cheese, one from «لبن»), «أبيض» (white, one from «بيض») and «الحساب» (the bill, one from
  // «حساس») were dropped from every voice turn — a candidate the caller never got, a hold
  // nobody raised, and after the ruling, no detector behind it either.
  const OWNER_SPECIFIERS = [
    "@/lib/ai/phonetic-safety-net", "./phonetic-safety-net", "../phonetic-safety-net",
    "../ai/phonetic-safety-net", "@/lib/ai/phonetic-safety-net.ts",
  ];
  /** The pure string helpers, which have nothing to do with firing a hold. Anything not on
   *  this list — a firing function, or one added to that module later — is refused at the
   *  import, so no future name has to be added to a ban list to be caught. */
  const HELPERS_OK = new Set(["levenshtein", "stripAffix", "phoneticFold"]);

  const codeOf = (f: string) => stripComments(readFileSync(resolve(ROOT, f), "utf8"));

  /** Every binding a file takes from the module, or `["*"]` for a namespace import — which
   *  is banned outright, because it grants every export including the ones that fire. */
  function bindingsFrom(code: string): string[] {
    const out: string[] = [];
    for (const spec of OWNER_SPECIFIERS) {
      const q = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // import { a, b as c } from "…"  /  export { a } from "…"  /  import * as n from "…"
      const named = new RegExp(`(?:import|export)\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*["'\`]${q}["'\`]`, "g");
      for (const m of code.matchAll(named)) {
        for (const part of m[1]!.split(",")) {
          const name = part.trim().split(/\s+as\s+/)[0]!.trim().replace(/^type\s+/, "");
          if (name) out.push(name);
        }
      }
      const star = new RegExp(`(?:import|export)\\s*\\*\\s*(?:as\\s+\\w+\\s*)?from\\s*["'\`]${q}["'\`]`);
      if (star.test(code)) out.push("*");
      // default import, and require()/dynamic import() — each grants the whole module
      const whole = new RegExp(`(?:import\\s+\\w+\\s*(?:,\\s*\\{[^}]*\\}\\s*)?from|require\\s*\\(|import\\s*\\()\\s*["'\`]?${q}["'\`]`);
      if (whole.test(code)) out.push("*");
    }
    return out;
  }

  const offenders: string[] = [];
  for (const f of sources) {
    if (f === OWNER) continue;
    const code = codeOf(f);
    const bound = bindingsFrom(code);
    const bad = bound.filter((b) => !HELPERS_OK.has(b));
    if (bad.length) offenders.push(`${f} → ${bad.join(", ")}`);
  }
  ok(`no live file binds anything but the string helpers${offenders.length ? ` — ${offenders.join("; ")}` : ""}`,
    offenders.length === 0);

  // AND NOBODY REACHES THE MODULE BY A SHAPE THIS SCAN CANNOT READ. A path assembled at
  // runtime, or an import form nobody anticipated, would leave the scan green and vacuous —
  // so a mention of the module in real code that produced NO recognised binding is itself
  // the failure, and it names the file.
  const unreadable = sources.filter((f) => {
    if (f === OWNER) return false;
    const code = codeOf(f);
    if (!code.includes("phonetic-safety-net")) return false;
    return bindingsFrom(code).length === 0;
  });
  ok(`every reference to the module parses into bindings${unreadable.length ? ` — ${unreadable.join(", ")}` : ""}`,
    unreadable.length === 0);

  // POSITIVE CONTROLS. Without these a typo in the regexes leaves both assertions green and
  // meaningless — the failure mode this repo has already paid for several times over. Each
  // of these is a real way someone could re-wire the net; each must be caught.
  const CAUGHT: Array<[string, string]> = [
    ["a plain named import", 'import { detectPhoneticSafetyNet } from "@/lib/ai/phonetic-safety-net";'],
    ["an ALIASED import — the one that defeated the old scan",
      'import { detectPhoneticSafetyNet as phoneticCheck } from "@/lib/ai/phonetic-safety-net";'],
    ["an alias hidden among allowed helpers",
      'import { levenshtein, detectPhoneticSafetyNet as f } from "./phonetic-safety-net";'],
    ["the near-matcher, which is the same guessing",
      'import { nearestSafetyTerm } from "./phonetic-safety-net";'],
    ["an aliased near-matcher",
      'import { stripAffix, nearestSafetyTerm as nearMiss } from "../phonetic-safety-net";'],
    ["a namespace import, which grants everything",
      'import * as net from "@/lib/ai/phonetic-safety-net";'],
    ["a re-export, which hands the function to a third file",
      'export { detectPhoneticSafetyNet } from "./phonetic-safety-net";'],
    ["a require()", 'const net = require("./phonetic-safety-net");'],
    ["a dynamic import()", 'const net = await import("@/lib/ai/phonetic-safety-net");'],
    ["an export not yet written, refused by default",
      'import { someFutureDetector } from "./phonetic-safety-net";'],
  ];
  for (const [label, line] of CAUGHT) {
    const bound = bindingsFrom(line);
    ok(`caught: ${label}`, bound.length > 0 && bound.some((b) => !HELPERS_OK.has(b)));
  }
  // …and the imports that are allowed to stay are NOT flagged, or the guard goes red on the
  // repo's own working code and the next person deletes it.
  for (const [label, line] of [
    ["the helper import the voice matcher actually uses",
      'import { levenshtein, stripAffix } from "./phonetic-safety-net";'],
    ["prose explaining the removal",
      "// The phonetic near-miss net was the third term here. Removed by Founder ruling."],
    ["a stored row's source label",
      '  source: "allergen_gate" | "phonetic_safety_net" | "memory_allergy_gate",'],
  ] as Array<[string, string]>) {
    const bound = bindingsFrom(line);
    ok(`allowed: ${label}`, !bound.some((b) => !HELPERS_OK.has(b)));
  }
}

console.log("\n── THE VOICE MATCHER SUPPRESSES EXACTLY, NOT NEARLY ────────────");
{
  // The one live caller the ruling missed, driven end to end. Each word below is an ordinary
  // thing a caller says; each was one edit from a safety word; each was silently deleted.
  // ONE ITEM PER CASE, AND THE ASSERTION IS ON THE TOKEN. Asserting only that «عصير موز»
  // comes back is too weak in two ways: the OTHER word in the name matches on its own, and
  // the resolver de-duplicates by item — so the first token to reach an item claims it and
  // the suppressed word is never asked. A driven mutation put the near-matcher back and that
  // weaker assertion stayed green. What has to be true is that the SUPPRESSED WORD ITSELF
  // sources the candidate, so each case gives it a menu where it is the only way in.
  const sourcedBy = (t: string, menu: string[], tok: string) =>
    resolveVoiceCandidates(t, { menuItemNames: menu }).some((c) => c.token === normalizeAr(tok));

  ok("«موز» (banana, one edit from «لوز») orders the banana juice",
    sourcedBy("ابغى موز", ["عصير موز"], "موز"));
  ok("«جبن» (cheese, one edit from «لبن») orders the cheese pie",
    sourcedBy("ابغى جبن", ["فطيرة جبن"], "جبن"));
  ok("«الأبيض» (the white one, one edit from «بيض») orders the white rice",
    sourcedBy("ابغى الأبيض", ["رز أبيض"], "الأبيض"));

  ok("«الحساب» is not deleted from the turn", exactSafetyToken("الحساب") === null);

  // THE LAW ITSELF IS INTACT. An EXACT safety word is still never a menu candidate, with or
  // without the article and conjunctions Arabic glues onto the front of it.
  for (const tok of ["لوز", "مكسرات", "والمكسرات", "بالفستق", "حساسيتي", "ينتفخ"]) {
    ok(`«${tok}» is still refused as a menu candidate`, exactSafetyToken(tok) !== null);
  }
  for (const tok of ["موز", "جبن", "ابيض", "الحساب", "اطباق", "البيت", "ولو", "هلا"]) {
    ok(`«${tok}» is an ordinary word and is kept`, exactSafetyToken(tok) === null);
  }

  // NO DRIFT BETWEEN THE TWO AFFIX STRIPPERS. `allergen-context.ts` carries its own four-line
  // copy of the affix stripper rather than importing from the retired module — deliberately,
  // since an import from there is exactly how the near-matcher got back into a live path. A
  // copy can drift silently, so the CONTRACT is asserted instead of the function: whatever
  // `stripAffix` reduces to a safety term, `exactSafetyToken` must also refuse.
  const TERMS = ["لوز", "مكسرات", "بندق", "فستق", "لبن", "حليب", "بيض", "قمح", "سمك", "صويا",
    "جلوتين", "سمسم", "طحينه", "جمبري", "حساسيتي", "تحسس", "ينتفخ", "تورم", "طفح"];
  for (const term of TERMS) {
    const t = normalizeAr(term);
    for (const prefix of ["", "و", "ف", "ب", "ك", "ل", "ال", "وال", "بال", "كال", "فال"]) {
      const glued = prefix + t;
      if (stripAffix(glued) !== t) continue; // the original would not reduce it either
      ok(`«${glued}» reduces to «${t}» and is refused`, exactSafetyToken(glued)?.term === t);
    }
  }
}

console.log("\n── THE EXACT DETECTORS ARE STILL WIRED ─────────────────────────");
{
  // "We removed the guessing" and "we removed the safety gate" are different changes, and
  // only one was authorized. A customer who says «عندي حساسية من المكسرات» in plain words
  // must still be heard — on the live WhatsApp path and on both demo routes.
  const mustStillDetect: Array<[string, string[]]> = [
    ["lib/messaging/respond-and-send.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergyContext", "detectAllergenEmergency"]],
    ["lib/ai/customer-turn.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergyContext", "detectAllergenEmergency"]],
    ["app/api/demo/voice/route.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergyContext", "detectAllergenEmergency"]],
    ["app/api/demo/turn/route.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergyContext", "detectAllergenEmergency"]],
    ["lib/ai/safety-bridge.ts", ["detectAllergenAvoidance", "detectAllergenSymptom", "detectAllergyContext", "detectAllergenEmergency"]],
  ];
  // A CALL, NOT A MENTION. This asked `src.includes(d)` — satisfied by the comment three
  // files now carry explaining which detectors replaced the net. Deleting every call and
  // leaving the prose behind would have kept this green, which is the same class of defect as
  // the aliased import above: the assertion checked for a NAME, and a name protects nothing.
  // Comments are stripped first, and the detector must be INVOKED.
  for (const [file, detectors] of mustStillDetect) {
    const src = existsSync(resolve(ROOT, file)) ? readFileSync(resolve(ROOT, file), "utf8") : "";
    ok(`${file} exists`, src.length > 0);
    const code = stripComments(src);
    for (const d of detectors) {
      ok(`  …still CALLS ${d}`, new RegExp(`\\b${d}\\s*\\(`).test(code));
    }
  }
  // POSITIVE CONTROL on that regex, or the strictness above is only a claim.
  const calls = (src: string, d: string) => new RegExp(`\\b${d}\\s*\\(`).test(stripComments(src));
  ok("a whole-line comment is not a call",
    !calls("// we used to run detectAllergenAvoidance(text) here", "detectAllergenAvoidance"));
  ok("a TRAILING comment is not a call either — the mutation that survived",
    !calls("    false || // detectAllergyContext(text).fired", "detectAllergyContext"));
  ok("a block comment is not a call",
    !calls("/* detectAllergenSymptom(text) was here */ const x = 1;", "detectAllergenSymptom"));
  ok("…and a real call still is", calls("const h = detectAllergenAvoidance(text);", "detectAllergenAvoidance"));
  const URLLINE = 'const u = "https://example.com/x"; // gone';
  ok("a string literal survives the stripper", stripComments(URLLINE).includes("https://example.com/x"));
  ok("…and the comment after it does not", !stripComments(URLLINE).includes("gone"));
  // THE REGEX LITERAL CASE, which defeated the scanner outright until it learned about them.
  // A quote inside a character class put it into string mode and every comment after that
  // point survived — so a deleted detector call parked in any later comment would have
  // satisfied the "still CALLS" assertions above.
  const AFTER_REGEX = "const RE = /['\"]/;\nconst h = 1; // detectAllergyContext(text).fired";
  ok("a quote inside a regex character class does not swallow the rest of the file",
    !calls(AFTER_REGEX, "detectAllergyContext"));
  ok("…and the regex itself survives", stripComments(AFTER_REGEX).includes("/['\"]/"));
  const ESCAPED = "const U = /https?:\\/\\//; // gone";
  ok("escaped slashes inside a regex are not read as a comment",
    stripComments(ESCAPED).includes("https?:") && !stripComments(ESCAPED).includes("gone"));
  ok("division is still division, not a regex",
    stripComments("const r = a / b; // gone").includes("a / b") &&
    !stripComments("const r = a / b; // gone").includes("gone"));
  ok("an apostrophe inside a comment does not swallow the file",
    stripComments("// don't\nconst kept = 1;").includes("kept"));
  // AND THE LEXICON IS UNTOUCHED. Narrowing the word list would be a different, unauthorized
  // way to reach the same "fewer holds" outcome, and it would be invisible.
  const gate = readFileSync(resolve(ROOT, "lib/ai/allergen-gate.ts"), "utf8");
  for (const term of ["لبن", "حليب", "مكسرات", "بيض", "قمح", "سمك", "صويا", "جلوتين"]) {
    ok(`the allergen lexicon still contains «${term}»`, gate.includes(term));
  }
}


console.log("\n── THE PER-MODE REASON REACHES A TABLE SOMEONE CAN QUERY ───────");
{
  // THE FILE PROMISES A WATCHABLE FALSE-POSITIVE RATE PER MODE. That promise is only worth
  // something if the mode reaches storage, and it crosses three files to get there — a
  // review followed one of them, found nothing, and reported the metric as dropped. It is
  // not dropped, and this pins each link so it cannot become dropped quietly.
  const ctx = readFileSync(resolve(ROOT, "lib/ai/allergen-context.ts"), "utf8");
  ok("the detector returns a distinct reason per mode",
    /reason: "allergy_marker" \| "symptom" \| "allergy_context" \| null/.test(ctx));
  for (const mode of ["allergy_marker", "symptom", "allergy_context"] as const) {
    ok(`  …and «${mode}» is one it can actually return`,
      new RegExp(`reason: "${mode}"`).test(ctx));
  }

  const turn = stripComments(readFileSync(resolve(ROOT, "lib/ai/customer-turn.ts"), "utf8"));
  ok("the turn passes it into the signal as netReason",
    /holdSource === "allergy_context" \? phoneticHit\.reason : null/.test(turn));

  const gate = stripComments(readFileSync(resolve(ROOT, "lib/ai/customer-turn.ts"), "utf8"));
  ok("…and the signal carries it in its detail",
    /netReason \? \{ netReason \} : \{\}/.test(gate));

  const typed = stripComments(readFileSync(resolve(ROOT, "lib/messaging/typed-actions.ts"), "utf8"));
  ok("…and every signal's detail is inserted verbatim into conversation_signals",
    /from\("conversation_signals"\)\.insert\(/.test(typed) && /detail: s\.detail,/.test(typed));
  // …and NOT on the demo, which is the correct call: a public demo persisting a visitor's
  // words is a worse problem than a missing metric.
  ok("…except on a demo run, deliberately", /if \(ctx\.signals\.length && !args\.demoRun\)/.test(typed));
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} phonetic-net-unwired: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
