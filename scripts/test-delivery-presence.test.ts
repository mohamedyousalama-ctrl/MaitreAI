// ============================================================================
// Kivo Delivery Network — Day 2 driver presence proofs.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/test-delivery-presence.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PRESENCE_FRESH_MS,
  classifyPresence,
  isPresenceStatus,
  presenceOperatorChipAr,
} from "../lib/delivery/driver-presence.ts";
import { LOCATION_FRESH_MS } from "../lib/db/delivery.ts";
import { isTokenBearingUrl, redactDeliveryUrl } from "../lib/delivery/share-link.ts";
import { formatDriverChoice, rosterSelectHint } from "../lib/delivery/driver-roster.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0, fail = 0;
const eq = (n: string, a: unknown, e: unknown) => {
  if (a === e) pass++; else { fail++; console.log(`  ❌ ${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
};
const ok = (n: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ❌ ${n}: expected true`); } };

const now = 1_000_000_000_000;
const at = (msAgo: number) => new Date(now - msAgo).toISOString();

// ── classify: explicit OFFLINE vs stale ONLINE ────────────────────────────────
{
  eq("fresh window matches delivery GPS freshness", PRESENCE_FRESH_MS, LOCATION_FRESH_MS);
  ok("online is a presence status", isPresenceStatus("online"));
  ok("offline is a presence status", isPresenceStatus("offline"));
  ok("assigned is NOT a presence status", !isPresenceStatus("assigned"));

  const off = classifyPresence({ status: "offline", lastSeenAt: at(5_000), recordedAt: at(5_000), lat: 30.04, lng: 31.23 }, now);
  eq("explicit OFFLINE kind", off.kind, "offline");
  ok("OFFLINE is never fresh", !off.fresh);
  ok("OFFLINE may still keep a historical fix", off.hasFix);

  const live = classifyPresence({ status: "online", lastSeenAt: at(5_000), recordedAt: at(5_000), lat: 30.04, lng: 31.23 }, now);
  eq("fresh ONLINE kind", live.kind, "online_fresh");
  ok("fresh ONLINE is fresh", live.fresh);

  const stale = classifyPresence({ status: "online", lastSeenAt: at(6 * 60_000), recordedAt: at(6 * 60_000), lat: 30.04, lng: 31.23 }, now);
  eq("stale ONLINE kind", stale.kind, "online_stale");
  ok("stale ONLINE is not fresh", !stale.fresh);
  ok("stale ONLINE still reports the point", stale.hasFix && stale.lat === 30.04);

  const noFix = classifyPresence({ status: "online", lastSeenAt: at(1_000) }, now);
  eq("ONLINE without GPS is online_no_fix", noFix.kind, "online_no_fix");

  const never = classifyPresence({ status: "online" }, now);
  eq("ONLINE with no last-seen is online_no_fix", never.kind, "online_no_fix");

  const missing = classifyPresence(null, now);
  eq("missing snapshot is OFFLINE", missing.kind, "offline");

  ok("OFFLINE chip names OFFLINE", presenceOperatorChipAr("offline").includes("OFFLINE"));
  ok("stale chip names ONLINE and قديم", presenceOperatorChipAr("online_stale").includes("ONLINE") && presenceOperatorChipAr("online_stale").includes("قديم"));
  ok("OFFLINE chip does not say موقع قديم", !presenceOperatorChipAr("offline").includes("موقع قديم"));
  ok("fresh chip does not say OFFLINE", !presenceOperatorChipAr("online_fresh").includes("OFFLINE"));
}

// ── token / security boundary ─────────────────────────────────────────────────
{
  const raw = "http://localhost:3000/p/abcdefghijklmnopqrstuvwx";
  ok("presence URL is token-bearing", isTokenBearingUrl(raw));
  ok("presence URL is not a raw uuid path", !raw.includes("/drivers/"));
  const redacted = redactDeliveryUrl(raw);
  ok("redaction strips the presence token", !isTokenBearingUrl(redacted));
  ok("redaction keeps the /p/ prefix", redacted.includes("/p/[redacted]"));
  ok("delivery /d/ redaction still works", redactDeliveryUrl("http://localhost:3000/d/abcdefghijklmnopqrstuvwx").includes("/d/[redacted]"));
}

// ── roster active/inactive stays distinct from presence ───────────────────────
{
  ok("roster helpers still have no ONLINE wording", !`${formatDriverChoice({ name: "أ", phone: "0101", vehicle: null, active: true }, 1)}${rosterSelectHint(4)}`.includes("ONLINE"));
  ok("roster helpers still have no OFFLINE wording", !rosterSelectHint(4).includes("OFFLINE"));
}

// ── wiring: independent page, GPS only while ONLINE, operator visibility ──────
{
  const page = read("app/p/[token]/page.tsx");
  ok("presence page lives at /p/[token], not /d/[token]", page.includes("PresenceClient") && page.includes("getPresenceByToken"));
  ok("presence page does not load a delivery row", !page.includes("getDeliveryByDriverToken"));

  const client = read("app/p/[token]/PresenceClient.tsx");
  ok("explicit ONLINE control", client.includes("presence-go-online") && client.includes("ONLINE"));
  ok("explicit OFFLINE control", client.includes("presence-go-offline") && client.includes("OFFLINE"));
  ok("GPS posts only while ONLINE", client.includes("if (status !== \"online\")") && client.includes("/api/presence/${token}/location"));
  ok("page-open GPS uses watchPosition", client.includes("watchPosition"));
  ok("honest no-background copy", client.includes("إغلاق الصفحة لا يحوّلك إلى OFFLINE"));
  ok("delivery driver page is unchanged (still job GPS toggle)", read("app/d/[token]/DriverClient.tsx").includes("شارك موقعك أثناء التوصيل"));

  const op = read("app/(console)/deliveries/DeliveriesClient.tsx");
  ok("operator shows presence before assignment", op.includes("presenceOperatorChipAr") && op.includes("اختر مندوباً يدوياً"));
  ok("operator roster has a presence chip", op.includes("operator-presence-chip"));
  ok("presence link is copied, not dumped as visible text", op.includes("رابط التواجد") && !op.includes("/p/${"));
  ok("delivery poll wiring is still VISIBLE_POLL_MS + visibilitychange", op.includes("VISIBLE_POLL_MS") && op.includes("visibilitychange"));

  const list = read("lib/db/delivery.ts");
  ok("driver list omits presence_token from the select", list.includes("presence_status") && !list.includes("presence_token,") && list.includes("Token is intentionally omitted"));
  ok("addDriver still writes the roster row", list.includes("presence_status: \"offline\""));

  const mw = read("lib/supabase/middleware.ts");
  ok("presence URL is a public token page", mw.includes('"/p"'));

  const api = read("app/api/presence/[token]/route.ts");
  ok("presence status API is token-scoped", api.includes("params.token") && api.includes("setPresenceStatusByToken"));
  ok("presence API does not look up deliveries", !api.includes("deliveries"));

  const loc = read("app/api/presence/[token]/location/route.ts");
  ok("location API rejects OFFLINE with 409", loc.includes("offline") && loc.includes("409"));

  const link = read("app/api/drivers/[id]/presence-link/route.ts");
  ok("presence-link is manager-gated", link.includes('tenant.role !== "manager"'));
  ok("presence-link does not console.log the token", !link.includes("console.log") && !link.includes("console.error"));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} delivery presence: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
