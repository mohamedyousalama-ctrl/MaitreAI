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

// ENABLE_MIZAN_PANEL — the hosted MIZAN reviewer surface: /mizan/<token> where a
// real Saudi reviewer scores Khalid's replies (the 5 human-hook suites) on their
// phone, per-token auth (no login), scores saved server-side to Supabase via the
// token-scoped API route. DEFAULT OFF — the whole surface (page + /api/mizan/*)
// 404s until this is flipped on and redeployed. Standalone review surface: it does
// NOT touch the allergen gate, persona, engine, or any customer-facing turn. Read
// on both server and client so the route can notFound() itself when off. Code-only
// flag; set NEXT_PUBLIC_ENABLE_MIZAN_PANEL="true" (and redeploy) to reveal it.
export const ENABLE_MIZAN_PANEL =
  process.env.NEXT_PUBLIC_ENABLE_MIZAN_PANEL === "true";

// REALTIME_RESUBSCRIBE — the active resubscribe-with-backoff on the console's
// realtime channels (WO-REALTIME-AUTH-REFRESH, PART 2). ON by default: when a
// live channel drops (CHANNEL_ERROR/TIMED_OUT/CLOSED) we tear it down and rebuild
// with exponential backoff (cap 30s) instead of failing quietly. This is the
// kill-switch: set the env var explicitly to "false" (and redeploy) and every one
// of the 8 DB-changes subscriptions reverts to the prior fail-quietly behavior,
// byte-identical to before this WO. PART 1 (setAuth propagation on token refresh)
// is NOT gated by this — it ships unconditionally. Client + server.
export const REALTIME_RESUBSCRIBE =
  process.env.NEXT_PUBLIC_REALTIME_RESUBSCRIBE !== "false";
