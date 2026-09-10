// ============================================================================
// PROOF — Rule DOC-4 (SPEC-1 §6.4): the real clinicians named in the dossier
// must appear NOWHERE in the Faysal build.
//
// Run: node --experimental-strip-types scripts/proof-faysal-denylist.test.ts
//
// WHY A TEST AND NOT A REVIEW COMMENT. The dossier names real, identifiable,
// licensed clinicians harvested from public Google reviews and the group's own
// social pages. Faysal's roster is entirely invented (SPEC-1 §6.3) precisely so
// no real professional gets an invented schedule, invented languages and an
// invented consultation fee attached to their name. A prohibition that lives
// only in a review comment gets forgotten at 2am by someone adding a doctor.
// This one fails the build.
//
// THE NORMALISER IS THE WHOLE GUARD. SPEC-1 §6.4 corrects an earlier draft that
// named `order-pricing.ts`'s `norm()` — which folds tashkeel and tatweel and
// NOTHING else. Driven against the exact leak this rule exists to catch:
//
//   denylist «هبة أحمد»      leaks as «هبه احمد»      norm(): NO   normalizeAr(): YES
//   denylist «أحمد سيد مصطفى» leaks as «احمد سيد مصطفي» norm(): NO   normalizeAr(): YES
//   denylist «هدى الرشيدي»    leaks as «هدي الرشيدي»    norm(): NO   normalizeAr(): YES
//   denylist «سارة الجندي»    leaks as «ساره الجندي»    norm(): NO   normalizeAr(): YES
//
// «هبه احمد» is not a typo — it is the NORMALIZED spelling, and it is what
// every other Arabic matcher in this repo produces. So the guard uses
// `normalizeAr` from lib/ai/allergen-gate.ts, which is the authoritative one
// (25 files under lib/ and app/ import it from there). lib/ai/callback-trigger.ts
// exports a second implementation that is missing the 3+-letter run collapse; a
// guard built on that one is deaf to emphatic spellings.
//
// TWO MATCHING DISCIPLINES, BOTH REQUIRED (§6.4):
//   * multi-token entries — FULL-NAME CONTAINMENT after normalizeAr on both
//     sides. Not token matching: a naive token matcher flags the particle «ال» /
//     "al" against most of the invented names, fails the build on every one,
//     and gets loosened by the next person — after which the guard is gone.
//   * the mononym «نورين» / "Noreen" (a nurse's given name, no surname) —
//     BOUNDARY-MATCHED single token, per SPEC-4 §1.2's Arabic boundary form.
//     Driven: full-name EQUALITY on «نورين» is false against «الممرضة نورين»
//     inside a prompt template while containment is true, so an equality
//     matcher over a single-token entry never fires — which is the entire
//     population of that entry.
//
// SPEC-4 §11.5's grep-the-built-bundle assertion runs BESIDE this one, not
// instead of it: that one is stricter on exact strings, this one is stricter on
// spelling variants.
// ============================================================================

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { normalizeAr } from "../lib/ai/allergen-gate.ts";

const ROOT = resolve(import.meta.dirname, "..");

