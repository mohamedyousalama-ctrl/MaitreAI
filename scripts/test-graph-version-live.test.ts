// Unit tests for WO-GRAPH-VERSION-LIVE — the LIVE messaging Graph API version.
// RED-FIRST: with v19.0 (expired 2026-05-21) these fail. Proves (1) the constant is
// Meta's current supported version, (2) every OUTBOUND Graph URL carries it, (3) all
// outbound call-sites interpolate the single constant (no hardcoded version), and
// (4) the constant is INDEPENDENT of inbound webhook signature verification (that
// path uses WHATSAPP_APP_SECRET / HMAC, never the Graph version).
// Run: node --experimental-strip-types scripts/test-graph-version-live.test.ts
import { execSync } from "node:child_process";
import { WHATSAPP_GRAPH_VERSION } from "../lib/messaging/config.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── (1) The constant is Meta's current, supported version ────────────────────
ok("WHATSAPP_GRAPH_VERSION is v25.0 (Meta current stable, Feb 2026)", WHATSAPP_GRAPH_VERSION === "v25.0");
const major = Number(/^v(\d+)\./.exec(WHATSAPP_GRAPH_VERSION)?.[1] ?? "0");
ok("★ version is SUPPORTED (major ≥ 20 — v19.0 expired 2026-05-21)", major >= 20);
ok("★ version is NOT the expired v19.0", WHATSAPP_GRAPH_VERSION !== "v19.0");

// ── (2) Every outbound Graph URL (built exactly as the code builds it) carries
//        the current version and never the expired one. ───────────────────────
const V = WHATSAPP_GRAPH_VERSION;
const outboundUrls: Record<string, string> = {
  "send message":  `https://graph.facebook.com/${V}/PHONE_ID/messages`,
  "media get":     `https://graph.facebook.com/${V}/MEDIA_ID`,
  "media upload":  `https://graph.facebook.com/${V}/PHONE_ID/media`,
  "template sync": `https://graph.facebook.com/${V}/WABA_ID/message_templates?fields=name`,
  "capacity sync": `https://graph.facebook.com/${V}/PHONE_ID?fields=quality_rating`,
};
for (const [name, url] of Object.entries(outboundUrls)) {
  ok(`outbound URL (${name}) carries /v25.0/`, url.includes("/v25.0/"));
  ok(`outbound URL (${name}) does NOT carry expired /v19.0/`, !url.includes("/v19.0/"));
}

// ── (3) grep-proof: every graph.facebook.com URL in the outbound call-sites
//        interpolates the single constant — no hardcoded version literal. ──────
const OUTBOUND_SITES = [
  "lib/messaging/adapters/whatsapp.ts",
  "app/api/settings/templates/sync/route.ts",
  "app/api/settings/capacity/sync/route.ts",
];
function grepLines(pattern: string, files: string[]): string[] {
  try {
    return execSync(`grep -rnE ${JSON.stringify(pattern)} ${files.join(" ")}`, { cwd: process.cwd(), encoding: "utf8" })
      .split("\n").filter(Boolean);
  } catch { return []; }
}
const graphUrlLines = grepLines("graph\\.facebook\\.com", OUTBOUND_SITES);
ok("outbound sites actually contain graph.facebook.com URLs (grep is live)", graphUrlLines.length >= 5);
const interpolatesConst = graphUrlLines.every((l) => l.includes("${WHATSAPP_GRAPH_VERSION}"));
ok("★ every outbound graph URL interpolates ${WHATSAPP_GRAPH_VERSION} (single source)", interpolatesConst);
if (!interpolatesConst) graphUrlLines.filter((l) => !l.includes("${WHATSAPP_GRAPH_VERSION}")).forEach((l) => console.log("     stray:", l));
// No hardcoded /vNN. version literal in a graph URL anywhere in those sites.
const hardcodedVersion = grepLines("graph\\.facebook\\.com/v[0-9]+\\.", OUTBOUND_SITES);
ok("★ no hardcoded Graph version literal in any outbound URL", hardcodedVersion.length === 0);

// ── (4) INDEPENDENCE: the inbound webhook signature path never uses the version.
//        (Bumping the version cannot affect Wesaya inbound HMAC verification.) ──
const webhookRefsVersion = grepLines("WHATSAPP_GRAPH_VERSION|graph\\.facebook", ["app/api/whatsapp/webhook/route.ts"]);
ok("★ inbound webhook route does NOT reference the Graph version (signature independent)", webhookRefsVersion.length === 0);

console.log(`\nGRAPH-VERSION-LIVE UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
