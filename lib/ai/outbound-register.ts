// ============================================================================
// MaitreAI — WO-LEAKGUARD (PART A): the OUTBOUND REGISTER GUARD.
//
// PURE (no I/O, no model calls). Production, DB-proven (Wesaya, 22:07): a
// finalize validation failure surfaced its INTERNAL guidance string VERBATIM to
// the customer — «… اطلب من العميل العنوان الكامل … ثم استدعِ set_delivery_address.»
// That text is written for the MODEL, not the customer: it names a tool, issues a
// model directive, and reads as a system instruction. It must never ship.
//
// isCustomerSafeText(text) is the deterministic register check: a candidate
// outbound is UNSAFE when it carries any of —
//   (1) a TOOL IDENTIFIER — derived from the live tool registry (never a hardcoded
//       copy), so a renamed/added tool is covered automatically;
//   (2) a MODEL-DIRECTIVE pattern — «استدعِ», «قم باستدعاء», «اطلب من العميل»,
//       "call the tool", "tool_use", or a JSON object of tool arguments;
//   (3) a raw STACK/ERROR marker — "Error:", "TypeError", "at lib/".
// None of these ever legitimately appears in an Arabic customer reply, so the
// check is false-positive-safe by construction (the tokens are snake_case
// identifiers, model imperatives, and stack markers — not customer vocabulary).
//
// The single assembler (reply-compose.ts) runs this as its LAST unconditional
// stage and REPLACES (never partially patches) a rejected reply with a frozen
// honest fallback, logging the rejected text to signals (never sent).
// ============================================================================

import { ORDER_TOOLS } from "./tools";

/** The live tool-identifier set, derived from the actual registry (ORDER_TOOLS is
 *  the superset; NON_ORDER_TOOLS is a filtered subset of it). Deriving it here means
 *  a renamed or newly-added tool is guarded automatically — no hardcoded duplicate. */
export const TOOL_IDENTIFIERS: readonly string[] = ORDER_TOOLS.map((t) => t.name);

/** Model-directive patterns: text written to steer the MODEL, not talk to the
 *  customer. «استدع…» (call/invoke, covers استدعِ/استدعاء/استدعي), «قم باستدعاء»,
 *  «اطلب من العميل» (instruct-the-model framing), the English "call the tool",
 *  the raw "tool_use" block name, and a JSON object of tool arguments («{"key":»). */
const MODEL_DIRECTIVE_RES: readonly RegExp[] = [
  /استدع/u, // استدعِ / استدعاء / استدعي — "invoke/call"
  /قم\s+باستدعاء/u,
  /اطلب\s+من\s+العميل/u, // "ask the customer …" — a directive ABOUT the customer, never TO them
  /call\s+the\s+tool/iu,
  /tool_use/iu,
  /\{\s*"[^"]+"\s*:/u, // a JSON object literal carrying tool arguments
];

/** Raw stack / error markers — internal fault text that must never reach a customer. */
const ERROR_MARKER_RES: readonly RegExp[] = [
  /Error:/u,
  /\bTypeError\b/u,
  /\bat\s+lib\//u,
];

export type RegisterBlockKind = "tool_identifier" | "model_directive" | "error_marker";

export interface RegisterVerdict {
  safe: boolean;
  /** The class of the first violation found (undefined when safe). */
  kind?: RegisterBlockKind;
  /** The exact token/marker matched (for the audit signal; never sent). */
  matched?: string;
}

/** Inspect a candidate outbound and report the first register violation, if any.
 *  Order: tool identifiers → model directives → error markers. Deterministic. */
export function inspectOutbound(text: string | null | undefined): RegisterVerdict {
  const s = String(text ?? "");
  if (!s.trim()) return { safe: true };

  for (const id of TOOL_IDENTIFIERS) {
    if (s.includes(id)) return { safe: false, kind: "tool_identifier", matched: id };
  }
  for (const re of MODEL_DIRECTIVE_RES) {
    const m = re.exec(s);
    if (m) return { safe: false, kind: "model_directive", matched: m[0] };
  }
  for (const re of ERROR_MARKER_RES) {
    const m = re.exec(s);
    if (m) return { safe: false, kind: "error_marker", matched: m[0] };
  }
  return { safe: true };
}

/** True when `text` is safe to send to a customer (carries no tool identifier,
 *  model directive, or raw error marker). The WO-named entry point. */
export function isCustomerSafeText(text: string | null | undefined): boolean {
  return inspectOutbound(text).safe;
}
