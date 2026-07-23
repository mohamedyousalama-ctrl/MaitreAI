// ============================================================================
// WO-ENG-E0 safety ingress acceptance proof.
//
// Production data is never read. Proofs 1 and 2 start from the committed Wesaya
// production flag fixture and apply only the override named in each test title.
//
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//     scripts/proof-e0-safety-ingress.test.ts
// ============================================================================

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  handleWhatsAppBrainIngress,
  MemoryBrainIngressStore,
  normalizeWhatsAppBrainEvents,
  persistVerifiedWhatsAppBrainIngress,
  recordSpeechTranscriptSafetyInbound,
  scanRawMessageForSafety,
  type BrainIngressSafetyScan,
  type BrainIngressStore,
  type BrainIngressTenantResolver,
  type BrainSafetyEvidence,
} from "../lib/brain/ingress/index.ts";
import { sha256Hex } from "../lib/brain/ingress/signature.ts";
import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import { POST as postWhatsAppWebhook } from "../app/api/whatsapp/webhook/route.ts";
import {
  hashWesayaProductionFeatureFlags,
  WESAYA_PRODUCTION_FEATURE_FLAGS,
  WESAYA_PRODUCTION_FEATURE_FLAGS_CAPTURED_AT,
  WESAYA_PRODUCTION_FEATURE_FLAGS_HASH_ALGORITHM,
  WESAYA_PRODUCTION_FEATURE_FLAGS_SHA256,
  wesayaProductionFlags,
  type WesayaProductionFeatureFlags,
} from "./fixtures/wesaya-production-flags.ts";

const tenantA = "00000000-0000-4000-8000-00000000000a";
const tenantB = "00000000-0000-4000-8000-00000000000b";
const phoneA = "111111111111111";
const secretA = "tenant-a-e0-secret";
const migrationPath = resolve(process.cwd(), "supabase/migrations/0104_safety_ingress_evidence.sql");
const routePath = resolve(process.cwd(), "app/api/whatsapp/webhook/route.ts");
const adminPath = resolve(process.cwd(), "lib/supabase/admin.ts");
const storePath = resolve(process.cwd(), "lib/brain/ingress/store.ts");
const handlerPath = resolve(process.cwd(), "lib/brain/ingress/handler.ts");

let passed = 0;
let failed = 0;

function invariant(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(detail);
}

type FlagKey = keyof WesayaProductionFeatureFlags;

function assertCompleteWesayaVector(
  flags: Record<FlagKey, boolean>,
  expectedOverrides: Partial<Record<FlagKey, boolean>>
): void {
  const baseKeys = Object.keys(WESAYA_PRODUCTION_FEATURE_FLAGS).sort();
  const keys = Object.keys(flags).sort();
  invariant(
    keys.length === 34 && JSON.stringify(keys) === JSON.stringify(baseKeys),
    "test flags do not contain the complete committed Wesaya vector"
  );
  for (const [key, expected] of Object.entries(expectedOverrides)) {
    invariant(flags[key as FlagKey] === expected, `${key} named override was not applied`);
  }
  const unexpectedDiffs = baseKeys.filter(
    (key) =>
      flags[key as FlagKey] !== WESAYA_PRODUCTION_FEATURE_FLAGS[key as FlagKey] &&
      !(key in expectedOverrides)
  );
  invariant(unexpectedDiffs.length === 0, `unnamed fixture overrides: ${unexpectedDiffs.join(", ")}`);
  invariant(
    WESAYA_PRODUCTION_FEATURE_FLAGS_CAPTURED_AT === "2026-07-23T15:17:44.000Z" &&
      WESAYA_PRODUCTION_FEATURE_FLAGS_HASH_ALGORITHM === "SHA-256" &&
      WESAYA_PRODUCTION_FEATURE_FLAGS_SHA256 ===
        "d46a986932499c21b00ec6718d93e1d1e255c905344b0e2291ed8e4ae7ab2a0f" &&
      hashWesayaProductionFeatureFlags() === WESAYA_PRODUCTION_FEATURE_FLAGS_SHA256,
    "committed Wesaya fixture metadata or integrity hash does not match the audited capture"
  );
}

async function proof(number: number, name: string, run: () => void | Promise<void>) {
  try {
    await run();
    passed++;
    console.log(`PASS ${number}. ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${number}. ${name}:`, error instanceof Error ? error.message : error);
  }
}

async function rejects(run: () => Promise<unknown>, detail: string) {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  invariant(rejected, detail);
}

async function rejectedError(run: () => Promise<unknown>, detail: string): Promise<Error> {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error(detail);
}

const resolver: BrainIngressTenantResolver = {
  async resolveByPhoneNumberId(phoneNumberId) {
    if (phoneNumberId !== phoneA) return null;
    return { tenantId: tenantA, phoneNumberId: phoneA, appSecrets: [secretA] };
  },
};

function signedBody(payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = "sha256=" + createHmac("sha256", secretA).update(Buffer.from(body, "utf8")).digest("hex");
  return { body, signature };
}

function webhookPayload(messages: unknown[]) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_E0_PROOF",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phoneA, display_phone_number: "+966000000000" },
              contacts: [{ profile: { name: "Proof Customer" }, wa_id: "966500000000" }],
              messages,
            },
          },
        ],
      },
    ],
  };
}