let pass = 0;
let fail = 0;
const ok = (name: string, condition: boolean, detail = "") => {
  if (condition) pass++;
  else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

// ---------------------------------------------------------------------------
// The denylist. These are REAL PEOPLE named in SOURCE_DOSSIER.txt
// [D §3.1 L125], [D §3.2 L146], [D §3.3 L160], [D §3.5 L194].
// ---------------------------------------------------------------------------

interface DenyEntry {
  label: string;
  /** Multi-token full names, matched by containment after normalisation. */
  full: string[];
  /** Single-token given names, matched with an Arabic-aware boundary. */
  mononym?: string[];
}

const DENYLIST: DenyEntry[] = [
  { label: "Heba Ahmed", full: ["هبة أحمد", "Heba Ahmed"] },
  { label: "Ahmed Sayed Mustafa", full: ["أحمد سيد مصطفى", "Ahmed Sayed Mustafa"] },
  { label: "Noreen", full: [], mononym: ["نورين", "Noreen"] },
  { label: "Huda Al-Rashidi", full: ["هدى الرشيدي", "Huda Al-Rashidi"] },
  { label: "Sarah Al-Jundi", full: ["سارة الجندي", "Sarah Al-Jundi"] },
  { label: "Hanan Ali", full: ["حنان علي", "Hanan Ali"] },
];

/**
 * A second, Latin-only fold applied ON TOP of normalizeAr: hyphens, apostrophes
 * and underscores become spaces, so "Huda Alrashidi", "Huda Al Rashidi" and
 * "huda_al-rashidi" all collapse onto the same string. normalizeAr does not
 * touch Latin punctuation, and Latin renderings of Arabic surnames vary in
 * exactly that punctuation.
 */
function latinFold(s: string): string {
  return normalizeAr(s).replace(/[-'’_.]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * A THIRD fold, Latin only: everything but letters and digits removed, so
 * "Huda Alrashidi", "Huda Al-Rashidi" and "HudaAlRashidi" collapse together.
 * It is deliberately NOT applied to Arabic: squeezing an Arabic document into
 * one unbroken string lets two innocent adjacent words form a denylisted name
 * («وهبه» + «احمدي»), and a guard that cries wolf is a guard someone loosens.
 * Latin renderings of Arabic surnames vary in exactly this punctuation, and the
 * multi-token Latin names here are long enough that an accidental collision is
 * not a realistic failure mode.
 */
function latinSqueeze(s: string): string {
  return normalizeAr(s).replace(/[^a-z0-9]+/g, "");
}

/** SPEC-4 §1.2's boundary form. Arabic has no `\b` in JS regex. */
function boundaryRegexAr(term: string): RegExp {
  return new RegExp(`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?${term}(?![ء-ي])`);
}

function isArabic(s: string): boolean {
  return /[؀-ۿ]/.test(s);
}

interface Hit {
  entry: string;
  needle: string;
  file: string;
}

function scanText(text: string, file: string): Hit[] {
  const hits: Hit[] = [];
  const normalized = normalizeAr(text);
  const folded = latinFold(text);
  const squeezed = latinSqueeze(text);

  for (const entry of DENYLIST) {
    for (const name of entry.full) {
      const needle = normalizeAr(name);
      const needleFolded = latinFold(name);
      const hit =
        normalized.includes(needle) ||
        folded.includes(needleFolded) ||
        (!isArabic(name) && squeezed.includes(latinSqueeze(name)));
      if (hit) hits.push({ entry: entry.label, needle: name, file });
    }
    for (const name of entry.mononym ?? []) {
      const needle = normalizeAr(name);
      const found = isArabic(name)
        ? boundaryRegexAr(needle).test(normalized)
        : new RegExp(`\\b${needle}\\b`).test(folded);
      if (found) hits.push({ entry: entry.label, needle: name, file });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Part A — the matcher fires. A guard nobody has seen fire is a guard nobody
// knows is wired. Every case below is the SPELLING THAT LEAKS, not the
// spelling in the denylist.
// ---------------------------------------------------------------------------

console.log("A. the matcher fires on the spellings that actually leak");

const MUST_FIRE: Array<[string, string]> = [
  ["normalized ta-marbuta + hamza: «هبه احمد»", "الطبيبة هبه احمد موجودة اليوم"],
  ["alef-maqsura folded: «احمد سيد مصطفي»", "د. احمد سيد مصطفي — عيادة الأسنان"],
  ["ya folded: «هدي الرشيدي»", "الدكتورة هدي الرشيدي"],
  ["ta-marbuta folded: «ساره الجندي»", "ساره الجندي، أخصائية"],
  ["exact denylist spelling: «حنان علي»", "الممرضة حنان علي"],
  ["mononym inside a sentence: «الممرضة نورين»", "تقول الممرضة نورين إن الحجز جاهز"],
  ["mononym with a conjunction prefix: «ونورين»", "هبة ونورين في نفس الوردية"],
  // normalizeAr collapses a 3+ run of ONE letter, so «هبببة» folds back onto
  // «هبة» and then onto «هبه». (It does not fold «هبااااه» onto «هبه» — that
  // collapses to «هباه», a different string, and claiming otherwise would be a
  // test asserting a fold the normaliser does not perform.)
  ["emphatic run: «هبببة أحمد»", "هبببة أحمد"],
  ["Latin, plain", "Reviewed by Heba Ahmed on the group page"],
  ["Latin, case + spacing", "AHMED   SAYED    MUSTAFA"],
  ["Latin, hyphen dropped", "Dr Huda Alrashidi"],
  ["Latin, hyphen kept", "Dr. Huda Al-Rashidi"],
  ["Latin mononym", "nurse Noreen said"],
];

for (const [name, sample] of MUST_FIRE) {
  const hits = scanText(sample, "<positive-control>");
  ok(`fires: ${name}`, hits.length > 0, "matcher did NOT fire — the guard is deaf to this spelling");
}

// ---------------------------------------------------------------------------
// Part B — the matcher does NOT fire on the invented roster or on ordinary
// Arabic. A guard that cries wolf gets loosened, and a loosened guard is gone.
// ---------------------------------------------------------------------------

console.log("\nB. the matcher stays quiet where it must");

const MUST_NOT_FIRE: Array<[string, string]> = [
  ["invented roster, Arabic", "د. نورة الحربي · د. منيرة العتيبي · د. هالة منصور · د. أميرة سعد الدين"],
  ["invented roster, Latin", "Noura Al-Harbi, Munirah Al-Otaibi, Hala Mansour, Amira Saad El-Din"],
  ["invented roster, the «ال» particle everywhere", "Al-Dosari Al-Otaibi Al-Shammari Al-Qahtani Al-Baqami Al-Khatib"],
  ["ordinary Arabic booking copy", "أقدر أحجز لك موعد بكرة الساعة عشر الصبح في فرع الروابي"],
  ["a different Ahmed", "د. أحمد الغامدي — استشاري"],
  ["a different Hanan", "حنان الزهراني"],
  ["«نور» is not «نورين»", "د. نور الهدى المطيري"],
  ["«نورين» inside a longer word must not fire", "المنورين"],
  ["Latin squeeze does not collide with the roster", "AbdullahAlDosari MunirahAlOtaibi HalaMansour"],
  ["Latin squeeze does not collide with ordinary copy", "handle the annual allocation as usual"],
];

for (const [name, sample] of MUST_NOT_FIRE) {
  const hits = scanText(sample, "<negative-control>");
  ok(`quiet: ${name}`, hits.length === 0, hits.map((h) => `${h.entry} via "${h.needle}"`).join(", "));
}

// ---------------------------------------------------------------------------
// Part C — the real scan. Seed data, the domain and data layers, the Faysal
// app surface, fixtures and eval sets.
//
// docs/ is EXCLUDED on purpose: SPEC-1 §6.4 and SOURCE_DOSSIER.txt necessarily
// contain these names — that is where the denylist comes from. This test's own
// source is excluded for the same reason. The exclusion is narrow and named, so
// nobody can widen it by accident.
// ---------------------------------------------------------------------------

console.log("\nC. scanning the Faysal build surface");

const SCAN_ROOTS = [
  "scripts/seed-faysal.ts",
  "lib/health",
  "app/faysal",
  "knowledge/faysal",
  "tests/faysal",
  "scripts/fixtures/faysal",
  // The assembled prompt bundle, when a build has produced one. SPEC-4 §11.5
  // owns the built-bundle assertion; this picks it up when it is present so a
  // local run covers it too.
  process.env.FAYSAL_BUNDLE_PATH ?? "",
].filter(Boolean);

const SELF = resolve(import.meta.dirname, "proof-faysal-denylist.test.ts");
const SCANNABLE = /\.(ts|tsx|js|jsx|mjs|cjs|json|sql|txt|md|html)$/;

/**
 * A DECLARATION SITE is a file that necessarily contains these names because it
 * DECLARES the prohibition — the domain layer keeps its own copy of the list
 * beside the roster it protects. Such a file is not exempted wholesale: only
 * the marked declaration is elided, and everything else in it is scanned
 * exactly like any other file. A real name pasted into the roster twenty lines
 * below still fails the build.
 *
 * The elision covers (a) any `Object.freeze([...])` bound to an identifier
 * containing DENYLIST, and (b) the contiguous comment block that introduces it,
 * recognised by a comment line that names the denylist. Those comments discuss
 * the matching discipline and have to quote «نورين» to do it.
 */
function isDeclarationSite(relPath: string): boolean {
  return /denylist/i.test(relPath) || relPath === "lib/health/clinicians.ts";
}

function elideDenylistDeclarations(text: string): string {
  const withoutConstants = text.replace(
    /(?:export\s+)?const\s+[\w$]*DENYLIST[\w$]*[^=]*=\s*Object\.freeze\(\[[\s\S]*?\]\)/g,
    "/* denylist declaration elided by the guard */",
  );
  let eliding = false;
  return withoutConstants
    .split("\n")
    .map((line) => {
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      if (!isComment) {
        eliding = false;
        return line;
      }
      if (/denylist/i.test(line)) eliding = true;
      return eliding ? "" : line;
    })
    .join("\n");
}

function collect(path: string, acc: string[]): void {
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) {
    if (abs !== SELF && SCANNABLE.test(abs)) acc.push(abs);
    return;
  }
  for (const entry of readdirSync(abs)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    collect(join(abs, entry), acc);
  }
}

const files: string[] = [];
for (const root of SCAN_ROOTS) collect(root, files);

ok("scan found files to check", files.length > 0, "no Faysal files matched — the guard would pass vacuously");

const allHits: Hit[] = [];
const declarationSites: string[] = [];
for (const file of files) {
  const rel = relative(ROOT, file).split("\\").join("/");
  const raw = readFileSync(file, "utf8");
  let text = raw;
  if (isDeclarationSite(rel)) {
    declarationSites.push(rel);
    text = elideDenylistDeclarations(raw);
  }
  allHits.push(...scanText(text, rel));
}

ok(
  `no denylisted clinician appears in ${files.length} Faysal file(s)`,
  allHits.length === 0,
  allHits.map((h) => `${h.file}: ${h.entry} (matched "${h.needle}")`).join("; "),
);

if (allHits.length > 0) {
  console.log("\n  PROHIBITION A VIOLATED — these are REAL, identifiable clinicians:");
  for (const h of allHits) console.log(`    ${h.file}  ←  ${h.entry}  (via "${h.needle}")`);
  console.log("  Remove the name. The Faysal roster is invented for exactly this reason (SPEC-1 §6.3).");
}

// ---------------------------------------------------------------------------
// Part D — NEITHER roster shares a name part with the denylist. §6.4's closing
// note claims the invented roster is safe BY CONSTRUCTION; this checks the claim
// rather than repeating it, and it is what catches a future addition like a
// «د. نورة …» whose surname happens to be Al-Jundi. Part C would not: containment
// wants the WHOLE name, and «د. نورة الجندي» contains neither «سارة الجندي» nor
// «Sarah Al-Jundi».
//
// THERE ARE TWO ROSTERS AND THIS USED TO READ ONE OF THEM. It parsed
// `scripts/seed-faysal.ts`, which seeds a database, while the engine answers
// patients out of `lib/health/clinicians.ts` — so the stricter of the two checks
// in this file was blind to the very list a name reaches a patient from, and the
// eleven clinicians added for the internal-medicine gap were checked by hand
// instead. Both are parsed here now, under identical rules.
//
// A PARSE THAT FINDS NOTHING MUST FAIL, not pass. Each roster's extracted names
// are counted against the roster rows declared in its own file, so reformatting
// either file breaks this test loudly rather than quietly emptying the guard —
// which is the same failure mode as a denylist nobody runs.
// ---------------------------------------------------------------------------

console.log("\nD. neither invented roster shares a name part with a real clinician");

interface Roster {
  file: string;
  /** How a roster row opens in that file — what the extraction is counted against. */
  declared: RegExp;
  /** The Arabic name and then the Latin name out of one row. */
  row: RegExp;
}

const ROSTERS: Roster[] = [
  // The engine roster:  c("dr-x", "د. …", "…", "female", …)
  { file: "lib/health/clinicians.ts", declared: /^\s*c\("dr-/gm, row: /c\("dr-[^"]+",\s*"(د\. [^"]+)",\s*"([^"]+)",\s*"(?:female|male)"/g },
  // The seed roster:  { key: "dr-x", ar: "د. …", en: "…", gender: "female", … }
  { file: "scripts/seed-faysal.ts", declared: /^\s*\{ key: "dr-/gm, row: /\{ key: "dr-[^"]+", ar: "(د\. [^"]+)", en: "([^"]+)", gender: "(?:female|male)"/g },
];

const rosterNames: Array<{ file: string; name: string }> = [];
for (const roster of ROSTERS) {
  const source = readFileSync(resolve(ROOT, roster.file), "utf8");
  const declared = [...source.matchAll(roster.declared)].length;
  const rows = [...source.matchAll(roster.row)];
  ok(
    `every roster row in ${roster.file} was parsed`,
    declared > 0 && rows.length === declared,
    `declared=${declared} parsed=${rows.length} — the extraction has fallen behind the file's shape`,
  );
  for (const m of rows) {
    rosterNames.push({ file: roster.file, name: m[1] });
    rosterNames.push({ file: roster.file, name: m[2] });
  }
}

ok("both rosters were found", rosterNames.length >= 2 * 2 * 30, `names=${rosterNames.length}`);

const denyParts = new Set<string>();
for (const entry of DENYLIST) {
  for (const name of [...entry.full, ...(entry.mononym ?? [])]) {
    for (const part of latinFold(name).split(" ")) {
      // "al" alone is a particle, not a name part — see the matching-discipline
      // note above. Two-letter fragments are never distinguishing.
      if (part.length > 2 && part !== "al") denyParts.add(part);
    }
  }
}

const partClashes: string[] = [];
for (const { file, name } of rosterNames) {
  for (const part of latinFold(name).split(" ")) {
    if (part.length > 2 && denyParts.has(part)) partClashes.push(`${file}: ${name} shares "${part}"`);
  }
}

ok("no roster name shares a distinguishing part with a denylisted name", partClashes.length === 0, partClashes.join("; "));

// ---------------------------------------------------------------------------
// Part E — the two lists cannot drift apart. The domain layer keeps its own
// copy of the denylist beside the roster (`lib/health/clinicians.ts`), which is
// the right place for it and is also a second thing that can be edited. This
// test's list stays authoritative; the check is that the domain's copy still
// covers every entry, so shortening one of them fails the build rather than
// quietly halving the guard.
// ---------------------------------------------------------------------------

console.log("\nE. the domain layer's copy of the denylist has not drifted");

const domainFile = resolve(ROOT, "lib/health/clinicians.ts");
if (existsSync(domainFile)) {
  const domainSource = readFileSync(domainFile, "utf8");
  const block = /const\s+[\w$]*DENYLIST[\w$]*[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/g;
  const domainNames = new Set<string>();
  for (const m of domainSource.matchAll(block)) {
    for (const q of m[1].matchAll(/"([^"]+)"/g)) domainNames.add(latinFold(q[1]));
  }
  const missing = DENYLIST.flatMap((e) => [...e.full, ...(e.mononym ?? [])])
    .filter((n) => !domainNames.has(latinFold(n)));
  ok(
    `lib/health/clinicians.ts declares all ${DENYLIST.length} denylisted clinicians`,
    domainNames.size > 0 && missing.length === 0,
    domainNames.size === 0 ? "no denylist constant found there" : `missing: ${missing.join(", ")}`,
  );
} else {
  console.log("  (skipped — lib/health/clinicians.ts is not present in this checkout)");
}

if (declarationSites.length > 0) {
  console.log(`\n  declaration sites (denylist constants elided, everything else scanned): ${declarationSites.join(", ")}`);
}

console.log(`\nFAYSAL DENYLIST PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
