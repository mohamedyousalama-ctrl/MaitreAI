// ============================================================================
// R2 proof harness — WhatsApp health TRUTH SPLIT (8 independent probes).
// The probe DECISION is pure (buildWhatsAppProbes), so the three-valued matrix is
// exercised directly with no DB: each facet passes/fails/unknowns on its OWN fact,
// independent of the others. Source assertions confirm the GET route feeds real
// facts into the split (additively, legacy fields kept) and that the POST
// round-trip route reports transport truth and is manager-gated.
//
// Run: node --experimental-strip-types scripts/proof-r2-wa-truth-split.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildWhatsAppProbes, rollUpProbes, type WhatsAppHealthFacts, type Probe } from "../lib/messaging/whatsapp-health.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };
const NOW = 1_700_000_000_000;
const get = (ps: Probe[], id: string) => ps.find((p) => p.id === id)!;

const base = (over: Partial<WhatsAppHealthFacts> = {}): WhatsAppHealthFacts => ({
  creds: { accessToken: true, phoneNumberId: true, verifyToken: true, appSecret: true },
  lastInboundAt: new Date(NOW - 1000).toISOString(),
  lastOutboundAt: new Date(NOW - 1000).toISOString(),
  lastFailedOutboundAt: null,
  lastFailedReason: null,
  agentMode: "live",
  nowMs: NOW,
  ...over,
});

// ---- Exactly 8 probes, stable order ----------------------------------------
{
  const ps = buildWhatsAppProbes(base());
  check("emits exactly 8 probes", ps.length === 8);
  check("probe ids are the 8 expected in order",
    ps.map((p) => p.id).join(",") ===
      "access_token,phone_number_id,verify_token,app_secret,inbound_webhook,outbound_delivery,recent_send_failure,agent_replies_enabled");
  check("all-healthy → every probe passes", ps.every((p) => p.status === "pass"));
  check("all-healthy → rollup pass", rollUpProbes(ps) === "pass");
}

// ---- Credential probes: knowable now, always pass/fail (never unknown) ------
{
  const ps = buildWhatsAppProbes(base({ creds: { accessToken: false, phoneNumberId: true, verifyToken: false, appSecret: true } }));
  check("missing access_token → fail", get(ps, "access_token").status === "fail");
  check("present phone_number_id → pass", get(ps, "phone_number_id").status === "pass");
  check("missing verify_token → fail", get(ps, "verify_token").status === "fail");
  check("credential probes are never unknown",
    ["access_token", "phone_number_id", "verify_token", "app_secret"].every((id) => get(ps, id).status !== "unknown"));
}

// ---- INDEPENDENCE: a missing credential does NOT flip the path probes -------
{
  const ps = buildWhatsAppProbes(base({ creds: { accessToken: false, phoneNumberId: false, verifyToken: false, appSecret: false } }));
  check("independence: inbound_webhook still passes on its own fact despite dead creds",
    get(ps, "inbound_webhook").status === "pass");
  check("independence: outbound_delivery still passes on its own fact", get(ps, "outbound_delivery").status === "pass");
}

// ---- Path probes: unknown until the channel is actually exercised -----------
{
  const ps = buildWhatsAppProbes(base({ lastInboundAt: null, lastOutboundAt: null }));
  check("no inbound ever → inbound_webhook UNKNOWN (not fail)", get(ps, "inbound_webhook").status === "unknown");
  check("no outbound ever → outbound_delivery UNKNOWN (not fail)", get(ps, "outbound_delivery").status === "unknown");
  check("unknown present → rollup unknown (not a false green)", rollUpProbes(ps) === "unknown");
}

// ---- Recent-failure probe: window-scoped -----------------------------------
{
  const recent = buildWhatsAppProbes(base({ lastFailedOutboundAt: new Date(NOW - 1000).toISOString(), lastFailedReason: "send_failed" }));
  check("recent failure inside window → recent_send_failure FAIL", get(recent, "recent_send_failure").status === "fail");
  check("recent failure carries the reason", get(recent, "recent_send_failure").detail === "send_failed");
  check("any fail → rollup fail (never green over a red)", rollUpProbes(recent) === "fail");

  const stale = buildWhatsAppProbes(base({ lastFailedOutboundAt: new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString() }));
  check("stale failure (older than window) → recent_send_failure PASS", get(stale, "recent_send_failure").status === "pass");

  const none = buildWhatsAppProbes(base());
  check("no failures at all → recent_send_failure PASS", get(none, "recent_send_failure").status === "pass");
}

// ---- Agent-replies probe: stored intent, independent of transport ----------
{
  check("paused → agent_replies_enabled FAIL",
    get(buildWhatsAppProbes(base({ agentMode: "paused" })), "agent_replies_enabled").status === "fail");
  check("setup → agent_replies_enabled UNKNOWN",
    get(buildWhatsAppProbes(base({ agentMode: "setup" })), "agent_replies_enabled").status === "unknown");
  check("test → agent_replies_enabled PASS",
    get(buildWhatsAppProbes(base({ agentMode: "test" })), "agent_replies_enabled").status === "pass");
  check("live → agent_replies_enabled PASS",
    get(buildWhatsAppProbes(base({ agentMode: "live" })), "agent_replies_enabled").status === "pass");
}

// ---- Source: GET route feeds the split additively --------------------------
const getRoute = read("app/api/settings/whatsapp-health/route.ts");
check("GET route builds the probes from real facts", getRoute.includes("buildWhatsAppProbes({"));
check("GET route returns probes + rollup + mode", /probes,\s*rollup: rollUpProbes\(probes\),\s*mode: whatsAppMode\(\)/.test(getRoute));
check("GET route keeps the 4 legacy fields (non-breaking)",
  getRoute.includes("lastInboundAt,") && getRoute.includes("lastFailedReason: failedReason,"));

// ---- Source: POST round-trip reports transport truth, manager-only ---------
const rt = read("app/api/settings/whatsapp-health/roundtrip/route.ts");
check("round-trip is manager-only", /tenant\.role !== "manager"\) return NextResponse\.json\(\{ error: "forbidden_role" \}, \{ status: 403 \}\)/.test(rt));
check("round-trip requires a 'to' target", rt.includes('detail: "missing \'to\'"'));
check("round-trip reports the exact send status (no fabrication)", rt.includes("status: send.status") && rt.includes("externalMessageId: send.externalMessageId"));
check("round-trip sends from the tenant's own creds", rt.includes("runWithTenantWhatsAppCreds(credsAdmin, tenant.restaurantId"));
check("round-trip surfaces a real failure as 502", /ok \? 200 : 502/.test(rt));

console.log(`\nR2-WA-TRUTH-SPLIT PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
