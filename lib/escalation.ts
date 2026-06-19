// ============================================================================
// MaitreAI — Escalation predicate (single source of truth).
// The operator "needs attention" escalation count shown in the chrome — the
// dashboard «محتاجك دلوقتي» KPI, the sidebar/topbar badges, and the pulse strip —
// must all agree. A conversation counts as escalated when a human owns it OR its
// status flags intervention. Keeping this in one place prevents the four call
// sites from drifting. (The conversations page's per-row badges intentionally
// distinguish «يحتاج تدخل» (status) from «مع موظف» (owner) and are NOT this.)
// ============================================================================

import type { Conversation } from "./types";

type EscalatableConversation = Pick<Conversation, "owner" | "status">;

export function isEscalated(c: EscalatableConversation): boolean {
  return c.owner === "human" || c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف";
}

export function countEscalations(conversations: EscalatableConversation[]): number {
  return conversations.filter(isEscalated).length;
}
