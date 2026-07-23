// WO-WA-FALLBACK-FAILCLOSED — RED-FIRST proof.
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//     scripts/proof-wa-fallback-failclosed.test.ts
//
// Proves production never guesses "most recent active restaurant" for WhatsApp
// env fallback. The CONTROL below preserves the old algorithm and shows it would
// pick Sweet Shop from the same fake admin recency result.

import { createHmac } from "node:crypto";
import { encryptSecret } from "../lib/crypto/secrets.ts";
import { resolveWebhookAlertRestaurantId, resolveWebhookRestaurantId } from "../lib/db/restaurants.ts";
import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import { POST } from "../app/api/whatsapp/webhook/route.ts";

const WESAYA_ID = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const SWEET_ID = "9244d8ef-1111-4111-8111-111111111111";
const PLATFORM_ID = "aaaaaaaa-2222-4222-8222-222222222222";
const WESAYA_PNID = "1235877629606597";
const SWEET_PNID = "9876543210000";
const GLOBAL_SECRET = "global_app_secret";
const SWEET_SECRET = "sweet_app_secret";
const BRAIN_ENVELOPE_ID = "6f3c68ce-d4c8-4c3d-9daf-a6f0fefdc7f1";
const BRAIN_EVENT_ID = "4ab7a97b-ff8d-4f2f-a3ec-4b51bdcb56e4";
const BRAIN_SCAN_ID = "95c38a5f-8f04-47fc-bc9e-fddfe4822d5f";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

process.env.CREDENTIALS_ENCRYPTION_KEY = "0".repeat(64);
delete process.env.ALERT_WHATSAPP_TO;
delete process.env.ALERT_EMAILS;

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL", name);
  }
};
let contractPass = 0, contractFail = 0;
const contractOk = (name: string, cond: boolean) => {
  if (cond) contractPass++;
  else {
    contractFail++;
    console.log("  FAIL", name);
  }
};

type Call = {
  table: string;
  op: string;
  payload?: unknown;
  select?: string | null;
  filters?: { col: string; val: unknown }[];
};

type RpcCall = {
  name: string;
  args: Record<string, unknown>;
  data: unknown;
  error: { code: string; message: string } | null;
};

function hasFilter(call: Call, col: string, val: unknown): boolean {
  return (call.filters ?? []).some((f) => f.col === col && f.val === val);
}

