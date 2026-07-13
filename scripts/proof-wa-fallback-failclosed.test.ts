// ============================================================================
// WO-WA-FALLBACK-FAILCLOSED proof.
//
// RED-FIRST control: the old resolver guessed the newest active restaurant when
// WHATSAPP_RESTAURANT_ID was unset. With Sweet Shop newer than Wesaya, that is a
// cross-tenant misroute. Production must now fail closed instead.
//
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//     scripts/proof-wa-fallback-failclosed.test.ts
// ============================================================================

import { createHmac, randomBytes } from "node:crypto";
import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import { encryptSecret } from "../lib/crypto/secrets.ts";
import { resolveWebhookRestaurantId } from "../lib/db/restaurants.ts";
import { POST } from "../app/api/whatsapp/webhook/route.ts";

const WESAYA = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const SWEET_SHOP = "9244d8ef-66b1-417a-a012-41a389ab1abf";
const WESAYA_PNID = "1204305262760496";
const SWEET_SHOP_PNID = "pnid_sweet_shop";
const APP_SECRET = "test_app_secret";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error("  FAIL:", name);
  }
}

const ENV_KEYS = [
  "NODE_ENV",
  "WHATSAPP_RESTAURANT_ID",
  "ALERT_PLATFORM_RESTAURANT_ID",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_SKIP_SIGNATURE",
  "CREDENTIALS_ENCRYPTION_KEY",
] as const;

type EnvPatch = Partial<Record<(typeof ENV_KEYS)[number], string | null>>;

async function withEnv<T>(patch: EnvPatch, fn: () => Promise<T>): Promise<T> {
  const old: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) old[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
    return await fn();
  } finally {
    for (const k of ENV_KEYS) {
      const v = old[k];
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

interface FakeState {
  calls: Array<{ table: string; op: string; select?: string | null; eqs?: Record<string, unknown> }>;
  inserts: Array<{ table: string; payload: any }>;
  upserts: Array<{ table: string; payload: any }>;
  updates: Array<{ table: string; payload: any }>;
  featureFlagReads: string[];
  recencyQueries: number;
}

function makeFakeAdmin(opts: {
  recencyId?: string | null;
  tenantByPnid?: Record<string, string>;
} = {}) {
  const state: FakeState = {
    calls: [],
    inserts: [],
    upserts: [],
    updates: [],
    featureFlagReads: [],
    recencyQueries: 0,
  };
  const recencyId = opts.recencyId ?? SWEET_SHOP;
  const tenantByPnid = opts.tenantByPnid ?? {};

  const from = (table: string) => {
    const rec = {
      table,
      op: "select",
      select: null as string | null,
      payload: undefined as any,
      eqs: {} as Record<string, unknown>,
    };
    const snapshot = () => ({ table, op: rec.op, select: rec.select, eqs: { ...rec.eqs } });

    const resultForMaybeSingle = async () => {
      state.calls.push(snapshot());
      if (table === "restaurants") {
        const pnid = rec.eqs.wa_phone_number_id;
        if (pnid) {
          const id = tenantByPnid[String(pnid)];
          if (!id) return { data: null, error: null };
          return {
            data: {
              id,
              wa_phone_number_id: String(pnid),
              wa_verify_token: "verify",
              wa_access_token_enc: encryptSecret(`token:${id}`),
              wa_app_secret_enc: null,
              wa_configured_at: "2026-01-01T00:00:00Z",
            },
            error: null,
          };
        }
        state.recencyQueries++;
        return { data: recencyId ? { id: recencyId } : null, error: null };
      }
      if (table === "conversations") return { data: null, error: null };
      return { data: null, error: null };
    };

    const resultForSingle = async () => {
      state.calls.push(snapshot());
      if (table === "customers" && rec.op === "upsert") {
        return { data: { id: `cust:${rec.payload.restaurant_id}` }, error: null };
      }
      if (table === "conversations" && rec.op === "insert") {
        return { data: { id: `conv:${rec.payload.restaurant_id}` }, error: null };
      }
      if (table === "restaurants" && /feature_flags/.test(rec.select ?? "")) {
        const rid = String(rec.eqs.id ?? "");
        state.featureFlagReads.push(rid);
        return { data: { feature_flags: {}, country: "EG" }, error: null };
      }
      return { data: null, error: null };
    };

    const resultForAwait = async () => {
      state.calls.push(snapshot());
      if (table === "messages" && rec.op === "upsert") {
        // Record the target tenant but return no inserted row, so the route never
        // enters the Brain/send path. This keeps the proof focused on routing.
        return { data: [], error: null };
      }
      if (table === "system_alerts" && rec.op === "select") return { data: [], error: null };
      if (rec.op === "insert" || rec.op === "update" || rec.op === "upsert") {
        return { data: null, error: null };
      }
      return { data: [], error: null };
    };

    const b: Record<string, any> = {
      select(cols?: string) {
        rec.op = rec.op === "insert" || rec.op === "upsert" || rec.op === "update" ? rec.op : "select";
        rec.select = cols ?? "*";
        return b;
      },
      insert(payload: any) {
        rec.op = "insert";
        rec.payload = payload;
        state.inserts.push({ table, payload });
        return b;
      },
      upsert(payload: any) {
        rec.op = "upsert";
        rec.payload = payload;
        state.upserts.push({ table, payload });
        return b;
      },
      update(payload: any) {
        rec.op = "update";
        rec.payload = payload;
        state.updates.push({ table, payload });
        return b;
      },
      eq(k: string, v: unknown) { rec.eqs[k] = v; return b; },
      neq() { return b; },
      is(k: string, v: unknown) { rec.eqs[k] = v; return b; },
      not() { return b; },
      in() { return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle: resultForMaybeSingle,
      single: resultForSingle,
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return resultForAwait().then(resolve, reject);
      },
    };
    return b;
  };

  return { client: { from, rpc: async () => ({ data: null, error: null }) }, state };
}

async function oldResolveWebhookRestaurantId(admin: any): Promise<string | null> {
  const envId = process.env.WHATSAPP_RESTAURANT_ID;
  if (envId) return envId;
  const { data } = await admin
    .from("restaurants")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

function inboundPayload(phoneNumberId: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: "Test Customer" }, wa_id: "201000000000" }],
          messages: [{
            from: "201000000000",
            id: `wamid.${phoneNumberId}.${Date.now()}`,
            timestamp: "1700000000",
            type: "text",
            text: { body: "hello" },
          }],
        },
      }],
    }],
  };
}

