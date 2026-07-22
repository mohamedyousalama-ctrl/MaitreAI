// ============================================================================
// WO-PROOF-1 tenant-isolation proof harness.
//
// Local/default run:
//   node --experimental-strip-types scripts/proof-tenant-isolation.test.ts
//
// Route behavior mode (staging/live-safe A/B fixtures supplied by operator):
//   RUN_TENANT_ISOLATION_ROUTE_BEHAVIOR=1 \
//   KIVO_BASE_URL=https://staging.example.com \
//   KIVO_TENANT_A_COOKIE='...' \
//   KIVO_TENANT_ISOLATION_CASES_FILE=/private/path/cases.json \
//   node --experimental-strip-types scripts/proof-tenant-isolation.test.ts
//
// BRAIN behavior mode (staging DB only; creates and cleans up fixture rows):
//   RUN_BRAIN_TENANT_ISOLATION=1 \
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   BRAIN_RLS_TENANT_A_ID=... BRAIN_RLS_TENANT_B_ID=... \
//   BRAIN_RLS_MEMBER_A_JWT=... BRAIN_RLS_MEMBER_B_JWT=... \
//   node --experimental-strip-types scripts/proof-tenant-isolation.test.ts
//
// This file intentionally never applies migrations and never embeds real tenant
// data, credentials, cookies, tokens, or customer identifiers.
// ============================================================================

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonRow = Record<string, any>;
type DbClient = ReturnType<typeof createClient>;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = join(ROOT, "scripts/proof-tenant-isolation-report.md");
const ACTIVE_RESTAURANT_COOKIE = "maitreai_active_rid";

let pass = 0;
let fail = 0;
let skip = 0;

function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
    return;
  }
  fail += 1;
  console.error(`FAIL ${name}`, detail ?? "");
}

function skipped(name: string, reason: string): void {
  skip += 1;
  console.log(`SKIP ${name}: ${reason}`);
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function walkRouteFiles(dir = join(ROOT, "app/api")): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkRouteFiles(abs));
    } else if (entry.name === "route.ts") {
      out.push(relative(ROOT, abs));
    }
  }
  return out.sort();
}

function routeInventoryFromReport(): string[] {
  if (!existsSync(REPORT_PATH)) return [];
  const report = read("scripts/proof-tenant-isolation-report.md");
  return [...report.matchAll(/\| `(app\/api\/[^`]+)` \|/g)].map((match) => match[1]).sort();
}

function proveInventoryCompleteness(): void {
  const routes = walkRouteFiles();
  const inventory = routeInventoryFromReport();
  check("inventory report exists", inventory.length > 0);
  check("inventory covers every app/api route exactly once", JSON.stringify(inventory) === JSON.stringify(routes), {
    missing: routes.filter((route) => !inventory.includes(route)),
    extra: inventory.filter((route) => !routes.includes(route)),
    routeCount: routes.length,
    inventoryCount: inventory.length,
  });

  const report = existsSync(REPORT_PATH) ? read("scripts/proof-tenant-isolation-report.md") : "";
  for (const heading of [
    "Guarded",
    "Guarded By Non Obvious Means",
    "Unguarded",
    "Public By Design",
    "Findings",
    "Skipped Or Gated Proofs",
  ]) {
    check(`report has ${heading} section`, report.includes(`## ${heading}`));
  }
}

const requiredRouteAttacks = [
  "orders.cross_tenant_read",
  "conversations.cross_tenant_read",
  "customers.cross_tenant_read",
  "messages.cross_tenant_read",
  "menu_items.cross_tenant_read",
  "delivery_zones.cross_tenant_read",
  "members.cross_tenant_read",
  "alerts.cross_tenant_read",
  "payment_sessions.cross_tenant_read",
  "forge.body.restaurant_id",
  "forge.body.order_id",
  "forge.body.conversation_id",
  "forge.body.customer_id",
  "forge.query.restaurant_id",
  "forge.query.order_id",
  "forge.query.conversation_id",
  "forge.query.customer_id",
  "forge.path.order_id",
  "forge.path.conversation_id",
  "forge.path.customer_id",
  "cookie.active_restaurant_tamper",
  "token.driver_cross_tenant_data",
  "token.tracking_cross_tenant_data",
  "token.expired_or_consumed",
  "webhook.whatsapp_wrong_tenant_secret",
  "webhook.payment_wrong_tenant_secret",
  "enumeration.order_id",
  "enumeration.conversation_id",
  "enumeration.customer_id",
  "member.removed_loses_access",
] as const;

