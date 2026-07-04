// ============================================================================
// Item 12 proof harness — i18n scaffold.
// Pure dictionary + direction logic exercised directly; the ESLint rule is run
// through ESLint's real RuleTester (valid + invalid cases); source assertions
// confirm the 3 bidi primitives, the kivo export, and the «بهاء 6m test · +20»
// QA fixture.
//
// Run: node --experimental-strip-types scripts/proof-i18n-scaffold.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { dirFor, isRtl, baseLang } from "../lib/i18n/dir.ts";
import { t, DICTIONARY } from "../lib/i18n/dictionary.ts";
import { QA_FIXTURE_BAHAA } from "../lib/i18n/qa-fixtures.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };

// ---- Direction helper -------------------------------------------------------
check("Arabic → rtl", dirFor("ar") === "rtl" && isRtl("ar"));
check("English → ltr", dirFor("en") === "ltr" && !isRtl("en"));
check("regioned tag normalized (ar-SA → ar)", baseLang("ar-SA") === "ar" && dirFor("ar-SA") === "rtl");
check("unknown/empty defaults to Arabic-first (rtl)", dirFor(null) === "rtl" && baseLang("") === "ar");
check("EN uppercase normalized", baseLang("EN") === "en");

// ---- Dictionary (فصحى + EN) -------------------------------------------------
check("every ar key has an en counterpart (parallel shape)",
  Object.keys(DICTIONARY.ar).sort().join() === Object.keys(DICTIONARY.en).sort().join());
check("t() returns Arabic", t("nav.orders", "ar") === "الطلبات");
check("t() returns English", t("nav.orders", "en") === "Orders");
check("dictionary values are static (no ${} interpolation)",
  !/\$\{/.test(read("lib/i18n/dictionary.ts").split("export const DICTIONARY")[1].split("} as const")[0]));

// ---- ESLint rule via the real RuleTester -----------------------------------
const { RuleTester } = require("eslint");
const rule = require("../eslint-rules/no-arabic-name-number-interpolation.js");
const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: 2021, sourceType: "module" } });
let ruleOk = true;
try {
  ruleTester.run("no-arabic-name-number-interpolation", rule, {
    valid: [
      { code: "const x = `Hello ${name}`;" },              // Latin interpolation — fine
      { code: "const x = `مرحبا بك`;" },                    // Arabic, NO interpolation — fine
      { code: "const x = `${a} + ${b}`;" },                // no Arabic — fine
    ],
    invalid: [
      { code: "const x = `مرحبا ${name}`;", errors: [{ messageId: "noInterp" }] },
      { code: "const x = `${count} عميل`;", errors: [{ messageId: "noInterp" }] },
      { code: "const x = `العميل ${name} رقمه ${phone}`;", errors: [{ messageId: "noInterp" }] },
    ],
  });
} catch (e) {
  ruleOk = false;
  console.error("  ✗ RuleTester threw:", e instanceof Error ? e.message : e);
}
check("ESLint rule passes RuleTester (valid + invalid cases)", ruleOk);

// ---- Bidi primitives --------------------------------------------------------
const bidi = read("components/kivo/Bidi.tsx");
check("Bdi wraps content in <bdi> (isolation)", /export function Bdi[\s\S]*<bdi>\{children\}<\/bdi>/.test(bidi));
check("Num renders LTR-isolated", /export function Num[\s\S]*dir="ltr"[\s\S]*unicodeBidi: "isolate"/.test(bidi));
check("Phone renders LTR-isolated + nowrap (+country stays put)", /export function Phone[\s\S]*dir="ltr"[\s\S]*whiteSpace: "nowrap"/.test(bidi));
check("kivo index exports Bdi/Num/Phone", read("components/kivo/index.ts").includes('export { Bdi, Num, Phone } from "./Bidi"'));

// ---- QA fixture «بهاء 6m test · +20» ---------------------------------------
check("fixture is بهاء / 6m / test / +20",
  QA_FIXTURE_BAHAA.name === "بهاء" && QA_FIXTURE_BAHAA.duration === "6m" &&
  QA_FIXTURE_BAHAA.token === "test" && QA_FIXTURE_BAHAA.phone === "+20");

console.log(`\nI18N-SCAFFOLD PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
