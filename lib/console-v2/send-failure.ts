// ============================================================================
// MaitreAI — console send-failure → honest message key (pure).
//
// FR-005: when an operator's free-form reply can't leave the building, the console
// used to show one generic "couldn't send". The /api/whatsapp/send route already
// distinguishes the WhatsApp 24-hour customer-care window (code "outside_24h_window")
// from a generic failure — so the console should tell the honest story: outside the
// window, free-form replies are simply not allowed (a template is needed), which is
// not a "try again" situation. This maps the route's code → the dictionary key so
// the mapping is unit-testable and never drifts from the wire contract.
// ============================================================================

import type { DictKey } from "@/lib/i18n/dictionary";

/** The honest operator-facing message key for a send-failure `code` from the
 *  /api/whatsapp/send route. The 24h-window case gets its own specific line;
 *  everything else (and an absent code) falls back to the generic retry message. */
export function sendFailureMessageKey(code?: string | null): DictKey {
  return code === "outside_24h_window" ? "conv.sendError.outside24h" : "conv.sendError";
}