interface HttpCase {
  key: (typeof requiredRouteAttacks)[number];
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: Json;
  rawBody?: string;
  headers?: Record<string, string>;
  cookie?: string;
  activeRestaurantId?: string;
  mustRefuse?: boolean;
  allowedStatuses?: number[];
  forbiddenMarkers?: string[];
  sameAsMissing?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    body?: Json;
    rawBody?: string;
    headers?: Record<string, string>;
  };
}

function loadRouteCases(): HttpCase[] {
  const inline = process.env.KIVO_TENANT_ISOLATION_CASES_JSON;
  const file = process.env.KIVO_TENANT_ISOLATION_CASES_FILE;
  if (inline) return JSON.parse(inline) as HttpCase[];
  if (file) return JSON.parse(readFileSync(file, "utf8")) as HttpCase[];
  return [];
}

function joinCookie(...parts: Array<string | undefined>): string {
  return parts.filter((part) => part && part.trim()).join("; ");
}

function normalizeLeakShape(status: number, text: string): string {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    return JSON.stringify({
      status,
      error: json.error ?? null,
      code: json.code ?? null,
      ok: json.ok ?? null,
    });
  } catch {
    return JSON.stringify({ status, text: text.slice(0, 200) });
  }
}

async function fetchCase(baseUrl: string, testCase: Omit<HttpCase, "key" | "sameAsMissing">): Promise<{ status: number; text: string }> {
  const headers = new Headers(testCase.headers ?? {});
  const defaultCookie = process.env.KIVO_TENANT_A_COOKIE;
  const activeCookie = testCase.activeRestaurantId
    ? `${ACTIVE_RESTAURANT_COOKIE}=${encodeURIComponent(testCase.activeRestaurantId)}`
    : undefined;
  const cookie = joinCookie(testCase.cookie ?? defaultCookie, activeCookie);
  if (cookie) headers.set("cookie", cookie);

  let body: BodyInit | undefined;
  if (testCase.rawBody !== undefined) {
    body = testCase.rawBody;
  } else if (testCase.body !== undefined) {
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    body = JSON.stringify(testCase.body);
  }

  const res = await fetch(new URL(testCase.path, baseUrl), {
    method: testCase.method,
    headers,
    body,
    redirect: "manual",
  });
  return { status: res.status, text: await res.text() };
}