function makeFakeAdmin(
  opts: {
    sweetTenant?: boolean;
    brainRpcFailure?: "missing_result" | "database_error";
  } = {}
) {
  const calls: Call[] = [];
  const rpcCalls: RpcCall[] = [];
  const recencyQueries: Call[] = [];
  const sweetRow = {
    id: SWEET_ID,
    wa_phone_number_id: SWEET_PNID,
    wa_verify_token: "sweet-verify",
    wa_access_token_enc: encryptSecret("sweet-access-token"),
    wa_app_secret_enc: encryptSecret(SWEET_SECRET),
    wa_configured_at: "2026-01-01T00:00:00Z",
  };

  const resultFor = (state: Call) => {
    if (state.table === "restaurants") {
      if (/wa_phone_number_id/.test(state.select ?? "") && hasFilter(state, "wa_phone_number_id", SWEET_PNID)) {
        return { data: opts.sweetTenant ? sweetRow : null, error: null };
      }
      if (/feature_flags/.test(state.select ?? "")) {
        return { data: { feature_flags: {}, country: "EG" }, error: null };
      }
      if (state.select === "name") {
        return { data: { name: hasFilter(state, "id", PLATFORM_ID) ? "Wesaya" : "Sweet Shop" }, error: null };
      }
      if ((state.select ?? "").split(",").map((s) => s.trim()).includes("id") && hasFilter(state, "active", true)) {
        recencyQueries.push({ ...state, filters: [...(state.filters ?? [])] });
        return { data: { id: SWEET_ID }, error: null };
      }
      return { data: null, error: null };
    }
    if (state.table === "customers" && state.op === "upsert") return { data: { id: "cust-1" }, error: null };
    if (state.table === "conversations" && state.op === "insert") return { data: { id: "conv-1" }, error: null };
    if (state.table === "conversations") return { data: null, error: null };
    if (state.table === "messages" && state.op === "upsert") return { data: [], error: null };
    return { data: null, error: null };
  };

  const listResultFor = (state: Call) => {
    if (state.table === "system_alerts" && state.op === "select") return { data: [], error: null };
    if (state.table === "messages" && state.op === "update") return { data: [], error: null };
    if (state.table === "messages" && state.op === "upsert") return { data: [], error: null };
    return resultFor(state);
  };

  const from = (table: string) => {
    const state: Call = { table, op: "query", select: null, filters: [] };
    const remember = (op: string, payload?: unknown) => {
      state.op = op;
      state.payload = payload;
      calls.push(state);
    };
    const b: Record<string, unknown> = {};
    b.select = (cols?: string) => {
      state.op = state.op === "query" ? "select" : state.op;
      state.select = cols ?? "*";
      if (!calls.includes(state)) calls.push(state);
      return b;
    };
    b.insert = (payload: unknown) => { remember("insert", payload); return b; };
    b.upsert = (payload: unknown) => { remember("upsert", payload); return b; };
    b.update = (payload: unknown) => { remember("update", payload); return b; };
    for (const m of ["eq", "neq", "is", "not", "gt", "gte", "lt", "lte", "order", "limit", "in", "contains"]) {
      b[m] = (col?: string, val?: unknown) => {
        if (m === "eq" && col) state.filters?.push({ col, val });
        return b;
      };
    }
    b.maybeSingle = async () => resultFor(state);
    b.single = async () => resultFor(state);
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(listResultFor(state)).then(resolve, reject);
    return b;
  };

  const rpc = async (name: string, args: Record<string, unknown>) => {
    let data: unknown = null;
    let error: RpcCall["error"] = null;
    if (name === "brain_record_webhook_envelope") {
      if (opts.brainRpcFailure === "missing_result") {
        data = null;
      } else if (opts.brainRpcFailure === "database_error") {
        error = { code: "08006", message: "proof ingress RPC database error" };
      } else {
        data = [{ id: BRAIN_ENVELOPE_ID, inserted: true }];
      }
    } else if (name === "brain_record_channel_event") {
      data = [{ id: BRAIN_EVENT_ID, inserted: true }];
    } else if (name === "brain_complete_ingress_safety_scan") {
      data = [{
        id: BRAIN_SCAN_ID,
        scan_outcome: args.p_scan_outcome,
        evidence_count: Array.isArray(args.p_evidence) ? args.p_evidence.length : 0,
        already_completed: false,
      }];
    } else if (name === "brain_fail_ingress_safety_scan") {
      data = [{ id: BRAIN_SCAN_ID, scan_outcome: "failed" }];
    }
    rpcCalls.push({ name, args, data, error });
    return { data, error };
  };

  return {
    client: { from, rpc } as never,
    calls,
    rpcCalls,
    recencyQueries,
  };
}

async function oldResolveWebhookRestaurantId(admin: ReturnType<typeof makeFakeAdmin>["client"]): Promise<string | null> {
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

function setProdBaseEnv() {
  process.env.NODE_ENV = "production";
  process.env.WHATSAPP_APP_SECRET = GLOBAL_SECRET;
  process.env.WHATSAPP_ACCESS_TOKEN = "global-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = WESAYA_PNID;
  process.env.WHATSAPP_VERIFY_TOKEN = "verify";
}

function unsetTenantEnv() {
  delete process.env.WHATSAPP_RESTAURANT_ID;
  delete process.env.ALERT_PLATFORM_RESTAURANT_ID;
}

function textPayload(phoneNumberId: string) {
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
            id: `wamid.${phoneNumberId}.TEXT`,
            timestamp: "1",
            type: "text",
            text: { body: "عايز اطلب" },
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
          statuses: [{ id: "wamid.OUTBOUND", status: "delivered", timestamp: "1", recipient_id: "201000000000" }],
        },
      }],
    }],
  };
}

async function post(
  payload: unknown,
  secret = GLOBAL_SECRET,
  opts: {
    sweetTenant?: boolean;
    brainRpcFailure?: "missing_result" | "database_error";
  } = {}
) {
  const body = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", secret).update(Buffer.from(body)).digest("hex");
  const fake = makeFakeAdmin(opts);
  __setTestAdminClient(fake.client);
  try {
    const res = await POST(new Request("https://x.test/api/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sig },
      body,
    }) as never);
    return { res, fake };
  } finally {
    __setTestAdminClient(undefined);
  }
}

