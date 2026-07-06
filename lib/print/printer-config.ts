// ============================================================================
// Kivo (KSA) — WO-QZ-PRINT: printer_config parse + the silent-print DECISION.
//
// Pure (no imports) so it is node strip-types-testable and shared by the route,
// the client, and the harness. The QZ path is ALWAYS optional: silent printing
// happens only when the flag is on AND a printer is named AND auto_print is set;
// otherwise the caller falls back to the browser print dialog, which is always
// available. There is no path where a missing/misconfigured printer blocks a
// print — the kitchen getting its ticket is never gated on QZ.
// ============================================================================

export type PrintWidth = "58mm" | "80mm";
export const PRINT_WIDTHS: readonly PrintWidth[] = ["58mm", "80mm"];

export interface PrinterConfig {
  /** The QZ Tray printer name to target (as QZ reports it). Empty = not chosen. */
  name: string;
  width: PrintWidth;
  /** When true, a configured printer prints silently without the browser dialog. */
  auto_print: boolean;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = { name: "", width: "80mm", auto_print: false };

function asWidth(v: unknown): PrintWidth {
  return (PRINT_WIDTHS as readonly string[]).includes(String(v)) ? (v as PrintWidth) : "80mm";
}

/**
 * Normalize a stored/incoming printer_config into a safe PrinterConfig. Unknown
 * widths fall back to 80mm; a non-string name becomes ""; auto_print is strict
 * boolean. Never throws — a malformed row degrades to the default, which the
 * decision below treats as "no silent print" (browser fallback).
 */
export function parsePrinterConfig(input: unknown): PrinterConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ...DEFAULT_PRINTER_CONFIG };
  const o = input as Record<string, unknown>;
  return {
    name: typeof o.name === "string" ? o.name.trim() : "",
    width: asWidth(o.width),
    auto_print: o.auto_print === true,
  };
}

/** True iff the config names a printer (silent print needs a concrete target). */
export function isPrinterConfigured(c: PrinterConfig | null | undefined): boolean {
  return !!c && typeof c.name === "string" && c.name.trim().length > 0;
}

/**
 * The load-bearing decision: should we attempt a SILENT QZ print for this ticket?
 * Requires ALL of: the qz_print flag ON, a named printer, and auto_print true.
 * Anything false → the caller uses the browser print dialog (always available).
 * Note: even when this returns true, the client still falls back to the browser
 * dialog if QZ isn't actually connected — this decides intent, not availability.
 */
export function shouldSilentPrint(args: {
  flagOn: boolean;
  config: PrinterConfig | null | undefined;
}): boolean {
  return args.flagOn === true && isPrinterConfigured(args.config) && args.config!.auto_print === true;
}