function textMessage(id: string, text: string) {
  return {
    from: "966500000000",
    id,
    timestamp: "1790000000",
    type: "text",
    text: { body: text },
  };
}

type SafetyConflictCode = "KIV01" | "KIV02" | "KIV03";

interface AlertGateDbCall {
  readonly table: string;
  op: string;
  payload?: unknown;
  select?: string;
  readonly filters: Array<{ column: string; value: unknown }>;
}

function makeAlertGateAdmin(failureCode: SafetyConflictCode) {
  const calls: AlertGateDbCall[] = [];
  const sequence: string[] = [];
  const activeAlerts: Array<{
    id: string;
    conversation_id: string | null;
    context: Record<string, unknown>;
  }> = [];
  const failingRpc =
    failureCode === "KIV02"
      ? "brain_record_channel_event"
      : "brain_complete_ingress_safety_scan";

  const rpc = async (name: string) => {
    sequence.push(`rpc:${name}`);
    if (name === failingRpc || (failureCode === "KIV03" && name === "brain_fail_ingress_safety_scan")) {
      sequence.push(`rpc-error:${name}:${failureCode}`);
      return {
        data: null,
        error: {
          code: failureCode,
          message: `${failureCode} forced E0 alert-gate conflict`,
        },
      };
    }
    if (name === "brain_record_webhook_envelope") {
      return {
        data: [{ id: "00000000-0000-4000-8000-0000000000e0", inserted: true }],
        error: null,
      };
    }
    if (name === "brain_record_channel_event") {
      return {
        data: [{ id: "00000000-0000-4000-8000-0000000000e1", inserted: true }],
        error: null,
      };
    }
    if (name === "brain_fail_ingress_safety_scan") {
      return {
        data: [{ id: "00000000-0000-4000-8000-0000000000e2", scan_outcome: "failed" }],
        error: null,
      };
    }
    throw new Error(`unexpected alert-gate RPC: ${name}`);
  };

  const from = (table: string) => {
    const state: AlertGateDbCall = { table, op: "query", filters: [] };
    const builder: Record<string, unknown> = {};
    builder.select = (columns?: string) => {
      if (state.op === "query") state.op = "select";
      state.select = columns;
      if (!calls.includes(state)) calls.push(state);
      return builder;
    };
    builder.insert = (payload: unknown) => {
      state.op = "insert";
      state.payload = payload;
      calls.push(state);
      if (table === "system_alerts") {
        sequence.push("db:system_alerts:insert");
        const row = payload as {
          conversation_id?: string | null;
          context?: Record<string, unknown>;
        };
        activeAlerts.push({
          id: `alert-${activeAlerts.length + 1}`,
          conversation_id: row.conversation_id ?? null,
          context: row.context ?? {},
        });
      }
      return builder;
    };
    builder.upsert = (payload: unknown) => {
      state.op = "upsert";
      state.payload = payload;
      calls.push(state);
      if (table === "system_alerts") {
        sequence.push("db:system_alerts:upsert");
        const row = payload as {
          id: string;
          conversation_id?: string | null;
          context?: Record<string, unknown>;
        };
        const existing = activeAlerts.find((alert) => alert.id === row.id);
        if (existing) {
          existing.conversation_id = row.conversation_id ?? null;
          existing.context = row.context ?? {};
        } else {
          activeAlerts.push({
            id: row.id,
            conversation_id: row.conversation_id ?? null,
            context: row.context ?? {},
          });
        }
      }
      return builder;
    };
    builder.update = (payload: unknown) => {
      state.op = "update";
      state.payload = payload;
      calls.push(state);
      if (table === "system_alerts") {
        sequence.push("db:system_alerts:update");
        const context = (payload as { context?: Record<string, unknown> }).context;
        if (context && activeAlerts[0]) activeAlerts[0].context = context;
      }
      return builder;
    };
    for (const method of ["eq", "is", "order", "limit"]) {
      builder[method] = (column?: string, value?: unknown) => {
        if ((method === "eq" || method === "is") && column) {
          state.filters.push({ column, value });
        }
        return builder;
      };
    }
    const result = () => {
      if (table === "system_alerts" && state.op === "select") {
        return { data: activeAlerts.map((alert) => ({ ...alert })), error: null };
      }
      if (table === "system_alerts" && state.op === "upsert") {
        return {
          data: { id: (state.payload as { id?: string } | undefined)?.id ?? null },
          error: null,
        };
      }
      return { data: null, error: null };
    };
    builder.maybeSingle = async () => {
      if (table === "restaurants" && state.select === "name") {
        return { data: { name: "E0 Proof Restaurant" }, error: null };
      }
      return result();
    };
    builder.single = async () => result();
    builder.then = (
      resolveResult: (value: unknown) => unknown,
      rejectResult?: (reason: unknown) => unknown
    ) => Promise.resolve(result()).then(resolveResult, rejectResult);
    return builder;
  };

  return {
    client: { from, rpc } as never,
    calls,
    sequence,
    activeAlerts,
  };
}

