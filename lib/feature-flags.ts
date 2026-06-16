// ============================================================================
// MaitreAI — feature flags (code-only; ship hidden by default, flip + redeploy
// to enable). No secrets here. These gate operator-facing surfaces we want to
// keep in the tree but out of the UI until they're ready.
// ============================================================================

// ENABLE_ADMIN_CHAT_CONSOLE — the operator-side in-app admin chat surface: the
// «الرئيسية» Maître console (free-text → /api/agent/admin, with READ access to the
// Restaurant Brain) plus the in-chat promotion builder. Hidden during the early
// order-engine upgrade (Step 0); UNHIDDEN now (Learning System Piece 1) since the
// owner agent is the surface the brain serves. Still flag-controlled: set the env
// var to "false" (and redeploy) to hide it again. Default ON.
export const ENABLE_ADMIN_CHAT_CONSOLE =
  process.env.NEXT_PUBLIC_ENABLE_ADMIN_CHAT_CONSOLE !== "false";

// The operator's landing route after login. When the admin chat console is
// hidden, «الرئيسية»/dashboard is not a destination, so we land on المحادثات
// (the operator's primary working surface) instead.
export const HOME_HREF = ENABLE_ADMIN_CHAT_CONSOLE ? "/dashboard" : "/conversations";
