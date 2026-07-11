// Unit tests for WO-T1-PAYMENTS — the canonical payment-method resolver as THE
// sole source of payment-method truth. RED-FIRST proofs:
//   (1) resolver-is-sole-source — grep-proof no production code outside lib/payments
//       interprets payment_config (normalizePaymentConfig lives there only);
//   (2) never-all-off — at resolve time (guard) and the write-time guard function;
//   (3) snapshot immutability — the 0084 table is write-once (PK + BEFORE UPDATE
//       trigger) and recordPaymentSnapshot no-ops when the flag is off;
//   (4) flag-off byte-identical — the resolver returns exactly
//       normalizePaymentConfig(payment_config) for every existing tenant.
// Run: node --experimental-strip-types scripts/test-payment-resolver.test.ts
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePaymentConfig, DEFAULT_PAYMENT_CONFIG, type PaymentConfig } from "../lib/payments/config.ts";
import {
  resolvePaymentMethods,
  loadResolvedPaymentMethods,
  recordPaymentSnapshot,
  enforceNeverAllOff,
  offeredMethods,
  type PaymentMethodRow,
} from "../lib/payments/resolve.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ON = { canonical_payment_methods: true } as Record<string, unknown>;

// ── (1) RESOLVER IS SOLE SOURCE — grep-proof ─────────────────────────────────
// No production surface (lib / app / components) may interpret payment_config via
// normalizePaymentConfig — only the resolver's home (lib/payments) is allowed.
function grepFiles(pattern: string, dirs: string[]): string[] {
  try {
    const out = execSync(
      `grep -rEl ${JSON.stringify(pattern)} ${dirs.join(" ")} --include=*.ts --include=*.tsx`,
      { cwd: process.cwd(), encoding: "utf8" }
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return []; // grep exit 1 = no matches
  }
}
const interpreters = grepFiles("normalizePaymentConfig\\(", ["lib", "app", "components"]);
const strays = interpreters.filter((f) => !f.startsWith("lib/payments/"));
ok("★ normalizePaymentConfig is called ONLY under lib/payments/ (sole source)", strays.length === 0);
if (strays.length) console.log("     stray interpreters:", strays.join(", "));
ok("resolver home actually uses it (proof the grep is live)", interpreters.some((f) => f.startsWith("lib/payments/")));

// ── (4) FLAG-OFF BYTE-IDENTICAL ──────────────────────────────────────────────
const samples: unknown[] = [
  undefined,
  null,
  {},
  { cod_enabled: false },
  { cod_enabled: true, vodafone_cash: { enabled: true, number: "0100", instructions: "hi" } },
  { cod_enabled: false, instapay: { enabled: true, handle: "@x", instructions: "" }, wallet_policy: "lenient" },
];
let identical = true;
for (const s of samples) {
  const r = resolvePaymentMethods({ paymentConfig: s, featureFlags: null });
  if (!eq(r.config, normalizePaymentConfig(s)) || r.source !== "legacy") identical = false;
}
ok("★ flag-off resolver === normalizePaymentConfig for all samples (byte-identical)", identical);

// Flag OFF but canonical rows present → rows are IGNORED, legacy wins (still identical).
const rowsAllOff: PaymentMethodRow[] = [
  { method: "cod", enabled: false, config: {} },
  { method: "vodafone_cash", enabled: false, config: {} },
  { method: "instapay", enabled: false, config: {} },
];
const offWithRows = resolvePaymentMethods({ paymentConfig: { cod_enabled: true }, methodRows: rowsAllOff, featureFlags: null });
ok("flag-off ignores canonical rows (source legacy, COD stays on from legacy)", offWithRows.source === "legacy" && offWithRows.config.cod_enabled === true);

// ── (2) NEVER-ALL-OFF ────────────────────────────────────────────────────────
// resolve-time: flag ON + every method disabled → COD forced on (safe default).
const resolvedAllOff = resolvePaymentMethods({ paymentConfig: {}, methodRows: rowsAllOff, featureFlags: ON });
ok("★ never-all-off @ resolve: all methods off → COD forced ON", resolvedAllOff.source === "table" && resolvedAllOff.config.cod_enabled === true);
// A tenant that deliberately runs wallet-only (COD off, VF on) is NOT force-flipped.
const rowsWalletOnly: PaymentMethodRow[] = [
  { method: "cod", enabled: false, config: {} },
  { method: "vodafone_cash", enabled: true, config: { number: "0100", instructions: "" } },
];
const walletOnly = resolvePaymentMethods({ paymentConfig: {}, methodRows: rowsWalletOnly, featureFlags: ON });
ok("never-all-off does NOT override a real wallet-only tenant (COD stays off)", walletOnly.config.cod_enabled === false && walletOnly.config.vodafone_cash.enabled === true);
// write-time guard (the exact function the settings POST applies when flag on).
const allOff: PaymentConfig = { cod_enabled: false, wallet_policy: "strict", vodafone_cash: { enabled: false, number: "", instructions: "" }, instapay: { enabled: false, handle: "", instructions: "" } };
ok("★ never-all-off @ write: enforceNeverAllOff(all-off) → COD on", enforceNeverAllOff(allOff).cod_enabled === true);
ok("enforceNeverAllOff leaves a valid config untouched", eq(enforceNeverAllOff(DEFAULT_PAYMENT_CONFIG), DEFAULT_PAYMENT_CONFIG));

// canonical rows build the effective config (configFromRows via resolver, flag on).
const built = resolvePaymentMethods({ paymentConfig: { wallet_policy: "lenient" }, methodRows: rowsWalletOnly, featureFlags: ON });
ok("canonical rows drive the config (wallet enabled + number from row.config)", built.config.vodafone_cash.enabled === true && built.config.vodafone_cash.number === "0100");
ok("wallet_policy rides through from legacy config on the canonical path", built.config.wallet_policy === "lenient");

// ── loadResolvedPaymentMethods: flag-off does ZERO db work ───────────────────
const throwingDb = { from() { throw new Error("DB touched while flag OFF"); } } as unknown as SupabaseClient;
let noDbOff = false;
try {
  const r = await loadResolvedPaymentMethods(throwingDb, "r1", { paymentConfig: { cod_enabled: true }, featureFlags: null });
  noDbOff = r.source === "legacy" && r.config.cod_enabled === true;
} catch { noDbOff = false; }
ok("★ loadResolved flag-off does NO db read (hot path untouched)", noDbOff);

// flag-on reads the table; table-absent (read error) fails soft → legacy.
const okDb = { from: () => ({ select: () => ({ eq: async () => ({ data: rowsWalletOnly, error: null }) }) }) } as unknown as SupabaseClient;
const loadedOn = await loadResolvedPaymentMethods(okDb, "r1", { paymentConfig: {}, featureFlags: ON });
ok("loadResolved flag-on reads canonical rows (source table)", loadedOn.source === "table" && loadedOn.config.vodafone_cash.number === "0100");
const absentDb = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "relation does not exist" } }) }) }) } as unknown as SupabaseClient;
const loadedAbsent = await loadResolvedPaymentMethods(absentDb, "r1", { paymentConfig: { cod_enabled: true }, featureFlags: ON });
ok("loadResolved flag-on + table absent → fails soft to legacy", loadedAbsent.source === "legacy" && loadedAbsent.config.cod_enabled === true);