function systemAlertInserts(calls: Call[]) {
  return calls.filter((c) => c.table === "system_alerts" && c.op === "insert");
}

function messageWritesFor(calls: Call[], restaurantId: string) {
  return calls.filter((c) =>
    c.table === "messages" &&
    (c.op === "insert" || c.op === "upsert" || c.op === "update") &&
    ((c.payload as { restaurant_id?: string } | null)?.restaurant_id === restaurantId ||
      hasFilter(c, "restaurant_id", restaurantId))
  );
}

// CONTROL: the exact old algorithm guesses Sweet Shop from this fake admin.
{
  setProdBaseEnv();
  unsetTenantEnv();
  const fake = makeFakeAdmin();
  const old = await oldResolveWebhookRestaurantId(fake.client);
  ok("CONTROL old resolver guesses most-recent active Sweet Shop", old === SWEET_ID);
}

// Explicit platform alert attachment is unchanged: ALERT_PLATFORM_RESTAURANT_ID wins.
{
  setProdBaseEnv();
  process.env.WHATSAPP_RESTAURANT_ID = WESAYA_ID;
  process.env.ALERT_PLATFORM_RESTAURANT_ID = PLATFORM_ID;
  ok("alert restaurant helper prefers ALERT_PLATFORM_RESTAURANT_ID", resolveWebhookAlertRestaurantId() === PLATFORM_ID);
}

// (a) Production + WHATSAPP_RESTAURANT_ID unset must fail closed, alert, and never persist under Sweet.
{
  setProdBaseEnv();
  unsetTenantEnv();
  process.env.ALERT_PLATFORM_RESTAURANT_ID = PLATFORM_ID;
  const fake = makeFakeAdmin();
  const rid = await resolveWebhookRestaurantId(fake.client);
  ok("prod unset WHATSAPP_RESTAURANT_ID -> resolver returns null (no recency guess)", rid === null);

  const { res, fake: routeFake } = await post(textPayload(WESAYA_PNID));
  const body = await res.json();
  ok("prod unset route returns 503 tenant_resolution_failed", res.status === 503 && body.error === "tenant_resolution_failed");
  ok("prod unset route records webhook_tenant_resolution_failed alert",
    systemAlertInserts(routeFake.calls).some((c) => (c.payload as { type?: string }).type === "webhook_tenant_resolution_failed"));
  ok("prod unset route never persists inbound under Sweet Shop", messageWritesFor(routeFake.calls, SWEET_ID).length === 0);
}

// Both env-fallback branches: statuses must also fail closed instead of updating under Sweet.
{
  setProdBaseEnv();
  unsetTenantEnv();
  process.env.ALERT_PLATFORM_RESTAURANT_ID = PLATFORM_ID;
  const { res, fake } = await post(statusPayload(WESAYA_PNID));
  const body = await res.json();
  ok("prod unset status callback returns 503 tenant_resolution_failed", res.status === 503 && body.error === "tenant_resolution_failed");
  ok("prod unset status callback records tenant-resolution alert",
    systemAlertInserts(fake.calls).some((c) => (c.payload as { type?: string }).type === "webhook_tenant_resolution_failed"));
  ok("prod unset status callback never scopes a message update to Sweet", messageWritesFor(fake.calls, SWEET_ID).length === 0);
}

// If no explicit alert restaurant exists, still 503 + loud console.error, without violating system_alerts.restaurant_id NOT NULL.
{
  setProdBaseEnv();
  unsetTenantEnv();
  const errors: unknown[][] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    const { res, fake } = await post(textPayload(WESAYA_PNID));
    const body = await res.json();
    ok("prod unset with no alert restaurant still returns 503", res.status === 503 && body.error === "tenant_resolution_failed");
    ok("prod unset with no alert restaurant does not insert system_alerts", systemAlertInserts(fake.calls).length === 0);
    ok("prod unset with no alert restaurant logs an unmistakable error",
      errors.some((args) => args.join(" ").includes("WHATSAPP_RESTAURANT_ID") && args.join(" ").includes("ALERT_PLATFORM_RESTAURANT_ID")));
  } finally {
    console.error = origError;
  }
}

