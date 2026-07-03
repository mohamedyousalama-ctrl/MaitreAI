// ============================================================================
// MaitreAI — R2 WhatsApp health: the TRUTH SPLIT (pure; browser+server safe)
// One "healthy?" blob hides which facet is actually broken. This splits the
// WhatsApp channel into 8 INDEPENDENT probes, each classified on its own facts so
// the console can say precisely what's wrong (or that it simply can't know yet).
//
// Three-valued on purpose (Phase-L truth rule): a probe is
//   pass    — the fact is verified true
//   fail    — the fact is verified false / a real failure is present
//   unknown — not yet observable (e.g. no inbound has EVER arrived) — NOT a
//             failure; we refuse to claim a green we can't prove OR a red we
//             haven't seen. The four credential probes are always pass/fail
//             (their fact is knowable now); the path/failure/mode probes may be
//             unknown until the channel has actually been exercised.
//
// Pure: no DB, no next/server — the route feeds it already-fetched facts and this
// decides. Exhaustively unit-testable.
// ============================================================================

import type { WhatsAppEnvStatus } from "@/lib/messaging/config";

export type ProbeStatus = "pass" | "fail" | "unknown";

export interface Probe {
  /** Stable machine id (the UI localizes; this never changes). */
  id: WhatsAppProbeId;
  status: ProbeStatus;
  /** Short machine-readable reason/context (never a secret). */
  detail: string | null;
}

export type WhatsAppProbeId =
  | "access_token"
  | "phone_number_id"
  | "verify_token"
  | "app_secret"
  | "inbound_webhook"
  | "outbound_delivery"
  | "recent_send_failure"
  | "agent_replies_enabled";

/** Every fact the probes need — fetched by the route, decided here. */
export interface WhatsAppHealthFacts {
  creds: WhatsAppEnvStatus;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastFailedOutboundAt: string | null;
  lastFailedReason: string | null;
  /** Stored intent: setup | test | live | paused (restaurants.agent_mode). */
  agentMode: string;
  nowMs: number;
  /** A prior send failure older than this is no longer "recent" (default 24h). */
  recentFailureWindowMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Build the 8 independent probes. Order is stable (display order). */
export function buildWhatsAppProbes(f: WhatsAppHealthFacts): Probe[] {
  const window = f.recentFailureWindowMs ?? DAY_MS;

  // 1–4: credentials — knowable NOW, always pass/fail (never unknown).
  const cred = (present: boolean, id: WhatsAppProbeId): Probe => ({
    id,
    status: present ? "pass" : "fail",
    detail: present ? null : "missing",
  });

  // 5: inbound path — proven only once a webhook inbound has ever landed.
  const inbound: Probe = {
    id: "inbound_webhook",
    status: f.lastInboundAt ? "pass" : "unknown",
    detail: f.lastInboundAt ?? "no_inbound_yet",
  };

  // 6: outbound path — proven only once an outbound message exists.
  const outbound: Probe = {
    id: "outbound_delivery",
    status: f.lastOutboundAt ? "pass" : "unknown",
    detail: f.lastOutboundAt ?? "no_outbound_yet",
  };

  // 7: recent send failure — FAIL only if a real failure sits inside the window;
  // an old failure is not a current-health red. No failures at all → pass.
  let failStatus: ProbeStatus = "pass";
  let failDetail: string | null = null;
  if (f.lastFailedOutboundAt) {
    const ageMs = f.nowMs - new Date(f.lastFailedOutboundAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= window) {
      failStatus = "fail";
      failDetail = f.lastFailedReason ?? "send_failed";
    } else {
      failDetail = "last_failure_stale";
    }
  }
  const recentFailure: Probe = { id: "recent_send_failure", status: failStatus, detail: failDetail };

  // 8: would the agent even reply? Stored intent, independent of transport.
  //   paused → fail (owner turned Karim off) · setup → unknown (not enabled yet)
  //   test/live → pass. Anything unexpected → unknown (never overclaim).
  let modeStatus: ProbeStatus;
  if (f.agentMode === "paused") modeStatus = "fail";
  else if (f.agentMode === "test" || f.agentMode === "live") modeStatus = "pass";
  else modeStatus = "unknown"; // setup / unknown
  const agentReplies: Probe = { id: "agent_replies_enabled", status: modeStatus, detail: f.agentMode };

  return [
    cred(f.creds.accessToken, "access_token"),
    cred(f.creds.phoneNumberId, "phone_number_id"),
    cred(f.creds.verifyToken, "verify_token"),
    cred(f.creds.appSecret, "app_secret"),
    inbound,
    outbound,
    recentFailure,
    agentReplies,
  ];
}

/** Roll-up for a headline chip WITHOUT hiding the split: any fail → "fail";
 *  else any unknown → "unknown"; else "pass". Never a green while a red exists. */
export function rollUpProbes(probes: Probe[]): ProbeStatus {
  if (probes.some((p) => p.status === "fail")) return "fail";
  if (probes.some((p) => p.status === "unknown")) return "unknown";
  return "pass";
}