async function runRouteBehaviorProof(): Promise<void> {
  if (process.env.RUN_TENANT_ISOLATION_ROUTE_BEHAVIOR !== "1") {
    for (const key of requiredRouteAttacks) {
      skipped(`route behavior ${key}`, "set RUN_TENANT_ISOLATION_ROUTE_BEHAVIOR=1 with staging A/B HTTP cases");
    }
    return;
  }

  const baseUrl = process.env.KIVO_BASE_URL;
  if (!baseUrl) throw new Error("Missing KIVO_BASE_URL");

  const cases = loadRouteCases();
  const byKey = new Map(cases.map((testCase) => [testCase.key, testCase]));
  for (const key of requiredRouteAttacks) {
    check(`route behavior case supplied: ${key}`, byKey.has(key));
  }
  if (fail > 0) return;

  for (const key of requiredRouteAttacks) {
    const testCase = byKey.get(key)!;
    const result = await fetchCase(baseUrl, testCase);
    const mustRefuse = testCase.mustRefuse !== false;
    const allowed = testCase.allowedStatuses ?? [];
    const refused = allowed.includes(result.status) || result.status >= 400;
    check(`route behavior ${key} refused`, mustRefuse ? refused : true, result);

    for (const marker of testCase.forbiddenMarkers ?? []) {
      check(`route behavior ${key} does not leak marker ${marker}`, !result.text.includes(marker));
    }

    if (testCase.sameAsMissing) {
      const missing = await fetchCase(baseUrl, {
        method: testCase.sameAsMissing.method ?? testCase.method,
        path: testCase.sameAsMissing.path,
        body: testCase.sameAsMissing.body,
        rawBody: testCase.sameAsMissing.rawBody,
        headers: { ...(testCase.headers ?? {}), ...(testCase.sameAsMissing.headers ?? {}) },
        cookie: testCase.cookie,
        activeRestaurantId: testCase.activeRestaurantId,
      });
      check(
        `route behavior ${key} enumeration shape matches non-existent`,
        normalizeLeakShape(result.status, result.text) === normalizeLeakShape(missing.status, missing.text),
        { crossTenant: result, missing },
      );
    }
  }
}

const brainTables = [
  "channel_inbox",
  "conversation_threads",
  "order_episodes",
  "episode_turn_events",
  "pending_prompts",
  "safety_disclosures",
  "order_quotes",
  "outbox_messages",
  "customer_memories",
  "brain_runs",
  "webhook_envelopes",
  "channel_events",
  "ingress_safety_scans",
  "brain_execution_effects",
  "brain_execution_dead_letters",
  "brain_execution_throttle_events",
] as const;

type BrainTable = (typeof brainTables)[number];

interface BrainFixture {
  tenantId: string;
  suffix: string;
  inboxId: string;
  threadId: string;
  episodeId: string;
  turnId: string;
  promptId: string;
  safetyId: string;
  quoteId: string;
  outboxId: string;
  memoryId: string;
  runId: string;
  envelopeId: string;
  eventId: string;
  scanId: string;
  effectId: string;
  deadLetterId: string;
  throttleId: string;
  customerId: string;
  orderId: string;
}

const nowIso = () => new Date().toISOString();
const laterIso = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

function brainFixture(tenantId: string, suffix: string): BrainFixture {
  return {
    tenantId,
    suffix,
    inboxId: randomUUID(),
    threadId: randomUUID(),
    episodeId: randomUUID(),
    turnId: randomUUID(),
    promptId: randomUUID(),
    safetyId: randomUUID(),
    quoteId: randomUUID(),
    outboxId: randomUUID(),
    memoryId: randomUUID(),
    runId: randomUUID(),
    envelopeId: randomUUID(),
    eventId: randomUUID(),
    scanId: randomUUID(),
    effectId: randomUUID(),
    deadLetterId: randomUUID(),
    throttleId: randomUUID(),
    customerId: randomUUID(),
    orderId: randomUUID(),
  };
}

