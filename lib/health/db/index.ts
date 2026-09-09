// ============================================================================
// فيصل / Faysal — the data layer's public surface.
//
// Everything under `lib/health/db/*` is thin, typed and stateless: one query
// per function, a Supabase client passed in, rows out. No business rule lives
// here. `bookableWindows()`, routing, `quote()`, the hold/confirm choreography
// and every safety rail belong to the domain layer, which reads these rows.
//
// The seam that matters (SPEC-3 §1.3): every table is `health_*`, every scope
// column is `clinic_id`, and no Kivo table is reachable from this directory.
// ============================================================================

export * from "./types";
export * from "./client";
export * from "./clinics";
export * from "./sites";
export * from "./catalogue";
export * from "./doctors";
export * from "./slots";
export * from "./booking";
export * from "./conversations";