async function postAlertGateConflict(
  failureCode: SafetyConflictCode,
  fake = makeAlertGateAdmin(failureCode)
) {
  process.env.NODE_ENV = "production";
  process.env.WHATSAPP_APP_SECRET = secretA;
  process.env.WHATSAPP_ACCESS_TOKEN = "e0-proof-access-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = phoneA;
  process.env.WHATSAPP_VERIFY_TOKEN = "e0-proof-verify-token";
  process.env.WHATSAPP_RESTAURANT_ID = tenantA;
  delete process.env.ALERT_EMAILS;
  delete process.env.ALERT_WHATSAPP_TO;

  const signed = signedBody(
    webhookPayload([textMessage("wamid.e0.alert-gate", "عايز اطلب")])
  );
  __setTestAdminClient(fake.client);
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const response = await postWhatsAppWebhook(
      new Request("https://e0.test/api/whatsapp/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signed.signature,
        },
        body: signed.body,
      }) as never
    );
    return { response, body: await response.json(), fake };
  } finally {
    console.error = originalError;
    __setTestAdminClient(undefined);
  }
}

function imageMessage(id: string, caption: string, visionDescription?: string) {
  return {
    from: "966500000000",
    id,
    timestamp: "1790000000",
    type: "image",
    image: {
      id: `media-${id}`,
      mime_type: "image/jpeg",
      caption,
      // Deliberately not part of Meta's schema. The normalizer must ignore it.
      description: visionDescription,
    },
  };
}

function voiceMessage(id: string) {
  return {
    from: "966500000000",
    id,
    timestamp: "1790000000",
    type: "audio",
    audio: { id: `audio-${id}`, mime_type: "audio/ogg", voice: true },
  };
}

async function ingest(store: BrainIngressStore, payload: unknown) {
  const signed = signedBody(payload);
  return await handleWhatsAppBrainIngress({
    rawBody: signed.body,
    signatureHeader: signed.signature,
    tenantResolver: resolver,
    store,
  });
}

function exactEvidence(store: MemoryBrainIngressStore, sourceMessageId: string) {
  const scan = store.scans.find((candidate) => candidate.sourceMessageId === sourceMessageId);
  if (!scan) return [];
  return store.evidence.filter((candidate) => candidate.scanId === scan.id);
}

function validEvidence(excerpt = "حساسية"): BrainSafetyEvidence {
  return {
    evidenceClass: "customer_text",
    disclosureClass: "allergy",
    matchedExcerpt: excerpt,
    startOffset: 0,
    endOffset: excerpt.length,
    excerptHash: sha256Hex(excerpt),
    customerAuthored: true,
    audioMessageReference: null,
    transcriptionProvider: null,
    transcriptionModel: null,
  };
}

function scanParent(channelEventId: string, text = "عندي حساسية"): BrainIngressSafetyScan {
  return {
    ...scanRawMessageForSafety(
      {
        sourceMessageId: `source-${channelEventId}`,
        messageType: "text",
        text,
        raw: { text },
      },
      tenantA
    ),
    channelEventId,
  };
}

const sql = readFileSync(migrationPath, "utf8");
const routeSource = readFileSync(routePath, "utf8");
const adminSource = readFileSync(adminPath, "utf8");
const storeSource = readFileSync(storePath, "utf8");
const handlerSource = readFileSync(handlerPath, "utf8");

function sqlFunctionDefinition(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = sql.indexOf("\n$$;", start);
  invariant(start >= 0 && end > start, `${name} definition is missing`);
  return sql.slice(start, end);
}

await proof(
  1,
  "human ownership + explicit allergy_simple=true override records evidence before ownership",
  async () => {
    const flags = wesayaProductionFlags({ allergy_simple: true });
    assertCompleteWesayaVector(flags, { allergy_simple: true });
    const store = new MemoryBrainIngressStore();
    const source = "عندي حساسية من المكسرات";
    const payload = webhookPayload([{ ...textMessage("wamid.e0.human", source), ownership: "human" }]);
    const result = await ingest(store, payload);
    const evidence = exactEvidence(store, "wamid.e0.human");
    invariant(result.ok && evidence.length > 0, "human-owned disclosure was not recorded");
    for (const row of evidence) {
      invariant(source.slice(row.startOffset, row.endOffset) === row.matchedExcerpt, "excerpt offsets are not exact");
      invariant(sha256Hex(row.matchedExcerpt) === row.excerptHash, "excerpt hash does not match exact text");
      invariant(row.customerAuthored, "typed disclosure was not marked customer-authored");
    }
  }
);

await proof(
  2,
  "image caption + explicit media_turn_trigger=false override is persisted and scanned",
  async () => {
    const flags = wesayaProductionFlags({ media_turn_trigger: false });
    assertCompleteWesayaVector(flags, { media_turn_trigger: false });
    const store = new MemoryBrainIngressStore();
    const caption = "عندي حساسية من اللبن";
    const result = await ingest(
      store,
      webhookPayload([imageMessage("wamid.e0.image", caption, "derived vision says peanuts")])
    );
    const evidence = exactEvidence(store, "wamid.e0.image");
    invariant(result.ok && evidence.length > 0, "caption evidence was not recorded");
    invariant(evidence.every((row) => caption.includes(row.matchedExcerpt)), "evidence came from outside the caption");
  }
);

