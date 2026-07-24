// ============================================================================
// WO-EVIDENCE-1 — REPRODUCTION of the watermark-degradation defect.
//
// Defect site: lib/messaging/respond-and-send.ts:1229-1237 (comment at :1237):
//   let coalescingActive = false;
//   if (coalescingOn) {
//     const { data: wmRow, error: wmErr } = await admin
//       .from("conversations").select("last_answered_inbound_at").eq("id", …).maybeSingle();
//     if (!wmErr) { coalescingActive = true; … }
//     // wmErr (0085 not applied / transient) → coalescingActive stays false → single-message.
//   }
//   const coalesced = coalesceInbound(rows, { enabled: coalescingActive, watermarkMs });
//
// So even with the flag ON (inbound_coalescing:true in the committed production vector),
// a TRANSIENT database error on the watermark read leaves coalescingActive=false, which
// drives coalesceInbound down the SAME lossy newest-row-only path as C-04. A transient DB
// error silently degrades safety-relevant assembly to the lossy path.
//
// respond-and-send.ts is Codex-exclusive and is a large async orchestration doing live DB
// I/O and WhatsApp sends — it cannot be imported and executed in isolation. So this test:
//   (1) transcribes the ONLY decision under test — the wmErr → coalescingActive branch —
//       VERBATIM from the citation above (a faithful reproduction of the observable logic), and
//   (2) drives the REAL coalesceInbound (imported read-only, NOT modified) with the result.
// Together they reproduce the end-to-end degradation. The flag is the UNMODIFIED production
// vector; the injected condition (a transient watermark error) is named in the test title.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types --test scripts/proof-watermark-degrade.test.ts
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { coalesceInbound, type CoalesceRow } from "../lib/messaging/inbound-coalescing.ts";
import { detectAllergyOrDiseaseMention } from "../lib/ai/allergy-simple.ts";
import { wesayaProductionFlags } from "./fixtures/wesaya-production-flags.ts";

const BROKEN = "CURRENT-BROKEN-BEHAVIOR: reproduces a defect; this is not intended behavior.";

// Faithful transcription of respond-and-send.ts:1230-1237 — the ONLY logic under test.
// A watermark read that returns an error leaves coalescingActive false; a success sets it
// true. `coalescingOn` is the feature flag (inbound_coalescing).
function coalescingActiveFromWatermarkRead(
  coalescingOn: boolean,
  watermarkRead: { data: { last_answered_inbound_at?: string | null } | null; error: unknown },
): { coalescingActive: boolean; watermarkMs: number | null } {
  let watermarkMs: number | null = null;
  let coalescingActive = false;
  if (coalescingOn) {
    const { data: wmRow, error: wmErr } = watermarkRead;
    if (!wmErr) {
      coalescingActive = true;
      const wm = wmRow?.last_answered_inbound_at ?? null;
      watermarkMs = wm ? Date.parse(wm) : null;
    }
    // wmErr (0085 not applied / transient) → coalescingActive stays false → single-message.
  }
  return { coalescingActive, watermarkMs };
}

const DISCLOSURE = "عندي حساسية من الفول السوداني";
const FOLLOWUP = "تمام كده";
const burst: CoalesceRow[] = [
  { sender: "customer", text: DISCLOSURE, created_at: "2026-07-24T10:00:00.000Z", meta: null },
  { sender: "customer", text: FOLLOWUP, created_at: "2026-07-24T10:00:03.000Z", meta: null },
];

test("watermark [flags: inbound_coalescing:true, injected transient wmErr] degrades to the lossy path — " + BROKEN, () => {
  // Flag is ON — the intended, protected configuration.
  const flags = wesayaProductionFlags(); // UNMODIFIED production vector
  assert.equal(flags.inbound_coalescing, true, "coalescing flag is ON in production");

  // A transient DB error on the watermark read (e.g. migration 0085 not applied, or a blip).
  const transientRead = { data: null, error: { code: "42703", message: "column does not exist / transient" } };
  const { coalescingActive, watermarkMs } = coalescingActiveFromWatermarkRead(true, transientRead);

  // THE DEFECT: flag ON, yet the transient error leaves coalescing INACTIVE.
  assert.equal(coalescingActive, false, BROKEN + " a transient watermark error leaves coalescing inactive despite the flag being ON");

  // …which drives the REAL coalesceInbound down the newest-row-only path → the disclosure is lost.
  const out = coalesceInbound(burst, { enabled: coalescingActive, watermarkMs });
  assert.ok(out, "a customer message exists");
  assert.equal(out!.mergedText, FOLLOWUP, BROKEN + " degraded assembly keeps only the newest row");
  assert.ok(!out!.mergedText.includes("حساسية"), BROKEN + " the earlier disclosure is dropped");
  assert.equal(
    detectAllergyOrDiseaseMention(out!.mergedText).fired,
    false,
    BROKEN + " a transient DB error silently degraded safety-relevant assembly to the lossy path",
  );
});

test("watermark contrast [flags: inbound_coalescing:true, watermark read SUCCEEDS] stays on the safe path", () => {
  const flags = wesayaProductionFlags();
  assert.equal(flags.inbound_coalescing, true);

  // A successful watermark read (no error) → coalescing active.
  const okRead = { data: { last_answered_inbound_at: null }, error: null };
  const { coalescingActive, watermarkMs } = coalescingActiveFromWatermarkRead(true, okRead);
  assert.equal(coalescingActive, true, "successful read → coalescing active");

  const out = coalesceInbound(burst, { enabled: coalescingActive, watermarkMs });
  assert.ok(out, "a customer message exists");
  assert.ok(out!.mergedText.includes(DISCLOSURE), "the disclosure survives on the active path");
  assert.equal(detectAllergyOrDiseaseMention(out!.mergedText).fired, true, "the detector still fires — no loss when the read succeeds");
});
