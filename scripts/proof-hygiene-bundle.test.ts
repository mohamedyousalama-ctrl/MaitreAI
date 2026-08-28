// WO-HYGIENE-BUNDLE proof.
// Run: node --experimental-strip-types scripts/proof-hygiene-bundle.test.ts

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL", name);
  }
}

const tools = readFileSync("lib/ai/tools.ts", "utf8");
const createSession = readFileSync("lib/payments/create-session.ts", "utf8");
const webhookHardening = readFileSync("scripts/proof-webhook-hardening.mjs", "utf8");
const tier = readFileSync("lib/tenant/tier.ts", "utf8");
const flags = readFileSync("docs/flags.md", "utf8");

const TECH_JARGON_RE =
  /خطأ\s*تقني|مشكلة\s*تقني(?:ة)?|عطل(?!ة)|خلل|technical\s*(?:error|issue|fault|problem)|system\s*(?:error|fault|issue|down)/i;

function caseBlock(source: string, caseName: string): string {
  const start = source.indexOf(`case "${caseName}":`);
  if (start === -1) return "";
  const rest = source.slice(start);
  const next = rest.indexOf("\n    case ", 1);
  return next === -1 ? rest : rest.slice(0, next);
}

function contentStringHits(source: string, re: RegExp): string[] {
  const hits: string[] = [];
  const patterns = [
    /content:\s*`([\s\S]*?)`/g,
    /content:\s*"([\s\S]*?)"/g,
    // KIV-304 — tool results are dialect-conditional now (`content: sa ? <najdi> : <egyptian>`),
    // so the customer-facing string no longer sits directly after `content:`. Without this
    // third pattern the whole jargon check went quietly to ZERO hits — it would have passed
    // any amount of new jargon, as long as the jargon lived inside a dialect conditional.
    // The capture is the WHOLE ternary, so one conditional is one hit and both dialect arms
    // are searched.
    /content:\s*sa\s*\?\s*([\s\S]*?),\n/g,
  ];
  for (const pattern of patterns) {
    for (const m of source.matchAll(pattern)) {
      if (re.test(m[1])) hits.push(m[1]);
    }
  }
  return hits;
}

// Fix #1 recast: the only tool-result jargon hits are guardrails fed back to Karim,
// not direct customer replies. The direct-send finalize fast path stays jargon-clean.
const allToolContentJargonHits = contentStringHits(tools, TECH_JARGON_RE);
ok(
  "tools jargon hits are only the two Karim guardrail instructions (both dialect arms)",
  allToolContentJargonHits.length === 2 &&
    allToolContentJargonHits.some((x) => x.includes("ده طبيعي، مش عطل تقني")) &&
    allToolContentJargonHits.some((x) => x.includes("مفيش أي عطل تقني")) &&
    // KIV-304 — each guardrail is now one Najdi arm + one Cairene arm; both must be here,
    // and no THIRD jargon string may have crept in alongside them.
    allToolContentJargonHits.some((x) => x.includes("هذا طبيعي، مو عطل تقني")) &&
    allToolContentJargonHits.some((x) => x.includes("ما فيه أي عطل تقني"))
);
ok("guardrail detector regex remains in place", tools.includes("const FABRICATED_TECH_ERROR_RE"));
ok("direct customer-visible finalize tool output has no technical-jargon wording",
  contentStringHits(caseBlock(tools, "finalize_draft"), TECH_JARGON_RE).length === 0);

// Fix #2: no secret-derived diagnostics in PSP failure responses or logs.
ok("payment create no longer defines secretDiag", !createSession.includes("secretDiag"));
ok("payment create no longer derives secret key length", !/secretKey\s*\.\s*length/.test(createSession));
ok("payment create no longer derives secret key head/tail", !/secretKey\s*\.\s*slice\s*\(/.test(createSession));
ok("payment create no longer reports sk_test prefix", !/sk_test|startsWith\(\s*['\"]sk_/.test(createSession));
ok("provider-create failure detail is generic", !/e\s+instanceof\s+Error\s*\?\s*e\.message/.test(createSession));
ok("provider-create failure log does not include raw detail", !/console\.error\([^)]*detail/.test(createSession));

// Fix #3: webhook hardening proof uses the current Wesaya id, not the retired one.
ok("old Wesaya fixture id is gone", !webhookHardening.includes("01fcf62d-bd0f-4a72-b406-df8cd4bbbe61"));
ok("current Wesaya fixture id is present", webhookHardening.includes("5acbc72f-def3-46cd-ad6c-bf0ff4a23642"));

// Fix #4: handoff_timeout is registered as a governed per-tenant flag.
const proFeatureUnion = tier.match(/export type ProFeature =([\s\S]*?);/)?.[1] ?? "";
ok("handoff_timeout is in ProFeature", proFeatureUnion.includes('"handoff_timeout"'));
ok("handoff_timeout is documented in the flag registry", /\|\s*`handoff_timeout`\s*\|/.test(flags));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} hygiene-bundle: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