await proof(3, "plain text, burst fragments, and a derived speech transcript are each recorded", async () => {
  const store = new MemoryBrainIngressStore();
  const payload = webhookPayload([
    textMessage("wamid.e0.plain", "عندي حساسية من السمسم"),
    textMessage("wamid.e0.burst.1", "عندي حساسية"),
    textMessage("wamid.e0.burst.2", "من اللبن"),
    voiceMessage("wamid.e0.voice"),
  ]);
  const signed = signedBody(payload);
  const result = await persistVerifiedWhatsAppBrainIngress({
    rawBody: signed.body,
    payload,
    tenantId: tenantA,
    store,
  });
  invariant(result.envelopeId, "raw envelope was not persisted");
  for (const id of ["wamid.e0.plain", "wamid.e0.burst.1", "wamid.e0.burst.2", "wamid.e0.voice"]) {
    invariant(result.persistedMessages?.some((message) => message.sourceMessageId === id), `${id} was not scanned`);
  }
  const voiceEvent = result.persistedMessages?.find((message) => message.sourceMessageId === "wamid.e0.voice");
  invariant(voiceEvent, "raw voice event is missing");
  await recordSpeechTranscriptSafetyInbound({
    store,
    tenantId: tenantA,
    envelopeId: result.envelopeId,
    sourceChannelEventId: voiceEvent.channelEventId,
    sourceMessageId: "wamid.e0.voice",
    transcript: "عندي حساسية من السمك",
    audioMessageReference: "audio-wamid.e0.voice",
    transcriptionProvider: "proof-stt",
    transcriptionModel: "proof-model-v1",
  });
  const transcriptScan = store.scans.find(
    (scan) => scan.sourceMessageId === "wamid.e0.voice" && scan.channelEventId !== voiceEvent.channelEventId
  );
  invariant(transcriptScan, "speech transcript did not create a distinct linked scan");
  const transcriptEvidence = store.evidence.filter((row) => row.scanId === transcriptScan.id);
  invariant(transcriptEvidence.length > 0, "speech transcript evidence is empty");
  invariant(
    transcriptEvidence.every(
      (row) =>
        row.evidenceClass === "speech_transcript" &&
        !row.customerAuthored &&
        row.audioMessageReference === "audio-wamid.e0.voice" &&
        row.transcriptionProvider === "proof-stt" &&
        row.transcriptionModel === "proof-model-v1"
    ),
    "speech transcript provenance is incorrect"
  );
});

await proof(4, "completed_signal with zero children is rejected", async () => {
  const store = new MemoryBrainIngressStore();
  await rejects(
    () => store.completeSafetyScan(scanParent("00000000-0000-4000-8000-000000000104"), [], "completed_signal"),
    "completed_signal accepted zero evidence rows"
  );
  invariant(store.scans.length === 0 && store.evidence.length === 0, "rejected completion left partial rows");
});

await proof(5, "completed_no_signal with a child is rejected", async () => {
  const store = new MemoryBrainIngressStore();
  await rejects(
    () =>
      store.completeSafetyScan(
        scanParent("00000000-0000-4000-8000-000000000105"),
        [validEvidence()],
        "completed_no_signal"
      ),
    "completed_no_signal accepted evidence"
  );
  invariant(store.scans.length === 0 && store.evidence.length === 0, "rejected completion left partial rows");
});

await proof(6, "terminal parent accepts no new children", async () => {
  const store = new MemoryBrainIngressStore();
  const parent = scanParent("00000000-0000-4000-8000-000000000106");
  const evidence = validEvidence();
  await store.completeSafetyScan(parent, [evidence], "completed_signal");
  const before = store.evidence.length;
  const duplicate = await store.completeSafetyScan(parent, [evidence], "completed_signal");
  invariant(duplicate.alreadyCompleted, "terminal completion was not idempotent");
  invariant(store.evidence.length === before, "terminal parent accepted another child through the store");
  invariant(
    /terminal ingress safety scan accepts no evidence/.test(sql) &&
      /before insert on public\.ingress_safety_evidence/.test(sql),
    "terminal-child database trigger is missing"
  );
});

await proof(7, "parent completion and child insertion are atomic; invalid child rolls both back", async () => {
  const store = new MemoryBrainIngressStore();
  const channelEventId = "00000000-0000-4000-8000-000000000107";
  const invalid = { ...validEvidence(), matchedExcerpt: "", excerptHash: sha256Hex("") };
  await rejects(
    () =>
      store.completeSafetyScan(
        scanParent(channelEventId),
        [invalid],
        "completed_signal"
      ),
    "invalid evidence did not abort completion"
  );
  invariant(store.scans.length === 0 && store.evidence.length === 0, "atomic failure left a parent or child");
  invariant(
    /create or replace function public\.brain_complete_ingress_safety_scan/.test(sql) &&
      /insert into public\.ingress_safety_evidence[\s\S]*update public\.ingress_safety_scans/.test(sql),
    "completion RPC does not own both child insert and parent completion"
  );

  await store.failSafetyScan({
    tenantId: tenantA,
    channelEventId,
    provider: "whatsapp",
    sourceMessageId: "source-retry",
    rawTextHash: sha256Hex("عندي حساسية"),
    scannerVersion: "proof-scanner",
    errorCategory: "evidence_persist_failed",
    scannedAt: new Date().toISOString(),
  });
  const retried = await store.completeSafetyScan(scanParent(channelEventId), [validEvidence()], "completed_signal");
  invariant(retried.outcome === "completed_signal", "failed scan did not retry to a completed outcome");
});

