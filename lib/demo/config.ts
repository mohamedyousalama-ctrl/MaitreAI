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
 * THE ARITHMETIC WAS WRONG AND IS CORRECTED HERE. This previously read "measured turns
 * cost ~$0.0021, so 2,000 turns bounds a worst day at roughly $4". That held while text
 * was the only surface. The voice route consumes the SAME counter but performs TWO paid
 * operations per slot — Whisper plus the full LLM turn — so a voice turn is several
 * times a text turn and the $4 bound was false the moment voice shipped.
 *
 * Recomputed worst case, with the audio ceiling below:
 *   opus at 24 kbps ≈ 3 KB/s, so 512 KB ≈ 170s ≈ 2.8 min
 *   Whisper at $0.006/min          → ~$0.017
 *   LLM turn (measured)            → ~$0.0021
 *   worst-case voice turn          → ~$0.019
 *   1,000 turns, ALL of them voice → ~$19/day
 * A realistic mixed day is a small fraction of that, and the kill switch in
 * `demo_controls` stops everything instantly. Raising this is a deliberate act with the
 * arithmetic above re-run, not a default.
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
