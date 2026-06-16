// ============================================================================
// MaitreAI — feature flags (code-only; ship hidden by default, flip + redeploy
// to enable). No secrets here. These gate operator-facing surfaces we want to
// keep in the tree but out of the UI until they're ready.
// ============================================================================

// ENABLE_ADMIN_CHAT_CONSOLE — the operator-side in-app admin chat surface: the
// «الرئيسية» Maître console (free-text → /api/agent/admin) plus the in-chat
// promotion builder. HIDDEN by default for the order-engine upgrade. All of its
// code, routes, and logic remain intact; set the env var below to "true" (and
// redeploy) to bring it back with a single change.
export const ENABLE_ADMIN_CHAT_CONSOLE =
  process.env.NEXT_PUBLIC_ENABLE_ADMIN_CHAT_CONSOLE === "true";

// The operator's landing route after login. When the admin chat console is
// hidden, «الرئيسية»/dashboard is not a destination, so we land on المحادثات
// (the operator's primary working surface) instead.
export const HOME_HREF = ENABLE_ADMIN_CHAT_CONSOLE ? "/dashboard" : "/conversations";
