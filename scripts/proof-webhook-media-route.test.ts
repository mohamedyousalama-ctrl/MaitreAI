// WO-LIVE-3 §6 — ROUTE-LEVEL red-first proof (NEW standing proof class for every
// inbound-path WO). Posts real webhook bodies through the ACTUAL POST handler with a
// fake admin injected, and asserts the inbound-handling block is ENTERED — proven by
// the flags read at route.ts (`restaurants.select("feature_flags…")`), which happens
// ONLY inside that block. A location-only / image-only webhook (each its own delivery,
// per Meta) has zero text messages, so on main the `messages.length > 0` guard skips
// the block and those reads never happen — the two cases FAIL on main, PASS on the fix.
//
// Why the unit proofs of #402 (locations) / #415 (images) missed this: they tested the
// pure normalizers (normalizeWhatsAppLocations / normalizeWhatsAppImages) in isolation
// and confirmed they PARSE the payload — but never drove the ROUTE, where the branches
// that CALL those normalizers sit inside the text-gated block and were unreachable.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-webhook-media-route.test.ts

process.env.WHATSAPP_SKIP_SIGNATURE = "true";
process.env.WHATSAPP_RESTAURANT_ID = "r1"; // resolveWebhookRestaurantId short-circuits (no query)

import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import { POST } from "../app/api/whatsapp/webhook/route.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// A tiny chainable fake Supabase client that RECORDS every .from(table).select(...) and
// returns the tenant flags for the one read we assert on; everything else returns a
// benign error so the downstream persist fails gracefully inside the branch try/catch
// (the route still returns 200 — we only need to observe that the block was entered).
function makeFakeAdmin() {
  const calls: { table: string; select: string | null }[] = [];
  const from = (table: string) => {
    const rec: { table: string; select: string | null } = { table, select: null };
    const flagsRead = () =>
      table === "restaurants" && !!rec.select && /feature_flags/.test(rec.select);
    const result = () =>
      flagsRead()
        ? { data: { feature_flags: { delivery_geo_routing: true, media_turn_trigger: true }, country: "EG" }, error: null }
        : { data: null, error: { message: "fake", code: "FAKE" } };
    const b: Record<string, unknown> = {};
    for (const m of ["insert", "update", "upsert", "delete", "eq", "neq", "is", "not", "gt", "gte", "lt", "lte", "order", "limit", "in", "contains"]) {
      b[m] = () => b;
    }
    b.select = (cols?: string) => { rec.select = cols ?? "*"; calls.push(rec); return b; };
    b.maybeSingle = async () => result();
    b.single = async () => result();
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(flagsRead() ? result() : { data: [], error: null }).then(res);
    return b;
  };
  return { client: { from, rpc: async () => ({ data: null, error: null }) }, calls };
}

const entry = { changes: [{ field: "messages", value: { messaging_product: "whatsapp", contacts: [{ profile: { name: "T" }, wa_id: "20100000000" }] } }] } as Record<string, unknown>;
function body(messages: unknown[]) {
  const v = { ...(entry.changes as any)[0].value, messages };
  return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: v }] }] };
}
async function post(payload: unknown): Promise<{ table: string; select: string | null }[]> {
  const { client, calls } = makeFakeAdmin();
  __setTestAdminClient(client);
  try {
    const req = new Request("https://x/api/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    await POST(req as never);
  } finally {
    __setTestAdminClient(undefined);
  }
  return calls;
}
const enteredBlock = (calls: { table: string; select: string | null }[]) =>
  calls.some((c) => c.table === "restaurants" && !!c.select && /feature_flags/.test(c.select));

const LOCATION_MSG = { from: "20100000000", id: "wamid.LOC1", timestamp: "1", type: "location", location: { latitude: 30.05, longitude: 31.23 } };
const IMAGE_MSG = { from: "20100000000", id: "wamid.IMG1", timestamp: "1", type: "image", image: { id: "media-1", mime_type: "image/jpeg", caption: "" } };
const TEXT_MSG = { from: "20100000000", id: "wamid.TXT1", timestamp: "1", type: "text", text: { body: "عايز اطلب" } };

// The four cases run in sequence (top-level await).
const locationOnly = await post(body([LOCATION_MSG]));
const imageOnly = await post(body([IMAGE_MSG]));
const textOnly = await post(body([TEXT_MSG]));
const empty = await post(body([]));

// ── RED-FIRST: these two FAIL on main (block skipped for a text-less webhook) ──
ok("location-only webhook ENTERS the inbound block (tenant/flags/ingest reachable)", enteredBlock(locationOnly));
ok("image-only webhook ENTERS the inbound block", enteredBlock(imageOnly));
// ── Regression: the text path is unchanged (still enters) ──
ok("text-only webhook still ENTERS the inbound block (byte-identical text path)", enteredBlock(textOnly));
// ── An empty webhook (no messages/locations/images) must NOT enter the block ──
ok("empty webhook does NOT enter the block (no needless work)", !enteredBlock(empty));

console.log(`\n${fail === 0 ? "✅" : "❌"} webhook-media-route: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