// (b) Production + explicit env routes Wesaya and does not query recency.
{
  setProdBaseEnv();
  unsetTenantEnv();
  process.env.WHATSAPP_RESTAURANT_ID = WESAYA_ID;
  const { res, fake } = await post(textPayload(WESAYA_PNID));
  ok("prod env set route stays on good path", res.status === 200);
  ok("prod env set routes/persists under Wesaya", messageWritesFor(fake.calls, WESAYA_ID).length > 0);
  ok("prod env set makes no recency query", fake.recencyQueries.length === 0);
}

// (c) Non-production convenience fallback still returns the recency tenant.
{
  process.env.NODE_ENV = "test";
  unsetTenantEnv();
  const fake = makeFakeAdmin();
  const rid = await resolveWebhookRestaurantId(fake.client);
  ok("non-production unset keeps recency convenience fallback", rid === SWEET_ID);
}

// (d) Sweet Shop's own mapped PNID still routes per-tenant and never touches recency fallback.
{
  setProdBaseEnv();
  unsetTenantEnv();
  const { res, fake } = await post(textPayload(SWEET_PNID), SWEET_SECRET, { sweetTenant: true });
  const body = await res.json();
  ok("Sweet PNID per-tenant route remains 200", res.status === 200);
  ok("Sweet PNID resolves by phone_number_id", body.resolvedBy === "phone_number_id");
  ok("Sweet PNID persists under Sweet Shop", messageWritesFor(fake.calls, SWEET_ID).length > 0);
  ok("Sweet PNID makes no recency query", fake.recencyQueries.length === 0);
}

// E0 ingress-RPC contract: keep this separate from the original 20 routing assertions.
{
  setProdBaseEnv();
  unsetTenantEnv();
  process.env.WHATSAPP_RESTAURANT_ID = WESAYA_ID;
  const { res, fake } = await post(textPayload(WESAYA_PNID));
  const required = [
    "brain_record_webhook_envelope",
    "brain_record_channel_event",
    "brain_complete_ingress_safety_scan",
  ];
  const successfulIds = fake.rpcCalls
    .filter((call) => required.includes(call.name))
    .map((call) => {
      const row = Array.isArray(call.data) ? call.data[0] : null;
      return String((row as { id?: unknown } | null)?.id ?? "");
    });
  contractOk(
    "successful E0 RPCs return distinct realistic envelope/event/scan UUIDs",
    res.status === 200 &&
      required.every((name) => fake.rpcCalls.some((call) => call.name === name && call.error === null)) &&
      successfulIds.length === required.length &&
      new Set(successfulIds).size === required.length &&
      successfulIds.every((id) => UUID_PATTERN.test(id))
  );
}

{
  setProdBaseEnv();
  unsetTenantEnv();
  process.env.WHATSAPP_RESTAURANT_ID = WESAYA_ID;
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const missing = await post(textPayload(WESAYA_PNID), GLOBAL_SECRET, {
      brainRpcFailure: "missing_result",
    });
    const failed = await post(textPayload(WESAYA_PNID), GLOBAL_SECRET, {
      brainRpcFailure: "database_error",
    });
    const missingBody = await missing.res.json();
    const failedBody = await failed.res.json();
    contractOk(
      "missing-result and failed E0 RPCs both return retryable 503",
      missing.res.status === 503 &&
        missingBody.error === "safety_ingress_persist_failed" &&
        failed.res.status === 503 &&
        failedBody.error === "safety_ingress_persist_failed"
    );

    const failureFakes = [missing.fake, failed.fake];
    const hasDownstreamEffect = failureFakes.some((fake) => {
      const downstreamTables = new Set([
        "messages",
        "conversations",
        "agent_runs",
        "brain_execution_effects",
        "outbox_messages",
      ]);
      return (
        fake.calls.some((call) => downstreamTables.has(call.table)) ||
        fake.calls.some((call) => (call.select ?? "").includes("feature_flags")) ||
        JSON.stringify(fake.calls).includes("last_answered_inbound_at") ||
        fake.rpcCalls.some((call) => call.name !== "brain_record_webhook_envelope")
      );
    });
    contractOk(
      "failed E0 RPC causes no message/conversation/AI/watermark/bridge release",
      !hasDownstreamEffect
    );
  } finally {
    console.error = originalError;
  }
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} wa-fallback-failclosed: ${pass}/${pass + fail} passed`);
console.log(
  `${contractFail === 0 ? "PASS" : "FAIL"} wa-fallback E0 RPC contract: ` +
    `${contractPass}/${contractPass + contractFail} passed`
);
if (fail > 0 || contractFail > 0) process.exit(1);