function brainRowsFor(runId: string, f: BrainFixture): Record<BrainTable, JsonRow> {
  return {
    channel_inbox: {
      id: f.inboxId,
      tenant_id: f.tenantId,
      channel: "whatsapp",
      channel_message_id: `tenant-proof-inbox-${runId}-${f.suffix}`,
      thread_key: `thread-${runId}-${f.suffix}`,
      verified_channel_ref: `verified-wa-${f.suffix}`,
      customer_channel_id: `customer-${f.suffix}`,
      payload: { proof: runId, tenant: f.suffix },
    },
    conversation_threads: {
      id: f.threadId,
      tenant_id: f.tenantId,
      channel: "whatsapp",
      thread_key: `thread-${runId}-${f.suffix}`,
      customer_id: f.customerId,
      customer_channel_id: `customer-${f.suffix}`,
    },
    order_episodes: {
      id: f.episodeId,
      tenant_id: f.tenantId,
      thread_id: f.threadId,
      customer_id: f.customerId,
      lifecycle_state: "collecting",
      active_mutable: true,
    },
    episode_turn_events: {
      id: f.turnId,
      tenant_id: f.tenantId,
      thread_id: f.threadId,
      episode_id: f.episodeId,
      source_inbox_id: f.inboxId,
      turn_index: 1,
      actor: "CUSTOMER",
      event_type: "tenant_isolation_fixture",
      untrusted_input: { text: "fixture" },
    },
    pending_prompts: {
      id: f.promptId,
      tenant_id: f.tenantId,
      thread_id: f.threadId,
      episode_id: f.episodeId,
      prompt_kind: "confirm_quote",
      required_field: "quote_confirmation",
      token_hash: `tenant-proof-token-${runId}-${f.suffix}`,
      token_generation: 1,
      episode_revision: 0,
      expires_at: laterIso(),
    },
    safety_disclosures: {
      id: f.safetyId,
      tenant_id: f.tenantId,
      thread_id: f.threadId,
      episode_id: f.episodeId,
      source_turn_event_id: f.turnId,
      disclosure_kind: "explicit_allergy",
      canonical_terms: ["fixture_allergy"],
      raw_evidence: { source: "fixture" },
      requires_kitchen_note: true,
      kitchen_note_text: "Fixture disclosure",
    },
    order_quotes: {
      id: f.quoteId,
      tenant_id: f.tenantId,
      episode_id: f.episodeId,
      quote_revision: 1,
      episode_revision: 0,
      currency_code: "SAR",
      line_items: [{ item_id: randomUUID(), quantity: 1, total_minor_units: 1000 }],
      catalog_snapshot: { proof: runId },
      availability_snapshot: { proof: runId },
      subtotal_minor_units: 1000,
      delivery_fee_minor_units: 200,
      discount_minor_units: 0,
      tax_minor_units: 0,
      total_minor_units: 1200,
      expires_at: laterIso(),
    },
    outbox_messages: {
      id: f.outboxId,
      tenant_id: f.tenantId,
      thread_id: f.threadId,
      episode_id: f.episodeId,
      turn_event_id: f.turnId,
      quote_id: f.quoteId,
      idempotency_key: `tenant-proof-outbox-${runId}-${f.suffix}`,
      destination_channel: "whatsapp",
      destination_ref: `customer-${f.suffix}`,
      response_plan: { type: "fixture" },
      customer_response: { blocks: ["fixture"] },
      ownership_generation: 0,
    },
    customer_memories: {
      id: f.memoryId,
      tenant_id: f.tenantId,
      customer_id: f.customerId,
      thread_id: f.threadId,
      source_episode_id: f.episodeId,
      source_turn_event_id: f.turnId,
      memory_kind: "explicit_preference",
      memory_fingerprint: `tenant-proof-memory-${runId}-${f.suffix}`,
      value: { preference: "fixture" },
      explicit_consent_at: nowIso(),
    },
    brain_runs: {
      id: f.runId,
      tenant_id: f.tenantId,
      thread_id: f.threadId,
      episode_id: f.episodeId,
      turn_event_id: f.turnId,
      run_kind: "shadow",
      pipeline_stage: 5,
      status: "started",
      input_trace: { proof: runId },
    },
    webhook_envelopes: {
      id: f.envelopeId,
      tenant_id: f.tenantId,
      provider: "whatsapp",
      channel: "whatsapp",
      app_id: `app-${f.suffix}`,
      payload_hash: `tenant-proof-payload-${runId}-${f.suffix}`,
      signature_verified: true,
      processing_status: "received",
      raw_payload: { proof: runId },
    },
    channel_events: {
      id: f.eventId,
      tenant_id: f.tenantId,
      envelope_id: f.envelopeId,
      provider: "whatsapp",
      channel: "whatsapp",
      event_kind: "customer_inbound",
      event_dedupe_key: `tenant-proof-event-${runId}-${f.suffix}`,
      event_index: 0,
      provider_message_id: `wamid-${runId}-${f.suffix}`,
      provider_timestamp: nowIso(),
      customer_channel_id: `customer-${f.suffix}`,
      thread_key: `thread-${runId}-${f.suffix}`,
      message_type: "text",
      raw_event: { proof: runId },
      normalized_event: { text: "fixture" },
    },
    ingress_safety_scans: {
      id: f.scanId,
      tenant_id: f.tenantId,
      channel_event_id: f.eventId,
      provider: "whatsapp",
      source_message_id: `wamid-${runId}-${f.suffix}`,
      raw_text_hash: `tenant-proof-text-${runId}-${f.suffix}`,
      triage_class: "EXPLICIT_CUSTOMER_DISCLOSURE",
      safety_candidate: true,
      explicit_stop: false,
      human_takeover_requested: false,
      fast_path_markers: ["fixture"],
      matched_spans: [],
      scanner_version: "tenant-proof",
    },
    brain_execution_effects: {
      id: f.effectId,
      tenant_id: f.tenantId,
      thread_id: f.threadId,
      channel_event_id: f.eventId,
      queue_name: "brain_turn_processing",
      queue_message_id: 1,
      operation_key: `tenant-proof-effect-${runId}-${f.suffix}`,
      attempt_kind: "deterministic",
      requested_by: "brain_ingress_shadow",
      lease_token: randomUUID(),
      ownership_generation: 0,
      episode_revision: 0,
      effect_kind: "shadow_turn_processing",
      effect_metadata: { proof: runId },
    },
    brain_execution_dead_letters: {
      id: f.deadLetterId,
      tenant_id: f.tenantId,
      thread_id: f.threadId,
      channel_event_id: f.eventId,
      inbox_id: f.inboxId,
      turn_event_id: f.turnId,
      queue_name: "brain_turn_processing",
      original_queue_message_id: 1,
      operation_key: `tenant-proof-dead-${runId}-${f.suffix}`,
      attempt_kind: "deterministic",
      attempt_count: 1,
      first_failure_at: nowIso(),
      last_error_class: "fixture",
      last_error_message: "fixture",
      required_operator_action: "inspect fixture",
      payload_metadata: { proof: runId },
    },
    brain_execution_throttle_events: {
      id: f.throttleId,
      tenant_id: f.tenantId,
      thread_id: f.threadId,
      channel_event_id: f.eventId,
      customer_channel_hash: `customer-hash-${f.suffix}`,
      throttle_scope: "tenant",
      throttle_reason: "tenant_rate",
      metric_name: "fixture",
      metric_value: 1,
      threshold_value: 0,
      action: "alert_only",
      alert_required: false,
    },
  };
}

