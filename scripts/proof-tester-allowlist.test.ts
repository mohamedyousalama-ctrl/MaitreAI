// ============================================================================
// DRYRUN-1 proof harness — tester allowlist gate.
// Asserts the five required guarantees against the REAL pure decision helper
// (lib/messaging/tester-allowlist.ts, imported directly — same code the gate in
// respond-and-send.ts calls), PLUS source assertions that the gate is wired
// correctly (ordering before runCustomerTurn, new status, hold-note, normalize-
// both) and that the allergen-gate invocation in customer-turn.ts is unchanged.
//
// Run: node --experimental-strip-types scripts/proof-tester-allowlist.test.ts
// (from the repo root). The helper is a leaf module (imports only phone.ts), so
// no server-only chain is pulled in.
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluateTesterAllowlist } from "../lib/messaging/tester-allowlist.ts";
import { normalizePhone } from "../lib/messaging/phone.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error("  ✗ FAIL:", name); }
}

// Bahaa's number in three input shapes — all must canonicalize identically.
const BAHAA_INTL = "201030036000";
const BAHAA_LOCAL = "01030036000";
const BAHAA_PLUS = "+20 103 003 6000";
const OTHER = "201111111111";

// ---- (a) mode OFF → zero behavior change (always allow, falls through) -------
check("(a) mode off + listed number → allow",
  evaluateTesterAllowlist({ testerAllowlistMode: false, testerAllowlist: [BAHAA_INTL], country: "EG", phone: BAHAA_INTL, readError: false, hasRow: true }).allow === true);
check("(a) mode off + UNlisted number → STILL allow (inert, unchanged path)",
  evaluateTesterAllowlist({ testerAllowlistMode: false, testerAllowlist: [BAHAA_INTL], country: "EG", phone: OTHER, readError: false, hasRow: true }).allow === true);
check("(a) mode null (pre-migration / unset) → allow (inert)",
  evaluateTesterAllowlist({ testerAllowlistMode: null, testerAllowlist: null, country: "EG", phone: OTHER, readError: false, hasRow: true }).allow === true);
check("(a) mode undefined → allow (inert)",
  evaluateTesterAllowlist({ testerAllowlistMode: undefined, testerAllowlist: undefined, country: "EG", phone: OTHER, readError: false, hasRow: true }).allow === true);

// ---- (b) allowlisted number → allow (falls through to runCustomerTurn) -------
check("(b) mode on + listed (intl stored, intl inbound) → allow",
  evaluateTesterAllowlist({ testerAllowlistMode: true, testerAllowlist: [BAHAA_INTL], country: "EG", phone: BAHAA_INTL, readError: false, hasRow: true }).allow === true);

// ---- (c) non-allowlisted → hold ---------------------------------------------
check("(c) mode on + UNlisted → hold",
  evaluateTesterAllowlist({ testerAllowlistMode: true, testerAllowlist: [BAHAA_INTL], country: "EG", phone: OTHER, readError: false, hasRow: true }).allow === false);
check("(c) mode on + empty list → hold everyone",
  evaluateTesterAllowlist({ testerAllowlistMode: true, testerAllowlist: [], country: "EG", phone: BAHAA_INTL, readError: false, hasRow: true }).allow === false);
check("(c) mode on + NULL list → hold everyone",
  evaluateTesterAllowlist({ testerAllowlistMode: true, testerAllowlist: null, country: "EG", phone: BAHAA_INTL, readError: false, hasRow: true }).allow === false);
check("(c) mode on + blank inbound phone → hold",
  evaluateTesterAllowlist({ testerAllowlistMode: true, testerAllowlist: [BAHAA_INTL], country: "EG", phone: "", readError: false, hasRow: true }).allow === false);

// ---- (d) read failure / null row → HOLD (the fail-safe) ----------------------
check("(d) readError && no row → HOLD (indeterminate → hold-on-uncertainty)",
  evaluateTesterAllowlist({ testerAllowlistMode: undefined, testerAllowlist: undefined, country: undefined, phone: BAHAA_INTL, readError: true, hasRow: false }).allow === false);
check("(d) readError && no row, even a 'listed' number can't be proven → HOLD",
  evaluateTesterAllowlist({ testerAllowlistMode: undefined, testerAllowlist: undefined, country: undefined, phone: BAHAA_INTL, readError: true, hasRow: false }).allow === false);
// A transient error that still returned a row with mode off must NOT hold (we
// have the data and it proves the feature is inert).
check("(d) readError but row present + mode off → allow (we have proof of inert)",
  evaluateTesterAllowlist({ testerAllowlistMode: false, testerAllowlist: null, country: "EG", phone: OTHER, readError: true, hasRow: true }).allow === true);

// ---- format-match: stored vs inbound canonicalize to the same value ----------
check("format: local '01030036000' stored matches intl inbound",
  evaluateTesterAllowlist({ testerAllowlistMode: true, testerAllowlist: [BAHAA_LOCAL], country: "EG", phone: BAHAA_INTL, readError: false, hasRow: true }).allow === true);
check("format: '+20 103 003 6000' stored matches local inbound",
  evaluateTesterAllowlist({ testerAllowlistMode: true, testerAllowlist: [BAHAA_PLUS], country: "EG", phone: BAHAA_LOCAL, readError: false, hasRow: true }).allow === true);
check("format: intl stored matches '+'-formatted inbound",
  evaluateTesterAllowlist({ testerAllowlistMode: true, testerAllowlist: [BAHAA_INTL], country: "EG", phone: BAHAA_PLUS, readError: false, hasRow: true }).allow === true);
