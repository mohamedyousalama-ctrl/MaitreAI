// ============================================================================
// WO-EVIDENCE-1 — REPRODUCTION of the narrowed C-04 disclosure-loss defect.
//
// Auditor wording: "An earlier disclosure can be lost when coalescing is disabled or
// silently degraded and multiple rows exist before assembly."
//
// Defect site: lib/messaging/inbound-coalescing.ts:79-87 — when opts.enabled is false,
// coalesceInbound selects ONLY the newest customer row (`customers[customers.length-1]`)
// and sets mergedText to that row's text alone. Any earlier row in the burst — including
// an allergy disclosure — is silently dropped before the safety gate ever sees it.
//
// This test DRIVES THE REAL coalesceInbound (imported read-only; NOT modified) and shows
// the loss, then shows the safety consequence: the composed ingress detector fires on the
// dropped disclosure but NOT on the assembled turn. Contrast case (enabled:true) proves
// it is specifically the disabled/degraded path that loses it.
//
// Flags: the committed production vector with the ONE override named in the title.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types --test scripts/proof-c04-coalescing-loss.test.ts
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { coalesceInbound, type CoalesceRow } from "../lib/messaging/inbound-coalescing.ts";
import { detectAllergyOrDiseaseMention } from "../lib/ai/allergy-simple.ts";
import { wesayaProductionFlags } from "./fixtures/wesaya-production-flags.ts";

const BROKEN = "CURRENT-BROKEN-BEHAVIOR: reproduces a defect; this is not intended behavior.";

// A two-message burst: the OLDER message carries the allergy disclosure; the NEWER is a
// benign follow-up. Chronological order (oldest → newest), as coalesceInbound expects.
const DISCLOSURE = "عندي حساسية من الفول السوداني"; // "I have a peanut allergy"
const FOLLOWUP = "تمام كده"; // "ok then"
const burst: CoalesceRow[] = [
  { sender: "customer", text: DISCLOSURE, created_at: "2026-07-24T10:00:00.000Z", meta: null },
  { sender: "customer", text: FOLLOWUP, created_at: "2026-07-24T10:00:03.000Z", meta: null },
];

test("C-04 [flags: inbound_coalescing:false] disabled coalescing drops the earlier disclosure — " + BROKEN, () => {
  // The production flag vector with coalescing turned OFF (the "disabled" arm of C-04).
  const flags = wesayaProductionFlags({ inbound_coalescing: false });
  assert.equal(flags.inbound_coalescing, false, "override applied");

  // Sanity: the dropped message really IS a disclosure the ingress detector recognises.
  assert.equal(detectAllergyOrDiseaseMention(DISCLOSURE).fired, true, "the earlier row is a real allergy signal");

  // The real function, driven with enabled:false (mirrors the flag-off path at line 79).
  const out = coalesceInbound(burst, { enabled: false, watermarkMs: null });
  assert.ok(out, "a customer message exists");

  // THE DEFECT: only the newest row survives; the disclosure is gone from the assembled turn.
  assert.equal(out!.mergedText, FOLLOWUP, BROKEN + " mergedText is the newest row only");
  assert.ok(!out!.mergedText.includes("حساسية"), BROKEN + " the earlier disclosure text is absent");
  // Safety consequence: the gate now sees a burst with NO allergy signal.
  assert.equal(
    detectAllergyOrDiseaseMention(out!.mergedText).fired,
    false,
    BROKEN + " the composed detector no longer fires on the assembled turn — silent loss",
  );
});

test("C-04 contrast [flags: inbound_coalescing:true] enabled coalescing PRESERVES the disclosure (intended path)", () => {
  const flags = wesayaProductionFlags(); // unmodified production vector — coalescing ON
  assert.equal(flags.inbound_coalescing, true);

  const out = coalesceInbound(burst, { enabled: true, watermarkMs: null });
  assert.ok(out, "a customer message exists");
  // The enabled path joins the whole burst chronologically → the disclosure survives.
  assert.ok(out!.mergedText.includes(DISCLOSURE), "the disclosure is retained in the merged turn");
  assert.equal(out!.count, 2, "both messages merged");
  assert.equal(
    detectAllergyOrDiseaseMention(out!.mergedText).fired,
    true,
    "the detector still fires on the assembled turn — no loss on the intended path",
  );
});
