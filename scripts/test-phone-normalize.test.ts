// Unit tests for phone normalization (pure, no DB/network).
// Run: node --experimental-strip-types scripts/test-phone-normalize.test.ts
import { normalizePhone } from "../lib/messaging/phone.ts";
let pass = 0, fail = 0;
const eq = (n: string, got: string, want: string) => {
  if (got === want) pass++;
  else { fail++; console.log(`  ❌ ${n}: got "${got}" want "${want}"`); }
};

// --- Egypt (with tenant country) ---
eq("EG local trunk-0", normalizePhone("01030036000", "EG"), "201030036000");
eq("EG local with spaces", normalizePhone("010 3003 6000", "EG"), "201030036000");
eq("EG with +20 prefix", normalizePhone("+201030036000", "EG"), "201030036000");
eq("EG with 0020 intl prefix", normalizePhone("00201030036000", "EG"), "201030036000");
eq("EG bare national (no cc)", normalizePhone("1030036000", "EG"), "201030036000");
eq("EG already canonical", normalizePhone("201030036000", "EG"), "201030036000");

// --- Saudi (Kivo expansion) — leading-0 must NOT become 20 ---
eq("SA local trunk-0", normalizePhone("0512345678", "SA"), "966512345678");
eq("SA with +966", normalizePhone("+966512345678", "SA"), "966512345678");
eq("SA already canonical", normalizePhone("966512345678", "SA"), "966512345678");
eq("SA bare national", normalizePhone("512345678", "SA"), "966512345678");

// --- Country-agnostic (send-time safety net, no country given) ---
eq("agnostic EG 11-digit local", normalizePhone("01030036000"), "201030036000");
eq("agnostic SA 10-digit local", normalizePhone("0512345678"), "966512345678");
eq("agnostic EG canonical passes through", normalizePhone("201030036000"), "201030036000");
eq("agnostic SA canonical passes through", normalizePhone("966512345678"), "966512345678");

// --- WO-RACE-1 (FR-014): a genuinely-unmatched shape returns "" (invalid signal), NOT the
// raw digits — a local/partial number stored as a customer phone is send-doomed (Meta #131030).
eq("junk letters", normalizePhone("dddd"), "");
eq("short junk", normalizePhone("123"), "");
eq("malformed 12-digit EG-ish (no rule)", normalizePhone("011137987878", "EG"), "");
eq("unknown country falls back to agnostic", normalizePhone("01030036000", "XX"), "201030036000");
eq("empty", normalizePhone(""), "");

// --- A Saudi number must never be mangled by an Egyptian assumption ---
eq("SA canonical under EG country stays SA", normalizePhone("966512345678", "EG"), "966512345678");

console.log(`\nPHONE-NORMALIZE UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