await proof(8, "duplicate webhook delivery produces exactly one scan", async () => {
  const store = new MemoryBrainIngressStore();
  const payload = webhookPayload([textMessage("wamid.e0.duplicate", "عندي حساسية من البيض")]);
  await ingest(store, payload);
  await ingest(store, payload);
  invariant(store.envelopes.length === 1, "duplicate envelope was inserted");
  invariant(store.events.length === 1, "duplicate channel event was inserted");
  invariant(store.scans.length === 1, "duplicate safety scan was inserted");
  invariant(store.evidence.length > 0, "first scan evidence is missing");
});

await proof(9, "existing envelope and event with missing scan resumes on retry", async () => {
  const store = new MemoryBrainIngressStore();
  const payload = webhookPayload([textMessage("wamid.e0.resume", "عندي حساسية من الجلوتين")]);
  const signed = signedBody(payload);
  const receivedAt = new Date("2026-07-24T00:00:00.000Z").toISOString();
  const envelope = await store.insertEnvelope({
    tenantId: tenantA,
    provider: "whatsapp",
    channel: "whatsapp",
    receivedAt,
    payloadHash: sha256Hex(signed.body),
    signatureVerified: true,
    processingStatus: "normalized",
    rawPayload: payload,
  });
  const event = normalizeWhatsAppBrainEvents({
    payload,
    tenantId: tenantA,
    receivedAt,
    envelopeId: envelope.id,
  })[0];
  invariant(event, "resume fixture did not normalize");
  await store.insertChannelEvent(event);
  invariant(store.scans.length === 0, "fixture unexpectedly has a scan");
  const result = await ingest(store, payload);
  invariant(result.ok && result.duplicateEvents === 1, "retry did not observe existing event");
  invariant(store.scans.length === 1 && store.evidence.length > 0, "retry did not resume the missing scan");
});

await proof(10, "persistence failure is retryable and cannot release a normal AI response or watermark", async () => {
  class FailingCompletionStore extends MemoryBrainIngressStore {
    override async completeSafetyScan(): Promise<never> {
      throw new Error("proof completion failure");
    }
  }
  const store = new FailingCompletionStore();
  const result = await ingest(
    store,
    webhookPayload([textMessage("wamid.e0.failure", "عندي حساسية من اللبن")])
  );
  invariant(!result.ok && result.status === 503, "scan failure was not retryable");
  invariant(store.scans[0]?.scanOutcome === "failed", "database-available failure was not recorded");
  const gate = routeSource.indexOf("if (!(await persistSafetyIngress(restaurantId)))");
  const flags = routeSource.indexOf('select("feature_flags, country")');
  const answer = routeSource.indexOf("respondAndSendWhatsApp(admin, restaurantId");
  const beforeGate = routeSource.slice(0, gate);
  invariant(gate >= 0 && gate < flags && gate < answer, "live gate is not before flags and AI");
  invariant(!beforeGate.includes("last_answered_inbound_at"), "answered watermark is touched before the gate");
});

await proof(11, "ingress and evidence tables only; zero execution surfaces", () => {
  const insertTargets = [...sql.matchAll(/insert into public\.([a-z0-9_]+)/g)].map((match) => match[1]);
  const allowed = new Set([
    "webhook_envelopes",
    "channel_events",
    "ingress_safety_scans",
    "ingress_safety_evidence",
  ]);
  invariant(insertTargets.length > 0 && insertTargets.every((target) => allowed.has(target)), `unexpected SQL write: ${insertTargets}`);
  for (const forbidden of [
    "brain_execution_effects",
    "brain_execution_dead_letters",
    "brain_execution_throttle_events",
    "conversation_threads",
    "order_episodes",
    "episode_turn_events",
    "outbox_messages",
    "pgmq.send",
  ]) {
    invariant(!storeSource.includes(forbidden) && !handlerSource.includes(forbidden), `ingress code references ${forbidden}`);
  }
  invariant(!/\bsendWhatsApp|\brespondAndSend|\bpgmq\b/.test(handlerSource), "ingress handler has outbound or queue behavior");
});

await proof(12, "vision-derived text never becomes customer-authored evidence", async () => {
  const store = new MemoryBrainIngressStore();
  const result = await ingest(
    store,
    webhookPayload([imageMessage("wamid.e0.vision", "صورة المنيو", "عندي حساسية من المكسرات")])
  );
  invariant(result.ok, "vision provenance fixture failed");
  invariant(exactEvidence(store, "wamid.e0.vision").length === 0, "derived vision text became evidence");
});

