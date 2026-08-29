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

// Files carrying customer-facing Saudi copy.
const FILES = [
  "lib/ai/allergen-companion-flow.ts",
  "lib/ai/turn-contract.ts",
  "lib/ai/customer-turn.ts",
  "lib/ai/allergy-simple.ts",
  "lib/ai/allergy-calm-hold.ts",
  "lib/ai/dialect.ts",
  // Added after a live run caught this file returning EGYPTIAN on a Saudi tenant: its
  // careful-line took a `dialect` argument and discarded it, commented "dialect-agnostic
  // by design". Six files was never the right list — see the note above FILES.
  "lib/ai/disease-diet-guard.ts",
  "lib/ai/respond.ts",
  "lib/messaging/respond-and-send.ts",
  // WO-DIALECT-AUDIT (29 Aug). An audit found Egyptian in the SAUDI branch of eleven files
  // this list had never opened — «ابعت لي العنوان» in delivery-readiness.ts fired on
  // production, and typed-actions.ts offered a Saudi customer فودافون كاش, an Egyptian
  // wallet that does not exist in the country. Nine files was never the right list either.
  "lib/ai/delivery-readiness.ts",
  "lib/ai/prompt.ts",
  "lib/ai/pay-playbook.ts",
  "lib/ai/voice-quality.ts",
  "lib/ai/clarification.ts",
  "lib/ai/recap-render.ts",
  "lib/ai/perception.ts",
  "lib/ai/prompt-allergy.ts",
  "lib/messaging/typed-actions.ts",
  "lib/messaging/image-turn.ts",
  "lib/ai/media-intent.ts",
  "lib/delivery/routing.ts",
];

// EXTRA markers. The project linter's Egyptian list is 26 entries and misses the ones
// that actually leaked: it contains none of these, and returned ok=true on every
// Egyptian string in allergy-calm-hold.ts's Saudi path. A clean findLeakage() is NOT
// evidence of Saudi-ness, so this proof adds its own list on top.
const EXTRA_EGYPTIAN: Array<[RegExp, string]> = [
  [/(?:^|[\s،.])مش(?=[\s،.]|$)/, "مش"],
  [/(?:^|[\s،.])لسه(?=[\s،.]|$)/, "لسه"],
  [/(?:^|[\s،.])حابب(?=[\s،.]|$)/, "حابب"],
  [/لحد ما/, "لحد ما"],
  [/يا فندم|حضرتك/, "فندم/حضرتك"],
  [/(?:^|[\s،.])ه(?:يتواصل|يرد|يتأكد|رجعلك|نكمل|جيب|بعتلك)/, "ه-future"],
  [/(?:^|[\s،.])دي(?=[\s،.]|$)/, "دي"],
  [/معاك(?=[\s،.]|$)/, "معاك"],
];
// MSA slippage the corpus itself bans (prompt.ts: never أريد/سوف/سـ/يرجى/لطفاً).
const EXTRA_MSA: Array<[RegExp, string]> = [
  [/(?:^|[\s،.])(?:سوف|أريد|يُرجى|يرجى|لطفاً)(?=[\s،.]|$)/, "MSA word"],
  [/(?:^|[\s،.])س(?:نحل|يصلك|نتواصل|نعوض|نرجع|يتصل)/, "MSA سـ future"],
];

function offend(text: string): string[] {
  const hits: string[] = [];
  const leak = findLeakage(text);
  if (!leak.ok) hits.push(...leak.hits.map((h) => `${h.marker}(${h.category})`));
  for (const [re, label] of EXTRA_EGYPTIAN) if (re.test(text)) hits.push(`${label}(egyptian)`);
  for (const [re, label] of EXTRA_MSA) if (re.test(text)) hits.push(`${label}(msa)`);
  return hits;
}

/**
 * Every Saudi-side string in a file.
 *
 * THE FIRST VERSION OF THIS EXTRACTOR WAS BACKWARDS and reported a false all-clear.
 * It only understood `dialect === "egyptian" ? EG : SA`, so on the equally common
 * `dialect === "saudi" ? SA : EG` it took the `:` branch — the EGYPTIAN string — and
 * linted that as if it were Saudi, while never checking the real Saudi one. It also
 * only looked at ternaries, so allergy-calm-hold.ts — whose Saudi copy lives in an
 * object literal and which carried SIX Egyptian strings including the banned «يا فندم» —
 * contributed zero branches and the suite still printed "0 offenders".
 *
 * Handles all three shapes now: both ternary polarities, and `saudi: { … }` /
 * `saudi: "…"` object-literal blocks.
 */
