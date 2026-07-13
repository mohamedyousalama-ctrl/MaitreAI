// ============================================================================
// MaitreAI — WO-REALTIME-AUTH-REFRESH: realtime auth + resubscribe helpers.
//
// THE BUG: the console's Supabase realtime socket dies ~20–40 min into a session.
// supabase-js ^2.45.4 does NOT propagate a refreshed JWT to the realtime socket,
// and nothing ever called realtime.setAuth on token refresh — so once the access
// token expires the channel drops and supabase-js's internal auto-rejoin retries
// with the SAME stale token, forever. New messages then stop appearing until a
// full page refresh.
//
// THE FIX (two parts):
//   PART 1 — propagate the refreshed token to the socket. shouldPropagateAuth()
//     names the auth events after which we call realtime.setAuth(newToken). Wired
//     ONCE at DataBootstrap (the mount-once hydration home); because
//     @supabase/ssr's createBrowserClient is a browser singleton, that one client
//     is the client every channel subscribes on, so one setAuth reaches them all.
//     UNCONDITIONAL — additive, no sane failure mode.
//   PART 2 — active resubscribe-with-backoff. createReloadingSubscription() owns a
//     channel's lifecycle: on a terminal status it tears the channel down and
//     rebuilds after backoffDelay() (cap 30s); on (re)SUBSCRIBED it resets the
//     backoff and fires onChange (the reconnect-reload guardrail, so changes missed
//     while offline are caught). Gated by REALTIME_RESUBSCRIBE (default-ON
//     kill-switch); flag-OFF restores the prior fail-quietly behavior byte-for-byte.
//
// These orchestrators are PURE / injectable (timer + channel are passed in) so the
// red-first proof can drive the exact status sequences — including the closedByUs
// teardown-guard discrimination — deterministically.
// ============================================================================

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

/** The realtime channel statuses supabase-js reports to a .subscribe() callback. */
export type ChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/** A drop we should recover from (as opposed to SUBSCRIBED). */
const TERMINAL: readonly ChannelStatus[] = ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"];
export const isTerminalStatus = (s: ChannelStatus): boolean => TERMINAL.includes(s);

/** Auth events after which the fresh access token must be pushed to the realtime
 *  socket. TOKEN_REFRESHED is the one that fixes the live bug; SIGNED_IN /
 *  INITIAL_SESSION keep the socket authed from the first paint. SIGNED_OUT and the
 *  rest are intentionally excluded — there is no new token to propagate. */
export function shouldPropagateAuth(event: string): boolean {
  return event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "INITIAL_SESSION";
}

/** Exponential backoff for the rebuild schedule: 1s, 2s, 4s … capped at 30s.
 *  Deterministic (jitter is applied by the caller so this stays unit-testable). */
export function backoffDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

/** True when PART 2's active resubscribe is live (default). The kill-switch. Reads
 *  the env var DIRECTLY (mirrors the documented REALTIME_RESUBSCRIBE flag in
 *  lib/feature-flags.ts) rather than importing that module, so this file stays free
 *  of `@/` value imports and remains runnable under the red-first strip-types harness.
 *  Default ON — only an explicit "false" (and redeploy) reverts to fail-quietly. */
export function isRealtimeResubscribeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_REALTIME_RESUBSCRIBE !== "false";
}

export interface ReloadingDeps {
  /** Open a channel: subscribe with the given status callback and return a teardown
   *  that removes it. Called once per (re)connect. */
  open: (onStatus: (status: ChannelStatus) => void) => () => void;
  /** The reconnect-reload: fired on every (re)SUBSCRIBED so a store refetches what
   *  it may have missed while the socket was down. */
  onChange: () => void;
  /** Schedule fn after ms; return a canceller. Injectable so tests drive time. */
  schedule: (ms: number, fn: () => void) => () => void;
  /** Jitter fraction in [0,1); the rebuild waits backoff*(1 + up-to-0.25*jitter) to
   *  avoid a thundering herd. Injectable (default Math.random) for deterministic tests. */
  jitter?: () => number;
}