await proof(13, "tenant A evidence is unreadable and unwritable by tenant B under the authored RLS/RPC contract", () => {
  const privilegedRpcParents = {
    brain_record_webhook_envelope: "public.restaurants",
    brain_record_channel_event: "public.webhook_envelopes",
    brain_complete_ingress_safety_scan: "public.channel_events",
    brain_fail_ingress_safety_scan: "public.channel_events",
  } as const;

  for (const [name, tenantParent] of Object.entries(privilegedRpcParents)) {
    const definition = sqlFunctionDefinition(name);
    invariant(
      definition.includes("security definer") && definition.includes("set search_path = ''"),
      `${name} does not use the approved fixed-search-path SECURITY DEFINER contract`
    );
    invariant(
      definition.includes(tenantParent) &&
        (definition.includes("if not exists") || definition.includes("if not found")),
      `${name} does not validate its tenant-scoped parent`
    );
    for (const relation of [
      "restaurants",
      "webhook_envelopes",
      "channel_events",
      "ingress_safety_scans",
      "ingress_safety_evidence",
    ]) {
      invariant(
        !new RegExp(`\\b(?:from|into|update)\\s+${relation}\\b`).test(definition),
        `${name} contains an unqualified ${relation} relation`
      );
    }

    const revokeStart = sql.indexOf(`revoke all on function public.${name}(`);
    const revokeEnd = sql.indexOf(";", revokeStart);
    const revoke = sql.slice(revokeStart, revokeEnd);
    invariant(
      revokeStart >= 0 &&
        revoke.includes("from public, anon, authenticated, service_role"),
      `${name} EXECUTE is not reset for PUBLIC, anon, authenticated, and service_role`
    );

    const grantStart = sql.indexOf(`grant execute on function public.${name}(`);
    const grantEnd = sql.indexOf(";", grantStart);
    const grant = sql.slice(grantStart, grantEnd);
    invariant(
      grantStart >= 0 && /\) to service_role$/.test(grant.trim()),
      `${name} is not granted only to service_role`
    );
  }

  invariant(
    adminSource.includes('import "server-only"') &&
      adminSource.includes("SUPABASE_SERVICE_ROLE_KEY") &&
      !adminSource.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE"),
    "service-role client is not confined to the server-only admin module"
  );
  invariant(
    routeSource.includes("createSupabaseBrainIngressStore(admin)"),
    "live ingress does not inject the server-only admin client"
  );
  invariant(
    /alter table public\.ingress_safety_evidence force row level security/.test(sql) &&
      !/create policy ingress_safety_evidence_member_read/.test(sql) &&
      !/grant select on table public\.ingress_safety_evidence to authenticated/.test(sql),
    "evidence is exposed through an authenticated grant or policy"
  );
  invariant(
    /foreign key \(tenant_id, scan_id\)[\s\S]*references public\.ingress_safety_scans\(tenant_id, id\)/.test(sql),
    "tenant-scoped evidence parent FK is missing"
  );
  invariant(
    /revoke all on function public\.brain_complete_ingress_safety_scan[\s\S]*from public, anon, authenticated, service_role/.test(sql) &&
      /grant execute on function public\.brain_complete_ingress_safety_scan[\s\S]*to service_role/.test(sql),
    "write RPC execution is not service-role restricted"
  );
  invariant(tenantA !== tenantB, "tenant fixture is not cross-tenant");
});

await proof(14, "UPDATE on child evidence is rejected by trigger", () => {
  invariant(
    /before update or delete on public\.ingress_safety_evidence/.test(sql) &&
      /ingress safety evidence is immutable/.test(sql),
    "immutable UPDATE trigger is missing"
  );
});

await proof(15, "DELETE on child evidence is rejected by trigger", () => {
  invariant(
    /create trigger ingress_safety_evidence_immutable[\s\S]*before update or delete/.test(sql),
    "immutable DELETE trigger is missing"
  );
});

await proof(16, "deleting a channel event with safety evidence is rejected by RESTRICT", () => {
  invariant(
    /constraint ingress_safety_scans_event_fk[\s\S]*references public\.channel_events\(tenant_id, id\)[\s\S]*on delete restrict/.test(sql),
    "channel-event safety FK is not RESTRICT"
  );
  invariant(
    /constraint ingress_safety_evidence_scan_fk[\s\S]*references public\.ingress_safety_scans\(tenant_id, id\)[\s\S]*on delete restrict/.test(sql),
    "evidence-to-scan FK is not RESTRICT"
  );
});

await proof(17, "completed no-signal retry with new allergy evidence raises a fingerprint conflict and critical alert", async () => {
  const store = new MemoryBrainIngressStore();
  const channelEventId = "00000000-0000-4000-8000-000000000117";
  const noSignal = scanParent(channelEventId, "عايز اطلب");
  invariant(!noSignal.safetyCandidate, "no-signal fixture unexpectedly became a safety candidate");
  await store.completeSafetyScan(noSignal, [], "completed_no_signal");

  const exactRetry = await store.completeSafetyScan(noSignal, [], "completed_no_signal");
  invariant(exactRetry.alreadyCompleted, "exact completed retry was not idempotent");

  const newSignal = scanParent(channelEventId, "عندي حساسية من اللبن");
  const conflict = await rejectedError(
    () => store.completeSafetyScan(newSignal, [validEvidence()], "completed_signal"),
    "conflicting completed retry silently discarded new evidence"
  );
  invariant(
    conflict.message.includes("KIVO_SAFETY_SCAN_RESULT_CONFLICT"),
    "conflicting completed retry did not raise the distinct fingerprint error"
  );
  invariant(
    store.scans[0]?.scanOutcome === "completed_no_signal" && store.evidence.length === 0,
    "fingerprint conflict mutated the durable first result"
  );

  const completionSql = sqlFunctionDefinition("brain_complete_ingress_safety_scan");
  invariant(
    /result_fingerprint/.test(sql) &&
      /v_requested_fingerprint/.test(completionSql) &&
      /v_canonical_evidence/.test(completionSql) &&
      /KIVO_SAFETY_SCAN_RESULT_CONFLICT/.test(completionSql) &&
      /errcode = 'KIV01'/.test(completionSql),
    "durable canonical fingerprint conflict contract is incomplete"
  );
  const persistStart = routeSource.indexOf("const persistSafetyIngress");
  const persistEnd = routeSource.indexOf("\n  };", persistStart);
  const persistBlock = routeSource.slice(persistStart, persistEnd);
  invariant(
    persistStart >= 0 &&
      persistEnd > persistStart &&
      persistBlock.includes("recordCriticalAlert") &&
      persistBlock.includes('type: "inbound_persist_failed"'),
    "live fingerprint conflict does not reach the critical-alert boundary"
  );
});

