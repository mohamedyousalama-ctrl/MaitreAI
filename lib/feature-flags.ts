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

// CONSOLE_V2 — the whole new operator console (console_v2). This one flag gates
// the entire new UI: the one-rail app shell, the display-state-driven pages, and
// everything under app/(console-v2). DEFAULT OFF — the old console (app/(console))
// stays the live, untouched surface until console_v2 is flipped on per tenant
// (New-UI-Only law: the old console dies only when this turns on). Code-only flag;
// set NEXT_PUBLIC_CONSOLE_V2="true" and redeploy to reveal the new UI. Read on both
// server and client so a route group can notFound() itself when off and the rail
// never links into an unreachable surface.
export const CONSOLE_V2 =
  process.env.NEXT_PUBLIC_CONSOLE_V2 === "true";

// ENABLE_DELIVERY_TRACKING — the delivery dispatch + driver flow + customer
// tracking module (drivers, deliveries, /d/<token> driver page, /t/<token>
// tracking page, operator deliveries view). ON by default: the «التوصيل» nav
// item and /deliveries page render for managers (manual driver assignment +
// end-of-shift cash settlement; no live GPS map). Set the env var explicitly to
// "false" (and redeploy) to make the whole module inert again. Client + server.
export const ENABLE_DELIVERY_TRACKING =
  process.env.NEXT_PUBLIC_ENABLE_DELIVERY_TRACKING !== "false";
