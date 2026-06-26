// ============================================================================
// MaitreAI — Host → tenant routing map (Phase 6, subdomain split).
// Maps a request hostname to what should be served there. HARDCODED for the
// single launch client (Wesaya); extend the map to add more.
//
// FUTURE (scalable path): replace this constant map with a per-restaurant
// `domain` column in the DB (restaurants.domain) resolved in middleware, so new
// tenants self-onboard their subdomain without a code change. This map is the
// temporary bridge until that exists.
//
// Pure data + tiny helpers — safe to import from middleware (no Node-only deps).
// ============================================================================

export type HostMapping =
  | { kind: "storefront"; slug: string } // public customer storefront for a tenant
  | { kind: "operator"; restaurantId?: string }; // the normal login-gated operator app; restaurantId pins the console to a specific tenant

export const HOST_MAP: Record<string, HostMapping> = {
  "wesayachicken.com": { kind: "storefront", slug: "wesaya" },
  "www.wesayachicken.com": { kind: "storefront", slug: "wesaya" },
  "order.wesayachicken.com": { kind: "storefront", slug: "wesaya" },
  "app.wesayachicken.com": { kind: "storefront", slug: "wesaya" },
  "console.wesayachicken.com": { kind: "operator", restaurantId: "5acbc72f-def3-46cd-ad6c-bf0ff4a23642" },
};

/** Normalize a Host header (strip port, lowercase) and look up its mapping. */
export function hostMapping(host: string | null | undefined): HostMapping | null {
  if (!host) return null;
  const h = host.split(":")[0].trim().toLowerCase();
  return HOST_MAP[h] ?? null;
}

/** The storefront slug a host serves at "/", or null if the host isn't a storefront host. */
export function storefrontSlugForHost(host: string | null | undefined): string | null {
  const m = hostMapping(host);
  return m && m.kind === "storefront" ? m.slug : null;
}