/** Own a single channel's lifecycle with active resubscribe-with-backoff.
 *  Returns a dispose function. The `closedByUs` guard is the crux: our own teardown
 *  (dispose, or the pre-rebuild removeChannel) makes supabase-js emit CLOSED — that
 *  CLOSED must NOT schedule a zombie rebuild, whereas a genuine CLOSED must. */
export function createReloadingSubscription(deps: ReloadingDeps): () => void {
  let attempt = 0;
  let closedByUs = false;
  let teardown: (() => void) | null = null;
  let pending: (() => void) | null = null; // cancels the scheduled rebuild
  const jitter = deps.jitter ?? Math.random;

  const connect = (): void => {
    teardown = deps.open((status) => {
      if (closedByUs) return; // our own removeChannel's CLOSED — never a real drop
      if (status === "SUBSCRIBED") {
        attempt = 0; // recovered: reset the backoff ladder
        deps.onChange(); // reconnect-reload guardrail (initial subscribe AND recovery)
      } else if (isTerminalStatus(status)) {
        // Controlled rebuild: tear the dying channel down (guarded so its CLOSED is
        // ignored), then schedule a fresh connect after backoff+jitter.
        if (teardown) {
          closedByUs = true;
          teardown();
          closedByUs = false;
          teardown = null;
        }
        const base = backoffDelay(attempt);
        attempt++;
        pending = deps.schedule(base + base * 0.25 * jitter(), () => {
          pending = null;
          connect();
        });
      }
    });
  };
  connect();

  return () => {
    closedByUs = true; // suppress the CLOSED our teardown is about to emit
    if (pending) {
      pending();
      pending = null;
    }
    if (teardown) {
      teardown();
      teardown = null;
    }
  };
}

/** How a site behaved BEFORE this WO — reproduced verbatim when the kill-switch is
 *  off, so flag-OFF is byte-identical to today. "reload" = the 7 fail-quietly sites
 *  (SUBSCRIBED→onChange, terminal→console.warn); "bare" = payments' silent
 *  .subscribe() with no status callback at all. */
export type LegacyMode = "reload" | "bare";

export interface SubscribeOptions {
  channelName: string;
  /** Attach the .on(...) handlers to a fresh channel. Called once per (re)connect,
   *  so a rebuild re-binds cleanly. */
  bind: (channel: RealtimeChannel) => RealtimeChannel;
  onChange: () => void;
  /** Tag for the console.warn in legacy "reload" mode. */
  label: string;
  legacyMode?: LegacyMode;
}

/** The one entry point the 8 DB-changes subscribers call. Flag-ON → active
 *  resubscribe-with-backoff (createReloadingSubscription). Flag-OFF → the site's
 *  exact prior behavior. Returns the unsubscribe/cleanup either way. */
export function subscribeWithReload(s: SupabaseClient, opts: SubscribeOptions): () => void {
  const legacyMode: LegacyMode = opts.legacyMode ?? "reload";

  if (!isRealtimeResubscribeEnabled()) {
    // Kill-switch OFF — byte-identical to the pre-WO code path.
    if (legacyMode === "bare") {
      const ch = opts.bind(s.channel(opts.channelName)).subscribe();
      return () => {
        void s.removeChannel(ch);
      };
    }
    const ch = opts.bind(s.channel(opts.channelName)).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        opts.onChange();
      } else if (isTerminalStatus(status as ChannelStatus)) {
        console.warn(`[realtime:${opts.label}] channel status:`, status);
      }
    });
    return () => {
      void s.removeChannel(ch);
    };
  }

  // Kill-switch ON — active resubscribe-with-backoff. payments (previously silent)
  // now also gets the reconnect-reload + rebuild, closing that gap.
  return createReloadingSubscription({
    open: (onStatus) => {
      const ch = opts
        .bind(s.channel(opts.channelName))
        .subscribe((status) => onStatus(status as ChannelStatus));
      return () => {
        void s.removeChannel(ch);
      };
    },
    onChange: opts.onChange,
    schedule: (ms, fn) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    },
  });
}