check("format: the same canonicalizer is used (normalizePhone) — three shapes collapse to one",
  normalizePhone(BAHAA_INTL, "EG") === normalizePhone(BAHAA_LOCAL, "EG") &&
  normalizePhone(BAHAA_LOCAL, "EG") === normalizePhone(BAHAA_PLUS, "EG"));

// ---- source assertions: gate wiring in respond-and-send.ts -------------------
const ras = readFileSync(join(ROOT, "lib/messaging/respond-and-send.ts"), "utf8");
check("src: new status 'skipped_not_allowlisted' in the union",
  ras.includes('| "skipped_not_allowlisted"'));
check("src: gate calls evaluateTesterAllowlist",
  ras.includes("evaluateTesterAllowlist({"));
check("src: hold returns skipped_not_allowlisted",
  ras.includes('return { status: "skipped_not_allowlisted" }'));
check("src: hold writes an operator hold-note (held_not_allowlisted)",
  ras.includes("held_not_allowlisted") && ras.includes("noteToTimeline"));
// Deploy-safe (P1): the mode gate reads agent_mode ONLY (byte-unchanged, never
// errors on a missing tester column); the tester columns are read SEPARATELY.
// REPAIR (stale source-shape pin): the mode-gate read now folds two OTHER
// pre-existing columns into the same query (`.select("agent_mode, feature_flags,
// dialect")`), which is still deploy-safe. The invariant actually under proof is
// that the mode gate must NOT read the tester columns (they may not exist yet
// pre-migration) — those are read separately by the assertion below. Pin THAT.
const modeSelect = (ras.match(/\.select\("agent_mode[^"]*"\)/) ?? [])[0] ?? "";
// NARROWED 29 Aug: this matched `country` as well, and country is NOT a tester column —
// `country text not null default 'SA'` is in 0001_init.sql, the original schema, and
// lib/db/conversations.ts reads it standalone with no 42703 guard. The tester columns
// (tester_allowlist, tester_allowlist_mode, migration 0057) are the deploy-safety concern;
// country is only co-selected with them a few lines below. The over-broad version caused a
// real defect: it pushed the mode gate to resolve its dialect WITHOUT country while every
// other site resolved WITH it, giving one tenant two dialects in a single turn.
check("src: mode gate read excludes the tester columns (deploy-safe)",
  modeSelect !== "" && !/tester_allowlist/.test(modeSelect));
check("src: tester columns read separately",
  /\.select\(\s*"country, tester_allowlist, tester_allowlist_mode"\s*\)/.test(ras));
check("src: missing-column (pre-migration) treated as feature-off, not hold",
  ras.includes("columnsMissing") && ras.includes("42703") && ras.includes("does not exist"));
check("src: columnsMissing forces mode=false (inert), genuine error → readError (hold)",
  /columnsMissing\s*\?\s*false/.test(ras) && ras.includes("allowlistReadError = !!alErr && !columnsMissing"));
// ORDERING: gate must sit AFTER the mode gate and BEFORE runCustomerTurn.
const idxMode = ras.indexOf("skipped_mode");
const idxGate = ras.indexOf("evaluateTesterAllowlist({");
const idxRun = ras.indexOf("runCustomerTurn(");
check("src: gate is AFTER mode gate", idxMode > 0 && idxGate > idxMode);
check("src: gate is BEFORE runCustomerTurn (upstream of the agent path)", idxRun > 0 && idxGate < idxRun);

// ---- (P2) held non-allowlisted inbound flips into the HUMAN queue -----------
// A hold must hand the conversation to a human (HUMAN_ACTIVE, Karim silent) — not
// silently drop it. The flip must happen on the hold path, before the return.
const idxHoldReturn = ras.indexOf('return { status: "skipped_not_allowlisted" }');
const idxFlip = ras.indexOf('setOwnershipState(admin, conversationId, "HUMAN_ACTIVE"');
check("(P2) hold path flips ownership to HUMAN_ACTIVE", idxFlip > 0);
check("(P2) flip carries owner=human + tester_allowlist_hold reason",
  ras.includes('owner: "human"') && ras.includes('escalation_reason: "tester_allowlist_hold"'));
check("(P2) flip happens BEFORE the skipped_not_allowlisted return", idxFlip > 0 && idxHoldReturn > idxFlip);
check("(P2) flip is best-effort (a failure does not throw the webhook)",
  /catch\s*\(e\)\s*{\s*\n?\s*console\.error\("\[allowlist\] hold ownership flip failed/.test(ras));
// The flip stays UPSTREAM of runCustomerTurn — the allergen gate never runs on a held turn.
check("(P2) held path still returns before runCustomerTurn (allergen path not reached)",
  idxHoldReturn > 0 && idxRun > idxHoldReturn);

// ---- (e) allergen-gate invocation in customer-turn.ts is UNCHANGED -----------
const ct = readFileSync(join(ROOT, "lib/ai/customer-turn.ts"), "utf8");
check("(e) allergen gate present: detectAllergenAvoidance invoked",
  ct.includes("detectAllergenAvoidance(input.userMessage)"));
check("(e) allergen gate present: symptom detector invoked",
  ct.includes("detectAllergenSymptom"));
check("(e) allergen gate present: forcedAllergenSafetyResult on hit",
  ct.includes("forcedAllergenSafetyResult"));
check("(e) allergen gate present: combinedAllergenHit branch intact",
  ct.includes("combinedAllergenHit"));
// The allowlist work touched only respond-and-send.ts + the new leaf module +
// the migration; customer-turn.ts must contain NO allowlist reference.
check("(e) customer-turn.ts has NO allowlist reference (allergen path untouched)",
  !/allowlist/i.test(ct));

console.log(`\nTESTER-ALLOWLIST PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
