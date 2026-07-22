// WO-FIX-STT-GUARD behavior proof.
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-stt-guard.test.ts

import { createHmac } from "node:crypto";
import {
  getSttAdapter,
  isMockSttProductionError,
  MockSttProductionError,
  resolveSttAdapterName,
} from "../lib/ai/stt/index.ts";
import { mockSttAdapter } from "../lib/ai/stt/mock.ts";
import { transcribeWhatsAppVoice, VOICE_STT_UNAVAILABLE_TRANSCRIPT } from "../lib/messaging/voice.ts";
import { garbledVoiceReply } from "../lib/ai/voice-quality.ts";
import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import { POST } from "../app/api/whatsapp/webhook/route.ts";

let pass = 0;
let fail = 0;

function ok(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    pass++;
    return;
  }
  fail++;
  console.log("  FAIL", name, detail ?? "");
}

const ENV_KEYS = [
  "NODE_ENV",
  "STT_ADAPTER",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "DEEPGRAM_API_KEY",
  "ENABLE_MOCK_STT",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_RESTAURANT_ID",
  "WHATSAPP_SKIP_SIGNATURE",
  "ALERT_EMAILS",
  "ALERT_WHATSAPP_TO",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearSttEnv() {
  delete process.env.STT_ADAPTER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.ENABLE_MOCK_STT;
}

async function captureError(fn: () => unknown | Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

type Call = {
  table: string;
  op: string;
  payload?: unknown;
  select?: string | null;
  filters: { col: string; val: unknown }[];
};

function makeFakeAdmin() {
  const calls: Call[] = [];

  function hasFilter(call: Call, col: string, val: unknown): boolean {
    return call.filters.some((filter) => filter.col === col && filter.val === val);
  }

  function resultFor(call: Call) {
    if (call.table === "restaurants") {
      if ((call.select ?? "").includes("wa_phone_number_id")) return { data: null, error: null };
      if ((call.select ?? "").includes("feature_flags")) return { data: { feature_flags: {}, country: "EG" }, error: null };
      if ((call.select ?? "").split(",").map((part) => part.trim()).includes("id") && hasFilter(call, "id", "restaurant-stt")) {
        return { data: { id: "restaurant-stt" }, error: null };
      }
      return { data: null, error: null };
    }
    if (call.table === "customers" && call.op === "upsert") return { data: { id: "customer-stt" }, error: null };
    if (call.table === "conversations" && call.op === "select") return { data: null, error: null };
    if (call.table === "conversations" && call.op === "insert") return { data: { id: "conversation-stt" }, error: null };
    if (call.table === "messages" && call.op === "upsert") return { data: [{ id: "message-inbound-stt" }], error: null };
    if (call.table === "messages" && call.op === "insert") return { data: [{ id: "message-outbound-stt" }], error: null };
    if (call.table === "messages" && call.op === "update") return { data: [], error: null };
    if (call.table === "system_alerts" && call.op === "select") return { data: [], error: null };
    if (call.table === "system_alerts" && call.op === "insert") return { data: [{ id: "alert-stt" }], error: null };
    if (call.table === "agent_runs" && call.op === "insert") return { data: [{ id: "agent-run-stt" }], error: null };
    return { data: [], error: null };
  }

  const from = (table: string) => {
    const call: Call = { table, op: "query", select: null, filters: [] };
    const remember = (op: string, payload?: unknown) => {
      call.op = op;
      call.payload = payload;
      if (!calls.includes(call)) calls.push(call);
    };
    const builder: Record<string, unknown> = {};
    builder.select = (cols?: string) => {
      if (call.op === "query") call.op = "select";
      call.select = cols ?? "*";
      if (!calls.includes(call)) calls.push(call);
      return builder;
    };
    builder.insert = (payload: unknown) => {
      remember("insert", payload);
      return builder;
    };
    builder.upsert = (payload: unknown) => {
      remember("upsert", payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      remember("update", payload);
      return builder;
    };
    for (const method of ["eq", "neq", "is", "not", "gt", "gte", "lt", "lte", "order", "limit", "in", "contains"]) {
      builder[method] = (col?: string, val?: unknown) => {
        if (method === "eq" && col) call.filters.push({ col, val });
        return builder;
      };
    }
    builder.maybeSingle = async () => resultFor(call);
    builder.single = async () => resultFor(call);
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(resultFor(call)).then(resolve, reject);
    return builder;
  };

  return {
    client: { from, rpc: async () => ({ data: null, error: null }) } as never,
    calls,
  };
}

function voicePayload() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "pnid-stt" },
              contacts: [{ profile: { name: "Voice Customer" }, wa_id: "201000000000" }],
              messages: [
                {
                  from: "201000000000",
                  id: "wamid.VOICE.STT.GUARD",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "audio",
                  audio: { id: "media-stt-guard", mime_type: "audio/ogg", voice: true },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function postSignedVoiceWebhook() {
  process.env.NODE_ENV = "production";
  process.env.WHATSAPP_APP_SECRET = "stt-guard-secret";
  process.env.WHATSAPP_ACCESS_TOKEN = "wa-token-stt-guard";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "pnid-stt";
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-stt";
  process.env.WHATSAPP_RESTAURANT_ID = "restaurant-stt";
  delete process.env.WHATSAPP_SKIP_SIGNATURE;
  delete process.env.ALERT_EMAILS;
  delete process.env.ALERT_WHATSAPP_TO;

  const payload = voicePayload();
  const body = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", process.env.WHATSAPP_APP_SECRET).update(Buffer.from(body)).digest("hex");
  const fake = makeFakeAdmin();
  const graphSends: unknown[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    graphSends.push(init?.body ? JSON.parse(String(init.body)) : null);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.OUT.STT.FALLBACK" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  __setTestAdminClient(fake.client);
  try {
    const res = await POST(
      new Request("https://x.test/api/whatsapp/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": sig },
        body,
      }) as never
    );
    return { res, fake, graphSends };
  } finally {
    __setTestAdminClient(undefined);
    globalThis.fetch = originalFetch;
  }
}

try {
  clearSttEnv();
  process.env.NODE_ENV = "production";
  const adapterError = await captureError(() => getSttAdapter());
  ok("production without STT keys makes getSttAdapter throw the named mock-STT error", isMockSttProductionError(adapterError), adapterError);
  ok("the thrown error is the exported MockSttProductionError class", adapterError instanceof MockSttProductionError, adapterError);

  const mockError = await captureError(() => mockSttAdapter.transcribe(Buffer.from([])));
  ok("production mock transcription itself throws", isMockSttProductionError(mockError), mockError);
  ok("production mock transcription never returns fabricated burger text", !JSON.stringify(mockError).includes("برجر كلاسيك"));

  clearSttEnv();
  process.env.NODE_ENV = "production";
  process.env.ENABLE_MOCK_STT = "true";
  const explicitDemo = getSttAdapter();
  const demoTranscript = await explicitDemo.transcribe(Buffer.from([]));
  ok("production ENABLE_MOCK_STT=true preserves explicit mock demo opt-in", explicitDemo.name === "mock" && demoTranscript.text.includes("برجر كلاسيك"));

  clearSttEnv();
  process.env.NODE_ENV = "test";
  const testAdapter = getSttAdapter();
  const testTranscript = await testAdapter.transcribe(Buffer.from([]));
  ok("non-production mock remains allowed and unchanged", testAdapter.name === "mock" && testTranscript.text.includes("تفريغ تجريبي"));

  clearSttEnv();
  process.env.NODE_ENV = "production";
  const voiceError = await captureError(() => transcribeWhatsAppVoice("media-stt-guard"));
  ok("transcribeWhatsAppVoice is independently guarded when called directly", isMockSttProductionError(voiceError), voiceError);

  clearSttEnv();
  process.env.NODE_ENV = "production";
  process.env.GROQ_API_KEY = "gsk-stt-proof";
  ok("auto Groq selection is unchanged", getSttAdapter().name === "groq" && resolveSttAdapterName() === "groq");

  clearSttEnv();
  process.env.NODE_ENV = "production";
  process.env.OPENAI_API_KEY = "sk-stt-proof";
  ok("auto OpenAI selection is unchanged", getSttAdapter().name === "openai" && resolveSttAdapterName() === "openai");

  clearSttEnv();
  process.env.NODE_ENV = "production";
  process.env.STT_ADAPTER = "deepgram";
  ok("explicit Deepgram selection is unchanged", getSttAdapter().name === "deepgram" && resolveSttAdapterName() === "deepgram");

  clearSttEnv();
  const { res, fake, graphSends } = await postSignedVoiceWebhook();
  const routeBody = await res.json();
  ok("production voice without STT returns webhook 200 after safe handling", res.status === 200 && routeBody.ok === true, routeBody);

  const messageWrites = fake.calls.filter((call) => call.table === "messages");
  const inbound = messageWrites.find((call) => call.op === "upsert")?.payload as { text?: string } | undefined;
  const outbound = messageWrites.find((call) => call.op === "insert")?.payload as { text?: string; meta?: Record<string, unknown> } | undefined;
  const alert = fake.calls.find((call) => call.table === "system_alerts" && call.op === "insert")?.payload as { type?: string } | undefined;
  const sentBody = graphSends[0] as { text?: { body?: string } } | undefined;

  ok("webhook persists an honest voice-unavailable marker, not fabricated order text",
    inbound?.text === VOICE_STT_UNAVAILABLE_TRANSCRIPT && !JSON.stringify(inbound).includes("برجر كلاسيك"),
    inbound);
  ok("webhook sends the deterministic canonical voice fallback",
    outbound?.text === garbledVoiceReply("egyptian") && sentBody?.text?.body === garbledVoiceReply("egyptian"),
    { outbound, sentBody });
  ok("webhook fallback is not a generic/internal error string",
    !JSON.stringify({ outbound, sentBody }).includes("تعذّر توليد رد المساعد") &&
      !JSON.stringify({ outbound, sentBody }).includes("MOCK_STT_PRODUCTION_BLOCKED"),
    { outbound, sentBody });
  ok("webhook records production mock-STT attempt as an operational incident",
    alert?.type === "voice_stt_unavailable" && outbound?.meta?.kind === "voice_stt_unavailable_fallback",
    { alert, outbound });
  ok("webhook does not log fake STT cost or run the agent on unavailable ASR",
    !fake.calls.some((call) => call.table === "agent_runs" && call.op === "insert"),
    fake.calls.filter((call) => call.table === "agent_runs"));
} finally {
  __setTestAdminClient(undefined);
  globalThis.fetch = originalFetch;
  restoreEnv();
}

console.log(`STT GUARD PROOF: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
