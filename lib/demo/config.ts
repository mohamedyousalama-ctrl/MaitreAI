// ============================================================================
// Kivo — public Khalid demo configuration. Pure data + one predicate, so the
// route, the page and the proof test all read the SAME values.
// ============================================================================

/**
 * The synthetic tenant the demo talks to. PINNED — never accepted from a request.
 *
 * «مطعم الديرة (تجريبي)» — a seeded test restaurant with `khalid_persona` on and
 * `khalid_region: najd`, so the visitor meets the real Saudi Khalid. It is not a
 * real client: no live orders, no real customer data, and its menu is synthetic.
 */
export const DEMO_RESTAURANT_ID = "0de3c0de-0002-4a00-8a00-000000000002";

/**
 * Per-message character cap, applied to the message AND to every history entry.
 *
 * This is the spend control, not a UX nicety. Uncapped input on a public endpoint
 * is a denial-of-wallet: respond.ts allows up to MAX_ITERATIONS = 6 model calls
 * per request, so one crafted request can drive six passes over an attacker-chosen
 * context. 500 characters is far above any real customer order and far below
 * anything expensive.
 */
export const DEMO_MAX_CHARS = 500;

/** Turns of history replayed. Bounds total prompt size together with the char cap. */
export const DEMO_MAX_HISTORY = 10;

/** Per-IP pre-filter. A speed bump — see the route header on why it is not the cap. */
export const DEMO_PER_IP_TURNS = 20;
export const DEMO_WINDOW_MS = 60 * 60 * 1000;

/**
 * THE CAP THAT PROTECTS THE CARD — a global daily ceiling, enforced in the database.
 *
 * A per-IP limit alone is defeated by any number of source addresses, so the global
 * ceiling is the real control and the per-IP one is courtesy. Measured turns on the
 * demo tenant cost ~$0.0021, so 2,000 turns bounds a worst day at roughly $4. That is
 * also far more conversation than a successful demo will ever see: if this cap is ever
 * genuinely reached by real interest, that is a good problem and a deliberate raise.
 */
export const DEMO_GLOBAL_DAILY_TURNS = 2000;

/** UTC day bucket for the global cap: `global:YYYY-MM-DD`. */
export function globalBucket(now: Date = new Date()): string {
  return `global:${now.toISOString().slice(0, 10)}`;
}

/** UTC hour bucket for the per-IP cap: `ip:<addr>:YYYY-MM-DDTHH`. */
export function ipBucket(ip: string, now: Date = new Date()): string {
  return `ip:${ip}:${now.toISOString().slice(0, 13)}`;
}

/**
 * Hosts the demo answers on. Anything else 404s.
 *
 * `www.getkivo.io` is already a production domain on the Vercel project and is
 * verified publicly reachable with no login, so the demo needs no DNS change and
 * no deployment-protection change to be shareable. `maitre-ai.vercel.app` is the
 * project's production alias and is likewise public — kept as a fallback link.
 *
 * Deliberately NOT a generated deployment URL (maitre-<hash>-*.vercel.app or a
 * git-branch alias): those ARE challenged by Vercel Authentication, so a link to
 * one would meet a login wall. Never share one.
 */
const DEMO_HOSTS = new Set([
  "www.getkivo.io",
  "getkivo.io",
  "maitre-ai.vercel.app",
  "localhost",
  "127.0.0.1",
]);

/** True when this Host header may serve the demo. Port-stripped, case-insensitive. */
export function isDemoHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return DEMO_HOSTS.has(host.split(":")[0].trim().toLowerCase());
}