function saudiStrings(path: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const lines = readFileSync(resolve(ROOT, path), "utf8").split("\n");
  const isComment = (l: string) => {
    const t = l.trimStart();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
  };

  // (a)+(b) TERNARIES, both polarities, single- or multi-line.
  //
  // Polarity is decided by the CONDITION, never by branch position — that was the
  // original bug. `dialect === "saudi" ? A : B` yields A; `dialect === "egyptian" ? A : B`
  // (and the abbreviated `eg ? A : B`) yields B. A window of the condition line plus the
  // next three is joined so a ternary wrapped across lines is read the same way.
  for (let i = 0; i < lines.length; i++) {
    if (isComment(lines[i])) continue;
    // `isSaudi(dialect) ?` and `sa ?` are used as widely as the literal comparison, and the
    // detector understood neither — so delivery-readiness.ts, tools.ts and clarification.ts
    // contributed ZERO branches while reporting no failures. A branch-walker that silently
    // walks nothing is worse than no walker: it reports success.
    const isSaudiFirst = /dialect === "saudi"\s*$|dialect === "saudi"\s*\?|isSaudi\([A-Za-z_.]+\)\s*$|isSaudi\([A-Za-z_.]+\)\s*\?|(?:^|[^A-Za-z])sa\s*\?/.test(lines[i]);
    const isEgFirst = /dialect === "egyptian"\s*$|dialect === "egyptian"\s*\?|(?:^|[^A-Za-z])eg\s*\?/.test(lines[i]);
    if (!isSaudiFirst && !isEgFirst) continue;
    const window = [lines[i], lines[i + 1] ?? "", lines[i + 2] ?? "", lines[i + 3] ?? ""].join("\n");
    const m = window.match(/\?\s*"([^"]+)"[\s\S]{0,40}?:\s*"([^"]+)"/);
    if (!m) continue;
    out.push({ line: i + 1, text: isSaudiFirst ? m[1] : m[2] });
  }

  // (c) object-literal Saudi blocks: `saudi: {` … `}` and `saudi: "…"`.
  let depth = -1;
  lines.forEach((l, i) => {
    if (isComment(l)) return;
    if (depth < 0 && /^\s*saudi:\s*\{/.test(l)) { depth = 0; return; }
    if (depth >= 0) {
      depth += (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
      for (const m of l.matchAll(/"([^"]*[؀-ۿ][^"]*)"/g)) out.push({ line: i + 1, text: m[1] });
      // TEMPLATE LITERALS TOO. The Saudi phone line is an arrow function returning a
      // backtick string — `لو تحب تتواصل مباشرة: ${p}` — so a double-quote-only scan
      // missed it, and a mutation putting the Egyptian «حابب» back survived.
      for (const m of l.matchAll(/`([^`]*[؀-ۿ][^`]*)`/g)) out.push({ line: i + 1, text: m[1] });
      if (depth < 0) depth = -1;
      return;
    }
    const inline = l.match(/^\s*saudi:\s*"([^"]*[؀-ۿ][^"]*)"/);
    if (inline) out.push({ line: i + 1, text: inline[1] });
  });

  // de-dupe
  const seen = new Set<string>();
  return out.filter((o) => { const k = `${o.line}|${o.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

let checked = 0;
const offenders: string[] = [];
for (const f of FILES) {
  for (const { line, text } of saudiStrings(f)) {
    checked++;
    // A BAN IS NOT A USE. «never «حضرتك» أو «يا فندم»» instructs the model NOT to say them;
    // flagging it would push someone to delete the very rule that prevents the defect. Only
    // a marker with no negation immediately before it counts as a use.
    const hits = offend(text).filter((h) => {
      const marker = h.split("(")[0].split("/")[0];
      const at = text.indexOf(marker);
      if (at < 0) return true;
      const before = text.slice(Math.max(0, at - 60), at);
      return !/\b(never|NEVER|not|avoid|forbidden|banned)\b|لا تقول|ممنوع|تجنّب|تجنب/.test(before);
    });
    if (hits.length) offenders.push(`${f}:${line} [${hits.join(", ")}] ${text.slice(0, 70)}`);
  }
}

// COVERAGE IS ITSELF AN ASSERTION. The floor was 25 while the real count was 93, so
// deleting files from FILES or blinding the extractor dropped coverage to 87 and the proof
// stayed GREEN — a scan can be narrowed to nothing without failing, which is how eleven
// files with Egyptian in their Saudi branches stayed invisible.
ok(`the extractor found Saudi strings to check (found ${checked})`, checked >= 85);

// The specific files an audit found harbouring Egyptian in a SAUDI branch. Named so that
// removing one from FILES fails here rather than quietly shrinking the scan.
for (const mustCover of [
  "lib/ai/delivery-readiness.ts",   // «ابعت لي العنوان» — fired on production
  "lib/messaging/typed-actions.ts", // offered a Saudi customer فودافون كاش
  "lib/ai/pay-playbook.ts",         // «لسه» in the Saudi anchor set
  "lib/ai/prompt.ts",
]) {
  ok(`${mustCover} is in the scanned set`, FILES.includes(mustCover));
}

// And the EXTRACTOR must actually see the branch forms those files use. delivery-readiness
// writes `isSaudi(dialect) ? …`, which the detector did not recognise — so the file was in
// the list and contributed ZERO branches. A walker that walks nothing reports success.
ok("the extractor understands `isSaudi(...) ?`, not just the literal comparison",
  saudiStrings("lib/ai/delivery-readiness.ts").length >= 3);
// The file that carried SIX Egyptian strings contributed ZERO before — its copy lives
// in an object literal, not a ternary, so the first extractor never opened it.
ok("allergy-calm-hold.ts is actually covered (it was silently skipped before)",
  saudiStrings("lib/ai/allergy-calm-hold.ts").length >= 5);
// Name the offenders. A bare pass/fail here meant a failure told you a Saudi branch was
// Egyptian somewhere across a dozen files and left you to find it by hand.
if (offenders.length) for (const o of offenders) console.log("      →", o);
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

// ── LIVE LEAK, 29 Aug 2026 — caught in production, not in a test ─────────────
// The delivery-address turn on the najd demo tenant answered «تمام 👌 ابعت لي العنوان
// بالتفصيل». findLeakage returned {"ok":true,"hits":[]} on that exact string: «ابعت» is the
// Egyptian imperative of «بعت» and was simply not on the list. A Riyadh speaker says
// «أرسل لي» / «اكتب لي», so there is no Najdi homograph to protect.
//
// This is model DRIFT, not a hardcoded string — the prompt already forbids Egyptian
// borrowing and the model did it anyway. The linter is the only thing that can see that
// happen, so a marker it cannot see is a leak nobody will ever hear about.
{
  const leaked = findLeakage("تمام 👌 ابعت لي العنوان بالتفصيل — الشارع ورقم العمارة", { region: "najd" });
  ok("the live «ابعت» leak is caught", !leaked.ok && leaked.hits.some((h) => h.marker === "ابعت"));

  // And the ban must not cost us legitimate Najdi. Every one of these is what Khalid
  // SHOULD say; a linter that flags them would train everyone to ignore it.
  for (const clean of [
    "أرسل لي العنوان", "اكتب لي العنوان بالتفصيل", "وش تحب تطلب؟",
    "أبشر، الطلب معنا", "تبي كبسة وحدة ولا أكثر؟", "هلا والله، نوّرت",
    "الحين وقت الغدا", "ما نقدر نضمن عدم وجود أثر",
  ]) {
    const r = findLeakage(clean, { region: "najd" });
    ok(`natural Najdi is not flagged: ${clean.slice(0, 28)}`, r.ok);
  }
}

console.log(`\nSAUDI DIALECT PURITY PROOF: ${pass} passed, ${fail} failed  (${checked} Saudi branches scanned)`);
process.exit(fail === 0 ? 0 : 1);
