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
 * ceiling is the real control and the per-IP one is courtesy.
 *
 * THE ARITHMETIC HAS BEEN WRONG TWICE. Both figures below are now measured against
 * PRODUCTION, not estimated.
 *
 *   v1 said "~$0.0021 a turn, so 2,000 turns bounds a worst day at ~$4". That was a
 *   measured WARM turn, and it stopped being the bound the moment voice shipped: the
 *   voice route consumes the SAME counter but pays twice per slot (Whisper + the LLM).
 *
 *   v2 recomputed to ~$0.019/turn and ~$19/day. Still low. Four real turns through the
 *   live endpoint on 2026-08-28 cost $0.12443 — $0.031 a turn, ~15x the original figure.
 *   The reason is cache economics, not tokens: the demo tenant's system prompt is ~17k
 *   tokens behind one ephemeral cache breakpoint, and on a sporadically-visited sales
 *   page the COLD turn is the normal case, billing at the cache-WRITE rate.
 *
 * So the honest bound at 1,000 turns is roughly $31/day of text, and more with voice.
 * Sustained traffic warms the cache and costs far less per turn, so a genuinely busy day
 * is cheaper per turn than the cold-start tests above — the worst case is "1,000 cold
 * turns", which is unlikely but is what a cap has to survive.
 *
 * Kept at 1,000 deliberately: the ceiling exists to stop an unattended bill, not to
 * ration a demo the Founder is actively sharing, and `demo_controls.enabled` stops
 * everything in seconds without a deploy. Raising it is a deliberate act with the
 * arithmetic above re-run against fresh agent_runs data.
 */
export const DEMO_GLOBAL_DAILY_TURNS = 1000;

/**
 * Hard ceiling on an uploaded voice note.
 *
 * STT bills per MINUTE of audio, so this is a sharper spend lever than the text cap.
 * The previous 2 MB was justified as "comfortably over a minute of speech" — that
 * understated it by several times: MediaRecorder is created with no bitrate hint, and
 * at typical opus rates of 24-64 kbps, 2 MB is 4-11 MINUTES, so the ceiling admitted
 * far more audio than its own justification claimed. 512 KB is ~1-3 minutes, still
 * longer than any real order and bounded by the client's own 60-second auto-stop.
 */
export const DEMO_MAX_AUDIO_BYTES = 512 * 1024;

/** Longest recording the client will make before stopping itself, in seconds. */
export const DEMO_MAX_RECORD_SECONDS = 60;

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

/**
 * Cap an attacker-controlled history array: bounded by COUNT and by LENGTH.
 *
 * Extracted so the text and voice routes cannot drift apart. The voice route
 * originally hardcoded `history: []`, which made the demo stateful for typed
 * turns and stateless for spoken ones — a visitor who typed «أبغى كبسة» and then
 * asked «وزيدها لبن» by voice got an agent with no memory of the kabsa, on the
 * page whose own footnote claims it is «نفس المحرّك».
 */
export function capDemoHistory(raw: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).slice(-DEMO_MAX_HISTORY).flatMap((m) => {
    if (!m || typeof m !== "object") return [];
    const role = (m as { role?: unknown }).role === "assistant" ? "assistant" : "user";
    const content = String((m as { content?: unknown }).content ?? "").trim().slice(0, DEMO_MAX_CHARS);
    return content ? [{ role, content } as const] : [];
  });
}