function statusPayload(phoneNumberId: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: phoneNumberId },
          statuses: [{
            id: `wamid.status.${Date.now()}`,
            status: "delivered",
            timestamp: "1700000000",
            recipient_id: "201000000000",
          }],
        },
      }],
    }],
  };
}

async function postThroughRoute(payload: unknown, admin: any) {
  const body = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", APP_SECRET).update(Buffer.from(body)).digest("hex");
  __setTestAdminClient(admin);
  try {
    const res = await POST(new Request("https://example.test/api/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sig },
      body,
    }) as never);
    const json = typeof (res as any).json === "function" ? await (res as any).json() : null;
    return { status: (res as any).status, json };
  } finally {
    __setTestAdminClient(undefined);
  }
}

function writesForTenant(state: FakeState, tenantId: string): boolean {
  const rows = [...state.inserts, ...state.upserts, ...state.updates].map((x) => x.payload);
  return rows.some((p) => p?.restaurant_id === tenantId || p?.restaurantId === tenantId);
}

async function main() {
  const key = randomBytes(32).toString("hex");

  await withEnv({ NODE_ENV: "production", WHATSAPP_RESTAURANT_ID: null, CREDENTIALS_ENCRYPTION_KEY: key }, async () => {
    const { client } = makeFakeAdmin({ recencyId: SWEET_SHOP });
    const oldRid = await oldResolveWebhookRestaurantId(client);
    const newRid = await resolveWebhookRestaurantId(client as never);
    ok("CONTROL: old resolver returns newest active Sweet Shop when env is unset", oldRid === SWEET_SHOP);
    ok("prod+unset: new resolver fails closed instead of returning Sweet Shop", newRid === null);
  });

  await withEnv({ NODE_ENV: "production", WHATSAPP_RESTAURANT_ID: WESAYA, CREDENTIALS_ENCRYPTION_KEY: key }, async () => {
    const { client, state } = makeFakeAdmin({ recencyId: SWEET_SHOP });
    const rid = await resolveWebhookRestaurantId(client as never);
    ok("prod+env-set: resolver returns Wesaya", rid === WESAYA);
    ok("prod+env-set: resolver never queries recency fallback", state.recencyQueries === 0);
  });

  await withEnv({ NODE_ENV: "development", WHATSAPP_RESTAURANT_ID: null, CREDENTIALS_ENCRYPTION_KEY: key }, async () => {
    const { client } = makeFakeAdmin({ recencyId: SWEET_SHOP });
    const rid = await resolveWebhookRestaurantId(client as never);
    ok("non-prod+unset: convenience recency fallback remains intact", rid === SWEET_SHOP);
  });

  await withEnv({
    NODE_ENV: "production",
    WHATSAPP_RESTAURANT_ID: null,
    ALERT_PLATFORM_RESTAURANT_ID: WESAYA,
    WHATSAPP_PHONE_NUMBER_ID: WESAYA_PNID,
    WHATSAPP_APP_SECRET: APP_SECRET,
    CREDENTIALS_ENCRYPTION_KEY: key,
  }, async () => {
    const { client, state } = makeFakeAdmin({ recencyId: SWEET_SHOP });
    const res = await postThroughRoute(inboundPayload(WESAYA_PNID), client);
    const alert = state.inserts.find((x) => x.table === "system_alerts")?.payload;
    ok("route prod+unset inbound: returns 503 fail-closed", res.status === 503 && res.json?.error === "tenant_resolution_failed");
    ok("route prod+unset inbound: records webhook_tenant_resolution_failed alert", alert?.type === "webhook_tenant_resolution_failed");
    ok("route prod+unset inbound: alert attaches to explicit alert tenant", alert?.restaurant_id === WESAYA);
    ok("route prod+unset inbound: never persists under Sweet Shop", !writesForTenant(state, SWEET_SHOP));
  });

  await withEnv({
    NODE_ENV: "production",
    WHATSAPP_RESTAURANT_ID: null,
    ALERT_PLATFORM_RESTAURANT_ID: null,
    WHATSAPP_PHONE_NUMBER_ID: WESAYA_PNID,
    WHATSAPP_APP_SECRET: APP_SECRET,
    CREDENTIALS_ENCRYPTION_KEY: key,
  }, async () => {
    const { client, state } = makeFakeAdmin({ recencyId: SWEET_SHOP });
    const oldError = console.error;
    const logs: string[] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
    };
    try {
      const res = await postThroughRoute(inboundPayload(WESAYA_PNID), client);
      ok("route prod+unset/no-alert-tenant: returns 503 fail-closed", res.status === 503 && res.json?.error === "tenant_resolution_failed");
      ok("route prod+unset/no-alert-tenant: does not insert system_alerts without a restaurant_id",
        !state.inserts.some((x) => x.table === "system_alerts"));
      ok("route prod+unset/no-alert-tenant: logs a loud no-alert-restaurant error",
        logs.some((line) => line.includes("CRITICAL tenant_resolution_failed_no_alert_restaurant")));
      ok("route prod+unset/no-alert-tenant: never persists under Sweet Shop", !writesForTenant(state, SWEET_SHOP));
    } finally {
      console.error = oldError;
    }
  });

  await withEnv({
    NODE_ENV: "production",
    WHATSAPP_RESTAURANT_ID: null,
    ALERT_PLATFORM_RESTAURANT_ID: WESAYA,
    WHATSAPP_PHONE_NUMBER_ID: WESAYA_PNID,
    WHATSAPP_APP_SECRET: APP_SECRET,
    CREDENTIALS_ENCRYPTION_KEY: key,
  }, async () => {
    const { client, state } = makeFakeAdmin({ recencyId: SWEET_SHOP });
    const res = await postThroughRoute(statusPayload(WESAYA_PNID), client);
    const alert = state.inserts.find((x) => x.table === "system_alerts")?.payload;
    ok("route prod+unset status: returns 503 fail-closed", res.status === 503 && res.json?.error === "tenant_resolution_failed");
    ok("route prod+unset status: records alert with status source", alert?.context?.source === "status_env_fallback");
    ok("route prod+unset status: never updates Sweet Shop status rows", !writesForTenant(state, SWEET_SHOP));
  });

  await withEnv({
    NODE_ENV: "production",
    WHATSAPP_RESTAURANT_ID: WESAYA,
    ALERT_PLATFORM_RESTAURANT_ID: null,
    WHATSAPP_PHONE_NUMBER_ID: WESAYA_PNID,
    WHATSAPP_APP_SECRET: APP_SECRET,
    CREDENTIALS_ENCRYPTION_KEY: key,
  }, async () => {
    const { client, state } = makeFakeAdmin({ recencyId: SWEET_SHOP });
    const res = await postThroughRoute(inboundPayload(WESAYA_PNID), client);
    ok("route prod+env-set: does not fail closed", res.status !== 503);
    ok("route prod+env-set: persists via Wesaya env fallback", writesForTenant(state, WESAYA));
    ok("route prod+env-set: never queries recency fallback", state.recencyQueries === 0);
  });

  await withEnv({
    NODE_ENV: "development",
    WHATSAPP_RESTAURANT_ID: null,
    WHATSAPP_PHONE_NUMBER_ID: WESAYA_PNID,
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_SKIP_SIGNATURE: "true",
    CREDENTIALS_ENCRYPTION_KEY: key,
  }, async () => {
    const { client, state } = makeFakeAdmin({ recencyId: SWEET_SHOP });
    const res = await postThroughRoute(inboundPayload(WESAYA_PNID), client);
    ok("route non-prod+unset: convenience fallback does not fail closed", res.status !== 503);
    ok("route non-prod+unset: convenience fallback can still persist newest active", writesForTenant(state, SWEET_SHOP));
  });

  await withEnv({
    NODE_ENV: "production",
    WHATSAPP_RESTAURANT_ID: null,
    ALERT_PLATFORM_RESTAURANT_ID: WESAYA,
    WHATSAPP_PHONE_NUMBER_ID: WESAYA_PNID,
    WHATSAPP_APP_SECRET: APP_SECRET,
    CREDENTIALS_ENCRYPTION_KEY: key,
  }, async () => {
    const { client, state } = makeFakeAdmin({
      recencyId: WESAYA,
      tenantByPnid: { [SWEET_SHOP_PNID]: SWEET_SHOP },
    });
    const res = await postThroughRoute(inboundPayload(SWEET_SHOP_PNID), client);
    ok("route mapped Sweet Shop PNID: does not fail closed", res.status !== 503);
    ok("route mapped Sweet Shop PNID: per-tenant mapping still wins", writesForTenant(state, SWEET_SHOP));
    ok("route mapped Sweet Shop PNID: no recency query needed", state.recencyQueries === 0);
  });

  console.log(`\nWA FALLBACK FAIL-CLOSED: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

await main();