function idFor(table: BrainTable, f: BrainFixture): string {
  const map: Record<BrainTable, keyof BrainFixture> = {
    channel_inbox: "inboxId",
    conversation_threads: "threadId",
    order_episodes: "episodeId",
    episode_turn_events: "turnId",
    pending_prompts: "promptId",
    safety_disclosures: "safetyId",
    order_quotes: "quoteId",
    outbox_messages: "outboxId",
    customer_memories: "memoryId",
    brain_runs: "runId",
    webhook_envelopes: "envelopeId",
    channel_events: "eventId",
    ingress_safety_scans: "scanId",
    brain_execution_effects: "effectId",
    brain_execution_dead_letters: "deadLetterId",
    brain_execution_throttle_events: "throttleId",
  };
  return String(f[map[table]]);
}

function isAccessDenied(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42501" ||
    /row-level security/i.test(message) ||
    /permission denied/i.test(message) ||
    /violates row-level security policy/i.test(message)
  );
}

function isConstraintRejected(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "23503" ||
    error.code === "23514" ||
    /foreign key/i.test(message) ||
    /check constraint/i.test(message)
  );
}

function cloneForDeniedInsert(runId: string, table: BrainTable, row: JsonRow): JsonRow {
  const forged = { ...row, id: randomUUID() };
  if (table === "channel_inbox") forged.channel_message_id = `tenant-proof-forged-inbox-${runId}-${randomUUID()}`;
  if (table === "pending_prompts") forged.token_hash = `tenant-proof-forged-token-${runId}-${randomUUID()}`;
  if (table === "outbox_messages") forged.idempotency_key = `tenant-proof-forged-outbox-${runId}-${randomUUID()}`;
  if (table === "customer_memories") forged.memory_fingerprint = `tenant-proof-forged-memory-${runId}-${randomUUID()}`;
  if (table === "webhook_envelopes") forged.payload_hash = `tenant-proof-forged-payload-${runId}-${randomUUID()}`;
  if (table === "channel_events") forged.event_dedupe_key = `tenant-proof-forged-event-${runId}-${randomUUID()}`;
  if (table === "brain_execution_effects") forged.operation_key = `tenant-proof-forged-effect-${runId}-${randomUUID()}`;
  if (table === "brain_execution_dead_letters") forged.operation_key = `tenant-proof-forged-dead-${runId}-${randomUUID()}`;
  return forged;
}