// ── offeredMethods ───────────────────────────────────────────────────────────
ok("offered: COD-only default", eq(offeredMethods(DEFAULT_PAYMENT_CONFIG), ["cod"]));
ok("offered: wallet counts only when enabled AND has its receiving id", eq(offeredMethods(walletOnly.config), ["vodafone_cash"]));
ok("offered: enabled wallet with BLANK number is not offered", eq(offeredMethods({ ...DEFAULT_PAYMENT_CONFIG, vodafone_cash: { enabled: true, number: "  ", instructions: "" } }), ["cod"]));

// ── (3) SNAPSHOT: recordPaymentSnapshot flag-gated + IMMUTABILITY design ──────
let snapDbTouched = false;
const snapThrowDb = { from() { snapDbTouched = true; throw new Error("no"); } } as unknown as SupabaseClient;
await recordPaymentSnapshot(snapThrowDb, { orderId: "o1", restaurantId: "r1", offered: ["cod"], chosen: "cod", featureFlags: null });
ok("★ recordPaymentSnapshot is a no-op when flag off (never touches db)", snapDbTouched === false);

let insertedRow: Record<string, unknown> | null = null;
const captureDb = { from: () => ({ insert: async (v: Record<string, unknown>) => { insertedRow = v; return { error: null }; } }) } as unknown as SupabaseClient;
await recordPaymentSnapshot(captureDb, { orderId: "o2", restaurantId: "r2", offered: ["cod", "vodafone_cash"], chosen: "vodafone_cash", featureFlags: ON });
ok("recordPaymentSnapshot flag-on writes order_id + offered + chosen", !!insertedRow && (insertedRow as Record<string, unknown>).order_id === "o2" && eq((insertedRow as Record<string, unknown>).offered, ["cod", "vodafone_cash"]) && (insertedRow as Record<string, unknown>).chosen === "vodafone_cash");
// a throwing insert (dup / table absent) must be swallowed, never rethrown.
const insertThrowDb = { from: () => ({ insert: async () => { throw new Error("duplicate key"); } }) } as unknown as SupabaseClient;
let swallowed = true;
try { await recordPaymentSnapshot(insertThrowDb, { orderId: "o3", restaurantId: "r3", offered: ["cod"], chosen: "cod", featureFlags: ON }); } catch { swallowed = false; }
ok("★ snapshot write NEVER throws into the order path (swallows dup/absent)", swallowed);

// Static immutability proof: the 0084 table is write-once by design.
const mig = readFileSync(`${process.cwd()}/supabase/migrations/0084_payment_methods.sql`, "utf8");
ok("★ snapshot immutable: order_id is the PRIMARY KEY (one snapshot per order)", /order_id uuid primary key/i.test(mig));
ok("★ snapshot immutable: a BEFORE UPDATE trigger blocks rewrites", /before update on public\.order_payment_snapshot/i.test(mig) && /raise exception/i.test(mig));
ok("migration is PREPARE-ONLY (not applied to prod, additive)", /PREPARE-ONLY/.test(mig) && /if not exists/i.test(mig));
ok("backfill turns implicit defaults into explicit rows", /insert into public\.restaurant_payment_methods/i.test(mig) && /from public\.restaurants/i.test(mig));

console.log(`\nPAYMENT-RESOLVER UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
