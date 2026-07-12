// ============================================================================
// MaitreAI — zone editor shared constants. PURE + leaflet-free ON PURPOSE.
//
// ZoneMapCanvas imports `leaflet` and calls L.divIcon(...) at module top-level,
// which touches `window` the instant the module is evaluated. So ANY static import
// from ZoneMapCanvas — even for a plain constant — pulls Leaflet into the server
// bundle and crashes SSR with "ReferenceError: window is not defined" (the
// intermittent 500 on GET /c/settings). The map component itself is loaded
// client-only via next/dynamic ssr:false; this file exists so the constants it
// shares with ZoneMapEditor can be imported on the server WITHOUT that side effect.
// ============================================================================

/** Default map camera: الرياض (KSA) — a sane starting center when a zone has none yet. */
export const DEFAULT_CENTER = { lat: 24.7136, lng: 46.6753 };
