// ============================================================================
// فيصل / Faysal — the public-endpoint guards.
//
// THREE LAYERS, and only the third is a real cap. The reasoning is Kivo's, ported
// unchanged; the constants and the counters are Faysal's own, because the two
// products must not share a daily budget or a kill switch.
//
//   1. `lib/rate-limit` — process-local, per IP. A SPEED BUMP. It resets on a
//      cold start and is not shared across lambdas; its own header says so.
//   2. A process-local global counter — a second speed bump that at least bounds
//      one warm instance.
//   3. The DURABLE guard in the database (`kv_demo_try_consume`, migration 0119):
//      a global daily ceiling, a per-IP hourly ceiling shared across lambdas, and
//      `demo_controls.enabled` read on every turn — so the demo can be stopped in
//      seconds by flipping one boolean, with no redeploy and no build.
//
// FAIL-CLOSED, PROPORTIONAL TO SPEND. Kivo refuses the turn when the durable guard
// is unavailable, because every Kivo turn spends. Faysal's rule is stated in terms
// of what a turn can actually cost:
//
//     · a real model key is configured  → the durable guard is REQUIRED. If it
//       errors or is unreachable we refuse rather than spend. Same posture as Kivo.
//     · no key (the deterministic mock)  → a turn costs nothing, so the local
//       ceilings are the whole control and the demo still runs.
//
// That second branch is not a loophole: with no key the LLM seam returns the mock
// adapter, the classifier's JSON parse fails, and every turn falls to the
// deterministic pre-pass — zero tokens, zero dollars, by construction.
//
// THE GUARD IS CONSUMED ONLY AFTER THE REQUEST IS VALID. The durable guard
// increments its GLOBAL counter on the way in, so a stream of malformed posts
// that are rejected anyway would burn the day's slots at zero cost to the sender.
// Validation is free; it goes first, and the guard still precedes every paid
// operation.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { isClaudeConfigured } from "@/lib/ai/llm";
import { rateLimit } from "@/lib/rate-limit";
import {
  FAYSAL_GLOBAL_DAILY_TURNS,
  FAYSAL_PER_IP_TURNS,
  FAYSAL_WINDOW_MS,
  globalDayBucket,
  ipHourBucket,
} from "./limits";

/** First hop of x-forwarded-for — the client as the edge saw it. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export type GuardVerdict =
  | { ok: true }
  | { ok: false; status: 429 | 503; error: "rate_limited" | "demo_unavailable"; retryAfterSec?: number };

// Process-local global counter. A speed bump for one warm instance — NOT the cap.
let localDay = "";
let localCount = 0;

function localGlobal(): boolean {
  const day = globalDayBucket();
  if (day !== localDay) {
    localDay = day;
    localCount = 0;
  }
  localCount += 1;
  return localCount <= FAYSAL_GLOBAL_DAILY_TURNS;
}

/** Cheap, free, no side effects on the paid path. Call before parsing the body. */
export function preFilter(req: Request, keyPrefix: string, limit = FAYSAL_PER_IP_TURNS): GuardVerdict {
  const rl = rateLimit(`${keyPrefix}:${clientIp(req)}`, limit, FAYSAL_WINDOW_MS);
  if (!rl.ok) return { ok: false, status: 429, error: "rate_limited", retryAfterSec: rl.retryAfterSec };
  return { ok: true };
}

/**
 * The durable ceiling. Called ONLY after the request is known to be valid, and
 * only on the turn route — minting a session costs nothing and must not be able
 * to exhaust the day.
 */
export async function consumeSpendGuard(ip: string): Promise<GuardVerdict> {
  if (!localGlobal()) return { ok: false, status: 429, error: "rate_limited" };

  const admin = createAdminClient();
  if (!admin) {
    // No database. If a real key is configured this turn CAN spend, so refuse.
    // With the mock adapter it cannot, so the local ceilings stand alone.
    return isClaudeConfigured() ? { ok: false, status: 503, error: "demo_unavailable" } : { ok: true };
  }

  try {
    const { data, error } = await admin
      .rpc("kv_demo_try_consume", {
        p_ip_bucket: ipHourBucket(ip),
        p_global_bucket: `faysal:${globalDayBucket()}`,
        p_ip_limit: FAYSAL_PER_IP_TURNS,
        p_global_limit: FAYSAL_GLOBAL_DAILY_TURNS,
      })
      .maybeSingle<{ allowed: boolean; reason: string | null }>();

    if (error || !data) {
      console.error("[faysal] spend guard unavailable — refusing the turn", error?.message);
      return isClaudeConfigured() ? { ok: false, status: 503, error: "demo_unavailable" } : { ok: true };
    }
    if (!data.allowed) {
      // 503 for a deliberately stopped demo, 429 for a quota. Never leak the counts.
      const stopped = data.reason === "disabled";
      return stopped
        ? { ok: false, status: 503, error: "demo_unavailable" }
        : { ok: false, status: 429, error: "rate_limited" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[faysal] spend guard threw — refusing the turn", e);
    return isClaudeConfigured() ? { ok: false, status: 503, error: "demo_unavailable" } : { ok: true };
  }
}
