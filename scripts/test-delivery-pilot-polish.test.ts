// ============================================================================
// Kivo Delivery Network — Cairo pilot polish proofs.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-delivery-pilot-polish.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LOCATION_FRESH_MS } from "../lib/db/delivery.ts";
import {
  HIDDEN_TAB_TIMER_CAP_MS,
  OPERATOR_LOCATION_FRESH_MS,
  STALE_AFTER_MS,
  VISIBLE_POLL_MS,
  classifyRefreshHealth,
  isInProgressStatus,
  locationAge,
  tickLocation,
} from "../lib/delivery/operator-refresh.ts";
import {
  isTokenBearingUrl,
  redactDeliveryUrl,
  whatsappDispatchLabel,
  whatsappShareHref,
} from "../lib/delivery/share-link.ts";
import { PILOT_MARKER, PILOT_MARKER_AR } from "../lib/delivery/pilot-surface.ts";
import { formatDriverChoice, rosterSelectHint, rosterSummary } from "../lib/delivery/driver-roster.ts";
import { driverTerminalPanel } from "../lib/delivery/driver-terminal-state.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};
const ok = (n: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ❌ ${n}: expected true`); } };

// ── refresh policy: the ~1 minute field lag ───────────────────────────────────
{
  ok("visible poll is strictly under the 15s product ceiling", VISIBLE_POLL_MS < STALE_AFTER_MS);
  ok("two foreground polls fit inside the 15s ceiling", VISIBLE_POLL_MS * 2 < STALE_AFTER_MS);
  eq("hidden-tab Chromium cap that matched the field observation is 60s", HIDDEN_TAB_TIMER_CAP_MS, 60_000);
  ok("the old 15s poll sat inside that hidden-tab cap (so a backgrounded operator tab lagged ~1 min)", STALE_AFTER_MS < HIDDEN_TAB_TIMER_CAP_MS);
  eq("client freshness window matches server LOCATION_FRESH_MS", OPERATOR_LOCATION_FRESH_MS, LOCATION_FRESH_MS);

  ok("assigned is in-progress", isInProgressStatus("assigned"));
  ok("picked_up is in-progress", isInProgressStatus("picked_up"));
  ok("on_the_way is in-progress", isInProgressStatus("on_the_way"));
  ok("delivered is NOT in-progress (no live poll)", !isInProgressStatus("delivered"));
  ok("failed is NOT in-progress", !isInProgressStatus("failed"));
  ok("pending is NOT in-progress", !isInProgressStatus("pending"));

  eq("idle board is idle even if last pull is old",
    classifyRefreshHealth({ now: 20_000, lastOkAt: 0, lastError: null, hasInProgress: false }), "idle");
  eq("in-progress + fresh pull is live",
    classifyRefreshHealth({ now: 5_000, lastOkAt: 2_000, lastError: null, hasInProgress: true }), "live");
  eq("in-progress + 15s-old pull is stale",
    classifyRefreshHealth({ now: 20_000, lastOkAt: 5_000, lastError: null, hasInProgress: true }), "stale");
  eq("boundary: 14999ms is still live",
    classifyRefreshHealth({ now: 14_999, lastOkAt: 0, lastError: null, hasInProgress: true }), "live");
  eq("in-progress with no successful pull is stale (not silent)",
    classifyRefreshHealth({ now: 1, lastOkAt: null, lastError: null, hasInProgress: true }), "stale");
  eq("a failed pull is error, even if a previous pull was recent",
    classifyRefreshHealth({ now: 3_000, lastOkAt: 2_000, lastError: "network", hasInProgress: true }), "error");

  const live = locationAge(new Date(1_000_000).toISOString(), 1_000_000 + 5_000);
  ok("5s-old point is fresh", live.fresh);
  eq("age reported", live.ageMs, 5_000);
  const ticked = tickLocation({ lat: 30, lng: 31, recorded_at: new Date(1_000_000).toISOString() }, 1_000_000 + 40_000);
  ok("tickLocation keeps coords", !!ticked && ticked.lat === 30 && ticked.lng === 31);
  ok("40s-old point is not fresh", !!ticked && !ticked.fresh);
  eq("null location ticks to null", tickLocation(null, 1), null);
}

// ── share-link: tokens never belong in evidence / visible copy ────────────────
{
  const raw = "http://localhost:3000/d/abcdefghijklmnopqrstuvwx";
  ok("private driver URL is token-bearing", isTokenBearingUrl(raw));
  const redacted = redactDeliveryUrl(raw);
  ok("redaction strips the token", !isTokenBearingUrl(redacted));
  ok("redaction keeps the /d/ prefix", redacted.includes("/d/[redacted]"));
  eq("customer token is also stripped", redactDeliveryUrl("https://host/t/zzzzzzzzzzzzzzzzzzzzzzzz"), "https://host/t/[redacted]");
  eq("presence token is also stripped", redactDeliveryUrl("https://host/p/zzzzzzzzzzzzzzzzzzzzzzzz"), "https://host/p/[redacted]");
  ok("wa.me href carries the link for the operator share action", whatsappShareHref(raw).startsWith("https://wa.me/?text="));
  ok("skipped WhatsApp copy does NOT say وضع تجريبي", !whatsappDispatchLabel("skipped").includes("وضع تجريبي"));
  ok("failed WhatsApp copy tells the operator to copy/share", whatsappDispatchLabel("failed").includes("انسخ"));
  eq("Pilot marker is the explicit English Pilot token", PILOT_MARKER, "Pilot");
  ok("Arabic Pilot subtitle names Cairo", PILOT_MARKER_AR.includes("القاهرة"));
}

// ── roster: four-driver manual selection, no presence semantics ───────────────
{
  const four = [
    { name: "أ", phone: "0101", vehicle: "موتو", active: true },
    { name: "ب", phone: "0102", vehicle: null, active: true },
    { name: "ج", phone: "0103", vehicle: "عجلة", active: true },
    { name: "د", phone: "0104", vehicle: null, active: false },
  ];
  const s = rosterSummary(four);
  eq("four roster rows", s.total, 4);
  eq("three active (selectable)", s.activeCount, 3);
  eq("one inactive (roster-managed, not ONLINE/OFFLINE)", s.inactiveCount, 1);
  eq("choice 1 is numbered", formatDriverChoice(four[0], 1), "1. أ — موتو — 0101");
  ok("empty roster hint is actionable", rosterSelectHint(0).includes("فعّل"));
  ok("four-active hint stays manual selection", rosterSelectHint(4).includes("يدوياً"));
  ok("no ONLINE wording in roster helpers", !`${formatDriverChoice(four[0], 1)}${rosterSelectHint(4)}`.includes("ONLINE"));
  ok("no OFFLINE wording in roster helpers", !rosterSelectHint(4).includes("OFFLINE"));
}

// ── terminal problem path still distinct from success ─────────────────────────
{
  const failed = driverTerminalPanel("failed")!;
  eq("failed is still not success", failed.success, false);
  ok("failed still has no success checkmark", !failed.title.includes("✅") && !failed.body.includes("✅"));
  ok("failed still says the delivery was not completed", failed.body.includes("لم يتم إتمام"));
  const delivered = driverTerminalPanel("delivered")!;
  eq("delivered remains success", delivered.success, true);
}

// ── wiring: operator client + store + no token dump ───────────────────────────
{
  const client = read("app/(console)/deliveries/DeliveriesClient.tsx");
  ok("operator page imports the refresh policy", client.includes("VISIBLE_POLL_MS"));
  ok("operator page no longer uses the 15s interval", !client.includes("15000"));
  ok("operator page wakes on visibilitychange (hidden-tab cap)", client.includes("visibilitychange"));
  ok("operator page wakes on focus", client.includes("window.addEventListener(\"focus\""));
  ok("Pilot marker is rendered", client.includes("PILOT_MARKER") && client.includes("data-testid=\"pilot-marker\""));
  ok("Cairo pilot subtitle is rendered", client.includes("PILOT_MARKER_AR"));
  ok("no misleading وضع تجريبي on the deliveries surface", !client.includes("وضع تجريبي"));
  ok("copy control exists and does not dump the URL as visible text",
    client.includes("نسخ رابط المندوب") && !client.includes("truncate font-mono"));
  ok("WhatsApp share uses the helper href, not a rendered URL", client.includes("whatsappShareHref("));
  ok("driver dropdown is numbered via formatDriverChoice", client.includes("formatDriverChoice("));
  ok("network errors are retryable with shared copy", client.includes("OPERATOR_NETWORK_ERROR_AR") && client.includes("retry: true"));
  ok("stale/error banner can force a pull", client.includes("OPERATOR_REFRESH_STALE_AR") && client.includes("تحديث الآن"));

  const store = read("lib/dispatch-store.ts");
  ok("dispatch store records lastOkAt", store.includes("lastOkAt"));
  ok("dispatch store records lastError instead of swallowing failures", store.includes("lastError: \"network\""));

  const api = read("app/api/deliveries/route.ts");
  ok("deliveries GET is force-dynamic", api.includes("force-dynamic"));
  ok("deliveries GET sets Cache-Control no-store", api.includes("Cache-Control") && api.includes("no-store"));

  const send = read("lib/db/delivery.ts");
  ok("assignDriver does not log the WhatsApp exception (token-bearing body)",
    send.includes('console.error("[delivery] driver link send failed")') &&
    !send.includes('console.error("[delivery] driver link send error", e)'));

  const realtime = read("lib/db/dispatch-realtime.ts");
  ok("delivery_locations still not on the realtime publication (no migration)",
    realtime.includes("delivery_locations") && realtime.includes("NOT watched"));

  const driver = read("app/d/[token]/DriverClient.tsx");
  ok("driver GPS post failure is visible, not swallowed",
    driver.includes("تعذّر إرسال الموقع") && !driver.includes("/* transient"));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} delivery pilot polish: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