await proof(18, "dedupe collisions include raw payload and provider time but exclude envelope and normalization", async () => {
  const store = new MemoryBrainIngressStore();
  const payload = webhookPayload([textMessage("wamid.e0.identity", "عندي حساسية من اللبن")]);
  const signed = signedBody(payload);
  const receivedAt = new Date("2026-07-24T00:00:00.000Z").toISOString();
  const envelope = await store.insertEnvelope({
    tenantId: tenantA,
    provider: "whatsapp",
    channel: "whatsapp",
    receivedAt,
    payloadHash: sha256Hex(signed.body),
    signatureVerified: true,
    processingStatus: "normalized",
    rawPayload: payload,
  });
  const event = normalizeWhatsAppBrainEvents({
    payload,
    tenantId: tenantA,
    receivedAt,
    envelopeId: envelope.id,
  })[0];
  invariant(event, "identity fixture did not normalize");
  const first = await store.insertChannelEvent(event);
  const allowedRetry = await store.insertChannelEvent({
    ...event,
    envelopeId: "00000000-0000-4000-8000-0000000001e0",
    normalizedEvent: { changedByNormalizerDeployment: true },
  });
  invariant(
    !allowedRetry.inserted && allowedRetry.id === first.id,
    "new envelope or normalized output incorrectly caused a dedupe conflict"
  );

  const rawCollision = await rejectedError(
    () =>
      store.insertChannelEvent({
        ...event,
        rawEvent: { ...event.rawEvent, text: { body: "different customer text" } },
      }),
    "dedupe-key collision with a different raw provider payload was absorbed"
  );
  invariant(
    rawCollision.message.includes("KIVO_CHANNEL_EVENT_DEDUPE_CONFLICT"),
    "raw-payload collision did not raise KIV02"
  );
  const timestampCollision = await rejectedError(
    () =>
      store.insertChannelEvent({
        ...event,
        providerTimestamp: "2026-07-24T00:00:01.000Z",
      }),
    "dedupe-key collision with a different provider timestamp was absorbed"
  );
  invariant(
    timestampCollision.message.includes("KIVO_CHANNEL_EVENT_DEDUPE_CONFLICT"),
    "provider-timestamp collision did not raise KIV02"
  );

  const eventSql = sqlFunctionDefinition("brain_record_channel_event");
  const completionSql = sqlFunctionDefinition("brain_complete_ingress_safety_scan");
  const failureSql = sqlFunctionDefinition("brain_fail_ingress_safety_scan");
  const comparisonStart = eventSql.indexOf("-- A provider retry may use a new envelope");
  const comparisonEnd = eventSql.indexOf(
    "raise exception 'KIVO_CHANNEL_EVENT_DEDUPE_CONFLICT'",
    comparisonStart
  );
  const comparison = eventSql.slice(comparisonStart, comparisonEnd);
  invariant(
    /KIVO_CHANNEL_EVENT_DEDUPE_CONFLICT/.test(eventSql) &&
      /provider_message_id/.test(eventSql) &&
      /source_channel_event_id/.test(eventSql) &&
      comparison.includes(
        "v_existing_raw_event is not distinct from coalesce(p_raw_event, '{}'::jsonb)"
      ) &&
      comparison.includes(
        "v_existing_provider_timestamp is not distinct from p_provider_timestamp"
      ) &&
      !comparison.includes("p_envelope_id") &&
      !comparison.includes("p_normalized_event"),
    "channel-event dedupe identity contract is incomplete"
  );
  for (const definition of [completionSql, failureSql]) {
    invariant(
      /e\.provider, e\.provider_message_id/.test(definition) &&
        /KIVO_SAFETY_SCAN_EVENT_IDENTITY_MISMATCH/.test(definition) &&
        /errcode = 'KIV03'/.test(definition),
      "completion/failure RPC does not validate provider and source message identity"
    );
  }
});

await proof(19, "completed outcome and safety_candidate are enforced as biconditionals", async () => {
  const store = new MemoryBrainIngressStore();
  const signalCandidateFalse = {
    ...scanParent("00000000-0000-4000-8000-000000000119"),
    safetyCandidate: false,
  };
  await rejects(
    () => store.completeSafetyScan(signalCandidateFalse, [validEvidence()], "completed_signal"),
    "completed_signal accepted safety_candidate=false"
  );
  const noSignalCandidateTrue = scanParent("00000000-0000-4000-8000-000000000120");
  await rejects(
    () => store.completeSafetyScan(noSignalCandidateTrue, [], "completed_no_signal"),
    "completed_no_signal accepted safety_candidate=true"
  );

  const completionSql = sqlFunctionDefinition("brain_complete_ingress_safety_scan");
  invariant(
    completionSql.includes(
      "completed_signal requires safety_candidate = true and evidence_count > 0"
    ) &&
      completionSql.includes(
        "completed_no_signal requires safety_candidate = false and evidence_count = 0"
      ),
    "SQL outcome biconditional enforcement is missing"
  );
});