const updatePayload: Record<BrainTable, JsonRow> = {
  channel_inbox: { processing_state: "failed" },
  conversation_threads: { state: "closed" },
  order_episodes: { lifecycle_state: "abandoned", active_mutable: false },
  episode_turn_events: { event_type: "tenant_proof_update" },
  pending_prompts: { status: "revoked" },
  safety_disclosures: { requires_human_escalation: true },
  order_quotes: { confirmed_at: nowIso() },
  outbox_messages: { status: "cancelled" },
  customer_memories: { revoked_at: nowIso() },
  brain_runs: { status: "failed" },
  webhook_envelopes: { processing_status: "failed", error: "tenant proof" },
  channel_events: { status: "failed", status_rank: 1 },
  ingress_safety_scans: { explicit_stop: true },
  brain_execution_effects: { effect_kind: "stale_rejected" },
  brain_execution_dead_letters: { business_effect_committed: true },
  brain_execution_throttle_events: { alerted_at: nowIso() },
};

async function adminRowExists(admin: DbClient, table: BrainTable, id: string): Promise<boolean> {
  const { data, error } = await admin.from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`admin existence check failed for ${table}: ${error.message}`);
  return Boolean(data);
}

async function runBrainBehaviorProof(): Promise<void> {
  if (process.env.RUN_BRAIN_TENANT_ISOLATION !== "1") {
    skipped("BRAIN behavior proof", "set RUN_BRAIN_TENANT_ISOLATION=1 with staging Supabase A/B tenant env");
    return;
  }

  const env = (name: string, fallback?: string): string => {
    const value = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
    if (!value) throw new Error(`Missing required env ${name}${fallback ? ` or ${fallback}` : ""}`);
    return value;
  };

  const supabaseUrl = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const tenantA = env("BRAIN_RLS_TENANT_A_ID");
  const tenantB = env("BRAIN_RLS_TENANT_B_ID");
  const jwtA = env("BRAIN_RLS_MEMBER_A_JWT");
  const jwtB = env("BRAIN_RLS_MEMBER_B_JWT");

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const asMember = (jwt: string) =>
    createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  const memberA = asMember(jwtA);
  const memberB = asMember(jwtB);
  const runId = randomUUID();
  const fixtureA = brainFixture(tenantA, "a");
  const fixtureB = brainFixture(tenantB, "b");
  const rowsA = brainRowsFor(runId, fixtureA);
  const rowsB = brainRowsFor(runId, fixtureB);
  const extraCleanupRows: Array<{ table: BrainTable; id: string }> = [];

  const cleanup = async () => {
    for (const table of [...brainTables].reverse()) {
      const ids = [
        idFor(table, fixtureA),
        idFor(table, fixtureB),
        ...extraCleanupRows.filter((row) => row.table === table).map((row) => row.id),
      ];
      await admin.from(table).delete().in("id", ids);
    }
  };

  try {
    for (const table of brainTables) {
      const { error } = await admin.from(table).insert(rowsA[table]);
      if (error) throw new Error(`admin fixture insert failed for ${table} tenant A: ${error.message}`);
    }
    for (const table of brainTables) {
      const { error } = await admin.from(table).insert(rowsB[table]);
      if (error) throw new Error(`admin fixture insert failed for ${table} tenant B: ${error.message}`);
    }

    for (const table of brainTables) {
      const ownA = await memberA.from(table).select("id,tenant_id").eq("tenant_id", tenantA).eq("id", idFor(table, fixtureA));
      check(`BRAIN member A can read own ${table}`, !ownA.error && (ownA.data?.length ?? 0) === 1, ownA.error ?? ownA.data);
      const crossA = await memberA.from(table).select("id,tenant_id").eq("tenant_id", tenantB).eq("id", idFor(table, fixtureB));
      check(`BRAIN member A cannot read tenant B ${table}`, !crossA.error && (crossA.data?.length ?? 0) === 0, crossA.error ?? crossA.data);
      const ownB = await memberB.from(table).select("id,tenant_id").eq("tenant_id", tenantB).eq("id", idFor(table, fixtureB));
      check(`BRAIN member B can read own ${table}`, !ownB.error && (ownB.data?.length ?? 0) === 1, ownB.error ?? ownB.data);
      const crossB = await memberB.from(table).select("id,tenant_id").eq("tenant_id", tenantA).eq("id", idFor(table, fixtureA));
      check(`BRAIN member B cannot read tenant A ${table}`, !crossB.error && (crossB.data?.length ?? 0) === 0, crossB.error ?? crossB.data);
    }

    for (const table of brainTables) {
      const forged = cloneForDeniedInsert(runId, table, rowsA[table]);
      extraCleanupRows.push({ table, id: forged.id });
      const insert = await memberA.from(table).insert(forged).select("id").maybeSingle();
      const inserted = await adminRowExists(admin, table, forged.id);
      check(`BRAIN member cannot insert own-tenant row in ${table}`, (isAccessDenied(insert.error) || !insert.data) && !inserted, insert.error ?? insert.data);

      const update = await memberA.from(table).update(updatePayload[table]).eq("tenant_id", tenantA).eq("id", idFor(table, fixtureA)).select("id");
      check(`BRAIN member cannot update own-tenant row in ${table}`, isAccessDenied(update.error) || (update.data?.length ?? 0) === 0, update.error ?? update.data);

      const del = await memberA.from(table).delete().eq("tenant_id", tenantA).eq("id", idFor(table, fixtureA)).select("id");
      const stillExists = await adminRowExists(admin, table, idFor(table, fixtureA));
      check(`BRAIN member cannot delete own-tenant row in ${table}`, (isAccessDenied(del.error) || (del.data?.length ?? 0) === 0) && stillExists, del.error ?? del.data);
    }

    const crossFkRows: Array<{ name: string; table: BrainTable; row: JsonRow }> = [
      {
        name: "channel_inbox duplicate_of cannot point across tenants",
        table: "channel_inbox",
        row: { ...rowsA.channel_inbox, id: randomUUID(), channel_message_id: `cross-fk-${runId}-inbox`, duplicate_of_inbox_id: fixtureB.inboxId },
      },
      {
        name: "order_episodes cannot attach to another tenant thread",
        table: "order_episodes",
        row: { ...rowsA.order_episodes, id: randomUUID(), thread_id: fixtureB.threadId, active_mutable: false, lifecycle_state: "abandoned" },
      },
      {
        name: "episode_turn_events cannot attach episode to another tenant thread",
        table: "episode_turn_events",
        row: { ...rowsA.episode_turn_events, id: randomUUID(), thread_id: fixtureA.threadId, episode_id: fixtureB.episodeId, turn_index: 99 },
      },
      {
        name: "pending_prompts cannot attach to another tenant episode",
        table: "pending_prompts",
        row: { ...rowsA.pending_prompts, id: randomUUID(), episode_id: fixtureB.episodeId, token_hash: `cross-fk-${runId}-prompt` },
      },
      {
        name: "safety_disclosures cannot attach to another tenant turn",
        table: "safety_disclosures",
        row: { ...rowsA.safety_disclosures, id: randomUUID(), source_turn_event_id: fixtureB.turnId },
      },
      {
        name: "order_quotes cannot attach to another tenant episode",
        table: "order_quotes",
        row: { ...rowsA.order_quotes, id: randomUUID(), episode_id: fixtureB.episodeId, quote_revision: 99 },
      },
      {
        name: "outbox_messages cannot attach to another tenant quote",
        table: "outbox_messages",
        row: { ...rowsA.outbox_messages, id: randomUUID(), quote_id: fixtureB.quoteId, idempotency_key: `cross-fk-${runId}-outbox` },
      },
      {
        name: "customer_memories cannot attach to another tenant episode",
        table: "customer_memories",
        row: { ...rowsA.customer_memories, id: randomUUID(), source_episode_id: fixtureB.episodeId, memory_fingerprint: `cross-fk-${runId}-memory` },
      },
      {
        name: "brain_runs cannot attach to another tenant turn",
        table: "brain_runs",
        row: { ...rowsA.brain_runs, id: randomUUID(), turn_event_id: fixtureB.turnId },
      },
      {
        name: "channel_events cannot attach to another tenant envelope",
        table: "channel_events",
        row: { ...rowsA.channel_events, id: randomUUID(), envelope_id: fixtureB.envelopeId, event_dedupe_key: `cross-fk-${runId}-event` },
      },
      {
        name: "ingress_safety_scans cannot attach to another tenant event",
        table: "ingress_safety_scans",
        row: { ...rowsA.ingress_safety_scans, id: randomUUID(), channel_event_id: fixtureB.eventId },
      },
      {
        name: "brain_execution_effects cannot attach to another tenant event",
        table: "brain_execution_effects",
        row: { ...rowsA.brain_execution_effects, id: randomUUID(), channel_event_id: fixtureB.eventId, operation_key: `cross-fk-${runId}-effect` },
      },
      {
        name: "brain_execution_dead_letters cannot attach to another tenant inbox",
        table: "brain_execution_dead_letters",
        row: { ...rowsA.brain_execution_dead_letters, id: randomUUID(), inbox_id: fixtureB.inboxId, operation_key: `cross-fk-${runId}-dead` },
      },
      {
        name: "brain_execution_throttle_events cannot attach to another tenant event",
        table: "brain_execution_throttle_events",
        row: { ...rowsA.brain_execution_throttle_events, id: randomUUID(), channel_event_id: fixtureB.eventId },
      },
    ];

    for (const cross of crossFkRows) {
      extraCleanupRows.push({ table: cross.table, id: cross.row.id });
      const result = await admin.from(cross.table).insert(cross.row).select("id").maybeSingle();
      const exists = await adminRowExists(admin, cross.table, cross.row.id);
      check(`BRAIN FK: ${cross.name}`, isConstraintRejected(result.error) && !result.data && !exists, result.error ?? result.data);
    }

    const currentQuote = await admin
      .from("order_episodes")
      .update({ current_quote_id: fixtureB.quoteId })
      .eq("tenant_id", tenantA)
      .eq("id", fixtureA.episodeId)
      .select("id,current_quote_id")
      .maybeSingle();
    check(
      "BRAIN FK: episode current_quote cannot point to another tenant quote",
      isConstraintRejected(currentQuote.error) && !currentQuote.data,
      currentQuote.error ?? currentQuote.data,
    );
  } finally {
    await cleanup();
  }
}

proveInventoryCompleteness();
await runRouteBehaviorProof();
await runBrainBehaviorProof();

console.log(`\nTENANT-ISOLATION PROOF: ${pass} passed, ${fail} failed, ${skip} skipped`);
if (fail > 0) process.exit(1);
