// ============================================================================
// WO-QZ-PRINT proof harness — printer-config parse + the silent-print DECISION
// (pure). Covers: parse normalization (width fallback, name trim, strict
// auto_print), isPrinterConfigured, and shouldSilentPrint's AND of
// flag/printer/auto_print. The load-bearing invariant: silent print requires ALL
// three; anything missing → false → the caller uses the always-available browser
// dialog. Run: node --experimental-strip-types scripts/proof-printer.test.ts
// ============================================================================

import {
  parsePrinterConfig, isPrinterConfigured, shouldSilentPrint, DEFAULT_PRINTER_CONFIG,
} from "../lib/print/printer-config.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } }

// ---- parse normalization ----------------------------------------------------
check("null → default", JSON.stringify(parsePrinterConfig(null)) === JSON.stringify(DEFAULT_PRINTER_CONFIG));
check("array → default", JSON.stringify(parsePrinterConfig([])) === JSON.stringify(DEFAULT_PRINTER_CONFIG));
check("name trimmed", parsePrinterConfig({ name: "  Epson TM  " }).name === "Epson TM");
check("non-string name → ''", parsePrinterConfig({ name: 5 }).name === "");
check("unknown width → 80mm fallback", parsePrinterConfig({ width: "A4" }).width === "80mm");
check("58mm preserved", parsePrinterConfig({ width: "58mm" }).width === "58mm");
check("auto_print strict true", parsePrinterConfig({ auto_print: true }).auto_print === true);
check("auto_print truthy-nonbool → false", parsePrinterConfig({ auto_print: 1 }).auto_print === false);

// ---- isPrinterConfigured ----------------------------------------------------
check("named printer → configured", isPrinterConfigured({ name: "TM-T20", width: "80mm", auto_print: true }));
check("blank name → not configured", !isPrinterConfigured({ name: "   ", width: "80mm", auto_print: true }));
check("null → not configured", !isPrinterConfigured(null));

// ---- shouldSilentPrint (AND of flag + printer + auto_print) -----------------
const CFG = { name: "TM-T20", width: "80mm" as const, auto_print: true };
check("flag on + printer + auto_print → silent",
  shouldSilentPrint({ flagOn: true, config: CFG }) === true);
check("flag OFF → browser (no silent) even if configured",
  shouldSilentPrint({ flagOn: false, config: CFG }) === false);
check("no printer name → browser",
  shouldSilentPrint({ flagOn: true, config: { name: "", width: "80mm", auto_print: true } }) === false);
check("auto_print false → browser (manager wants the dialog)",
  shouldSilentPrint({ flagOn: true, config: { ...CFG, auto_print: false } }) === false);
check("null config → browser",
  shouldSilentPrint({ flagOn: true, config: null }) === false);

console.log(`\nQZ-PRINT PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
