// ============================================================================
// MaitreAI — feature flags (code-only; ship hidden by default, flip + redeploy
// to enable). No secrets here. These gate operator-facing surfaces we want to
// keep in the tree but out of the UI until they're ready.
// ============================================================================

// ENABLE_DELIVERY_TRACKING — the delivery dispatch + driver flow + live customer
// tracking module (drivers, deliveries, /d/<token> driver page, /t/<token>
// tracking page, operator deliveries view). HIDDEN by default: every surface and
// the finalize→deliveries hook check this flag, so with it off the module is
// fully inert and existing flows are unchanged. Set the env var to "true" (and
// redeploy) to turn the whole module on. Readable on client + server.
export const ENABLE_DELIVERY_TRACKING =
  process.env.NEXT_PUBLIC_ENABLE_DELIVERY_TRACKING === "true";