await proof(20, "all four API roles lose direct DML on all four ingress/evidence tables", () => {
  invariant(
    /revoke insert, update, delete, truncate, references, trigger[\s\S]*on table public\.webhook_envelopes,[\s\S]*public\.channel_events,[\s\S]*public\.ingress_safety_scans,[\s\S]*public\.ingress_safety_evidence[\s\S]*from public, anon, authenticated, service_role;/.test(
      sql
    ),
    "four-role by four-table DML revoke matrix is incomplete"
  );
  invariant(
    /grant select on table public\.ingress_safety_evidence to service_role;/.test(sql) &&
      !/grant select on table public\.ingress_safety_evidence to authenticated/.test(sql) &&
      !/create policy ingress_safety_evidence_member_read/.test(sql),
    "carried evidence read restrictions did not land"
  );
});

await proof(21, "migration requires extensions pgcrypto and fails on triage nullability drift", () => {
  invariant(
    /to_regprocedure\('extensions\.digest\(text,text\)'\)/.test(sql) &&
      /to_regprocedure\('gen_random_uuid\(\)'\)/.test(sql),
    "migration capability guards are missing"
  );
  invariant(
    !sql.includes("public.digest(") &&
      sql.includes("extensions.digest(matched_excerpt, 'sha256')") &&
      sql.includes("extensions.digest("),
    "a digest call is not pinned to the production extensions schema"
  );
  const triageGuardStart = sql.indexOf("if v_triage_is_nullable = 'NO' then");
  const triageGuardEnd = sql.indexOf("end if;", triageGuardStart);
  const triageGuard = sql.slice(triageGuardStart, triageGuardEnd);
  invariant(
    triageGuardStart >= 0 &&
      triageGuard.includes("raise exception") &&
      triageGuard.includes("unexpected NOT NULL schema drift") &&
      !triageGuard.includes("alter table") &&
      !triageGuard.includes("drop not null"),
    "triage_class drift does not fail closed"
  );
  invariant(
    !/^\s*begin\s*;\s*$/im.test(sql) && !/^\s*commit\s*;\s*$/im.test(sql),
    "migration contains an explicit transaction wrapper"
  );
});

await proof(22, "KIV01/KIV02/KIV03 fail retryably and alert once outside the failed RPC", async () => {
  for (const code of ["KIV01", "KIV02", "KIV03"] as const) {
    const { response, body, fake } = await postAlertGateConflict(code);
    invariant(
      response.status === 503 &&
        body?.ok === false &&
        body?.error === "safety_ingress_persist_failed",
      `${code} did not return the retryable ingress failure`
    );

    const alertUpserts = fake.calls.filter(
      (call) => call.table === "system_alerts" && call.op === "upsert"
    );
    invariant(alertUpserts.length === 1, `${code} did not perform the checked critical-alert upsert`);
    invariant(
      JSON.stringify(alertUpserts[0]?.payload).includes(code),
      `${code} was not retained in the critical alert detail`
    );

    const failedRpcIndex = fake.sequence.findIndex((entry) =>
      entry.endsWith(`:${code}`) && entry.startsWith("rpc-error:")
    );
    const alertInsertIndex = fake.sequence.indexOf("db:system_alerts:upsert");
    invariant(
      failedRpcIndex >= 0 && alertInsertIndex > failedRpcIndex,
      `${code} alert was not a separate operation after the failed ingress RPC`
    );

    const releaseWrites = fake.calls.filter((call) =>
      ["messages", "conversations", "agent_runs"].includes(call.table)
    );
    invariant(releaseWrites.length === 0, `${code} released reply or conversation work`);
    invariant(
      !JSON.stringify(fake.calls).includes("last_answered_inbound_at"),
      `${code} advanced the answered watermark`
    );
  }

  const retryFake = makeAlertGateAdmin("KIV01");
  const first = await postAlertGateConflict("KIV01", retryFake);
  const retry = await postAlertGateConflict("KIV01", retryFake);
  invariant(first.response.status === 503 && retry.response.status === 503, "provider retry was not retryable");
  invariant(
    retryFake.calls.filter(
      (call) => call.table === "system_alerts" && call.op === "upsert"
    ).length === 2,
    "provider retry did not repeat the checked idempotent alert write"
  );
  invariant(
    retryFake.activeAlerts.length === 1 &&
      retryFake.calls
        .filter((call) => call.table === "system_alerts" && call.op === "upsert")
        .every(
          (call) =>
            (call.payload as { id?: string } | undefined)?.id === retryFake.activeAlerts[0]?.id
        ),
    "provider retry created more than one alert identity"
  );
});

console.log(
  `FIXTURE COMMITTED: captured=${WESAYA_PRODUCTION_FEATURE_FLAGS_CAPTURED_AT} ` +
    `sha256=${WESAYA_PRODUCTION_FEATURE_FLAGS_SHA256}`
);
console.log(`E0 SAFETY INGRESS PROOF: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
