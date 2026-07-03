// WO-3a unit tests for the Moyasar adapter (flag-gated-OFF, branch-only).
//   • toHalalas: SAR→integer-halalas single-site conversion — STRICT (rejects
//     >2-decimal inputs; tolerates only IEEE-754 float noise on real 2dp values).
//   • mapMoyasarStatus: Moyasar→internal status table, incl. fail-closed default.
//   • flag-OFF inertness: isFeatureExplicitlyEnabled("psp_payments", …) is the
//     EXACT predicate createMoyasarSession checks first (returning psp_disabled
//     before any DB access). We test that predicate directly — create-session.ts
//     is `server-only` and imports `@/`-aliased collaborators, so it is not
//     node-loaded here (same boundary as test-order-pricing: pure/gate logic is
//     unit-tested, server wiring is verified by tsc + review).
// Run: node --experimental-strip-types scripts/test-moyasar-adapter.test.ts
import { toHalalas, mapMoyasarStatus } from "../lib/payments/providers/moyasar.ts";
import { isFeatureExplicitlyEnabled } from "../lib/tenant/tier.ts";

let pass = 0, fail = 0;
const eq = (n: string, actual: unknown, expected: unknown) => {
  if (actual === expected) pass++;
  else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
};
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const throws = (n: string, fn: () => unknown, includes: string) => {
  try { fn(); fail++; console.log(`  ❌ ${n}: expected throw containing "${includes}", got none`); }
  catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes(includes)) pass++;
    else { fail++; console.log(`  ❌ ${n}: threw "${m}", expected to contain "${includes}"`); }
  }
};

// ── 1. toHalalas — exact whole/typical conversions ────────────────────────────
eq("0 SAR → 0 halalas", toHalalas(0), 0);
eq("0.01 SAR → 1 halala", toHalalas(0.01), 1);
eq("15 SAR → 1500 halalas", toHalalas(15), 1500);
eq("100 SAR → 10000 halalas", toHalalas(100), 10000);
eq("199.99 SAR → 19999 halalas", toHalalas(199.99), 19999);
eq("1,000,000 SAR → 100,000,000 halalas", toHalalas(1_000_000), 100_000_000);

// ── 2. sub-halala precision (>2 decimals) is REJECTED, not silently rounded ────
// (strict contract: silently rounding a mis-priced amount could change the charge)
throws("0.005 rejected", () => toHalalas(0.005), "not representable");
throws("1.005 rejected", () => toHalalas(1.005), "not representable");
throws("2.675 rejected", () => toHalalas(2.675), "not representable");
throws("10.005 rejected", () => toHalalas(10.005), "not representable");
throws("12.345 rejected", () => toHalalas(12.345), "not representable");
// …but a legit 2-dp value carrying only IEEE-754 float NOISE still passes:
eq("(0.1+0.2) → 30 (float 0.30000…4 is really 0.30)", toHalalas(0.1 + 0.2), 30);
eq("8.87 → 887 (float 886.9999… tolerated)", toHalalas(8.87), 887);
eq("4.35 → 435 (float 434.9999… tolerated)", toHalalas(4.35), 435);
eq("99999999.99 → 9999999999 (max numeric(10,2), float error < 1e-4)", toHalalas(99999999.99), 9999999999);

// ── 3. round-trip guard holds for every clean 2-dp amount (no false throws) ────
{
  let clean = true;
  for (let h = 0; h <= 5000; h++) {
    if (toHalalas(h / 100) !== h) { clean = false; break; }
  }
  ok("round-trip: toHalalas(h/100) === h for h in 0..5000", clean);
}

// ── 4. toHalalas — invalid inputs throw (never charge a wrong value) ──────────
throws("negative throws", () => toHalalas(-1), ">= 0");
throws("NaN throws", () => toHalalas(NaN), "finite");
throws("Infinity throws", () => toHalalas(Infinity), "finite");
throws("non-number throws", () => toHalalas("5" as unknown as number), "finite number");

// ── 5. mapMoyasarStatus — full table + normalization + fail-closed default ─────
eq("initiated → created", mapMoyasarStatus("initiated"), "created");
eq("authorized → opened", mapMoyasarStatus("authorized"), "opened");
eq("captured → paid", mapMoyasarStatus("captured"), "paid");
eq("paid → paid", mapMoyasarStatus("paid"), "paid");
eq("failed → failed", mapMoyasarStatus("failed"), "failed");
eq("refunded → refunded", mapMoyasarStatus("refunded"), "refunded");
eq("voided → cancelled", mapMoyasarStatus("voided"), "cancelled");
eq("canceled (Moyasar spelling) → cancelled", mapMoyasarStatus("canceled"), "cancelled");
eq("cancelled → cancelled", mapMoyasarStatus("cancelled"), "cancelled");
eq("expired → expired", mapMoyasarStatus("expired"), "expired");
eq("uppercase PAID normalized → paid", mapMoyasarStatus("PAID"), "paid");
eq("whitespace ' paid ' normalized → paid", mapMoyasarStatus("  paid  "), "paid");
eq("unknown status → failed (fail-closed)", mapMoyasarStatus("some_new_status"), "failed");
eq("empty → failed", mapMoyasarStatus(""), "failed");
eq("null → failed", mapMoyasarStatus(null), "failed");
eq("undefined → failed", mapMoyasarStatus(undefined), "failed");

// ── 6. flag-OFF inertness — the gate createMoyasarSession checks FIRST ─────────
// createMoyasarSession's very first line is:
//   if (!isFeatureExplicitlyEnabled("psp_payments", flags)) return psp_disabled;
// so its inertness is exactly this predicate's behavior. Default-OFF: only an
// explicit boolean `true` enables it — absent/null/false/non-boolean stay OFF,
// which is why Wesaya (no such flag) can never reach a psp_* read.
const G = (flags: Record<string, unknown> | null | undefined) => isFeatureExplicitlyEnabled("psp_payments", flags);
eq("flag absent {} → OFF", G({}), false);
eq("flag null → OFF", G(null), false);
eq("flag undefined → OFF", G(undefined), false);
eq("flag explicitly false → OFF", G({ psp_payments: false }), false);
eq("flag non-boolean 'true' → OFF (strict === true)", G({ psp_payments: "true" }), false);
eq("flag 1 → OFF (strict === true)", G({ psp_payments: 1 }), false);
eq("unrelated flag on, psp absent → OFF", G({ some_other_flag: true }), false);
eq("flag explicitly true → ON", G({ psp_payments: true }), true);

console.log(`\nMOYASAR-ADAPTER UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
