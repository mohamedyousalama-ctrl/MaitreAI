// ============================================================================
// WO-BRAIN-G0 adversarial RLS behavior proof.
//
// This is intentionally NOT a source-regex proof. It must be run only after the
// PM applies supabase/migrations/0099_brain_foundation.sql to a staging database.
//
// Required:
//   RUN_BRAIN_RLS_BEHAVIOR=1
//   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   BRAIN_RLS_TENANT_A_ID
//   BRAIN_RLS_TENANT_B_ID
//   BRAIN_RLS_MEMBER_A_JWT  -- auth.uid() must be a member of tenant A only
//   BRAIN_RLS_MEMBER_B_JWT  -- auth.uid() must be a member of tenant B only
//
// Run:
//   RUN_BRAIN_RLS_BEHAVIOR=1 node --experimental-strip-types scripts/proof-brain-foundation-rls.test.ts
// ============================================================================

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type JsonRow = Record<string, unknown>;
type DbClient = ReturnType<typeof createClient>;

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
] as const;

if (process.env.RUN_BRAIN_RLS_BEHAVIOR !== "1") {
  console.log("BRAIN FOUNDATION RLS PROOF: skipped (set RUN_BRAIN_RLS_BEHAVIOR=1 after PM applies 0099 to staging)");
  process.exit(0);
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
const nowIso = () => new Date().toISOString();
const laterIso = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

let pass = 0;
let fail = 0;

const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) {
    pass++;
    return;
  }
  fail++;
  console.error("  x FAIL:", name, detail ?? "");
};

const isAccessDenied = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    error.code === "42501" ||
    /row-level security/i.test(msg) ||
    /permission denied/i.test(msg) ||
    /violates row-level security policy/i.test(msg)
  );
};

const mustInsert = async (table: string, row: JsonRow) => {
  const { error } = await admin.from(table).insert(row);
  if (error) throw new Error(`admin fixture insert failed for ${table}: ${error.message}`);
};

const adminRowExists = async (table: string, id: string) => {
  const { data, error } = await admin.from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`admin existence check failed for ${table}: ${error.message}`);
  return Boolean(data);
};

interface Fixture {
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
  customerId: string;
  orderId: string;
}

const fixture = (tenantId: string, suffix: string): Fixture => ({
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
  customerId: randomUUID(),
  orderId: randomUUID(),
});

const rowsFor = (f: Fixture) => ({
  channel_inbox: {
    id: f.inboxId,
    tenant_id: f.tenantId,
    channel: "whatsapp",
    channel_message_id: `brain-rls-${runId}-${f.suffix}`,
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
    committed_order_id: f.orderId,
  },
  episode_turn_events: {
    id: f.turnId,
    tenant_id: f.tenantId,
    thread_id: f.threadId,
    episode_id: f.episodeId,
    source_inbox_id: f.inboxId,
    turn_index: 1,
    actor: "CUSTOMER",
    event_type: "fixture",
    untrusted_input: { text: "fixture" },
  },
  pending_prompts: {
    id: f.promptId,
    tenant_id: f.tenantId,
    thread_id: f.threadId,
    episode_id: f.episodeId,
    prompt_kind: "confirm_quote",
    required_field: "quote_confirmation",
    token_hash: `token-${runId}-${f.suffix}`,
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
    committed_order_id: f.orderId,
  },
  outbox_messages: {
    id: f.outboxId,
    tenant_id: f.tenantId,
    thread_id: f.threadId,
    episode_id: f.episodeId,
    turn_event_id: f.turnId,
    quote_id: f.quoteId,
    idempotency_key: `outbox-${runId}-${f.suffix}`,
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
    memory_fingerprint: `memory-${runId}-${f.suffix}`,
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
});

const insertFixture = async (f: Fixture) => {
  const rows = rowsFor(f);
  for (const table of brainTables) {
    await mustInsert(table, rows[table]);
  }
};

const fixtureA = fixture(tenantA, "a");
const fixtureB = fixture(tenantB, "b");

const cleanup = async () => {
  const idsByTable: Record<(typeof brainTables)[number], string[]> = {
    channel_inbox: [fixtureA.inboxId, fixtureB.inboxId],
    conversation_threads: [fixtureA.threadId, fixtureB.threadId],
    order_episodes: [fixtureA.episodeId, fixtureB.episodeId],
    episode_turn_events: [fixtureA.turnId, fixtureB.turnId],
    pending_prompts: [fixtureA.promptId, fixtureB.promptId],
    safety_disclosures: [fixtureA.safetyId, fixtureB.safetyId],
    order_quotes: [fixtureA.quoteId, fixtureB.quoteId],
    outbox_messages: [fixtureA.outboxId, fixtureB.outboxId],
    customer_memories: [fixtureA.memoryId, fixtureB.memoryId],
    brain_runs: [fixtureA.runId, fixtureB.runId],
  };
  for (const table of [...brainTables].reverse()) {
    await admin.from(table).delete().in("id", idsByTable[table]);
  }
};

const expectRead = async (client: DbClient, table: string, tenantId: string, id: string, shouldSee: boolean, label: string) => {
  const { data, error } = await client.from(table).select("id,tenant_id").eq("tenant_id", tenantId).eq("id", id);
  check(`${label}: ${table} read ${shouldSee ? "allowed" : "denied"}`, !error && (data?.length ?? 0) === (shouldSee ? 1 : 0), error ?? data);
};

const updatePayload: Record<(typeof brainTables)[number], JsonRow> = {
  channel_inbox: { processing_state: "failed" },
  conversation_threads: { state: "closed" },
  order_episodes: { lifecycle_state: "abandoned", active_mutable: false },
  episode_turn_events: { event_type: "forged_update" },
  pending_prompts: { status: "revoked" },
  safety_disclosures: { requires_human_escalation: true },
  order_quotes: { confirmed_at: nowIso() },
  outbox_messages: { status: "cancelled" },
  customer_memories: { revoked_at: nowIso() },
  brain_runs: { status: "failed" },
};

const attemptDeniedInsert = async (client: DbClient, table: (typeof brainTables)[number], row: JsonRow, label: string) => {
  const forgedId = randomUUID();
  const forged = { ...row, id: forgedId };
  if (table === "channel_inbox") forged.channel_message_id = `forged-insert-${runId}-${label}`;
  if (table === "pending_prompts") forged.token_hash = `forged-token-${runId}-${label}`;
  if (table === "outbox_messages") forged.idempotency_key = `forged-outbox-${runId}-${label}`;
  if (table === "customer_memories") forged.memory_fingerprint = `forged-memory-${runId}-${label}`;

  const { data, error } = await client.from(table).insert(forged).select("id").maybeSingle();
  const exists = await adminRowExists(table, forgedId);
  check(`${label}: forged tenant/customer/order/episode/quote insert denied on ${table}`, (isAccessDenied(error) || !data) && !exists, error ?? data);
};

const attemptDeniedUpdate = async (client: DbClient, table: (typeof brainTables)[number], id: string, tenantId: string, label: string) => {
  const { data, error } = await client.from(table).update(updatePayload[table]).eq("tenant_id", tenantId).eq("id", id).select("id");
  const exists = await adminRowExists(table, id);
  check(`${label}: forged cross-tenant update denied on ${table}`, (isAccessDenied(error) || (data?.length ?? 0) === 0) && exists, error ?? data);
};

const attemptDeniedDelete = async (client: DbClient, table: (typeof brainTables)[number], id: string, tenantId: string, label: string) => {
  const { data, error } = await client.from(table).delete().eq("tenant_id", tenantId).eq("id", id).select("id");
  const exists = await adminRowExists(table, id);
  check(`${label}: forged cross-tenant delete denied on ${table}`, (isAccessDenied(error) || (data?.length ?? 0) === 0) && exists, error ?? data);
};

try {
  await insertFixture(fixtureA);
  await insertFixture(fixtureB);

  const rowsA = rowsFor(fixtureA);
  const rowsB = rowsFor(fixtureB);
  const idsA = {
    channel_inbox: fixtureA.inboxId,
    conversation_threads: fixtureA.threadId,
    order_episodes: fixtureA.episodeId,
    episode_turn_events: fixtureA.turnId,
    pending_prompts: fixtureA.promptId,
    safety_disclosures: fixtureA.safetyId,
    order_quotes: fixtureA.quoteId,
    outbox_messages: fixtureA.outboxId,
    customer_memories: fixtureA.memoryId,
    brain_runs: fixtureA.runId,
  };
  const idsB = {
    channel_inbox: fixtureB.inboxId,
    conversation_threads: fixtureB.threadId,
    order_episodes: fixtureB.episodeId,
    episode_turn_events: fixtureB.turnId,
    pending_prompts: fixtureB.promptId,
    safety_disclosures: fixtureB.safetyId,
    order_quotes: fixtureB.quoteId,
    outbox_messages: fixtureB.outboxId,
    customer_memories: fixtureB.memoryId,
    brain_runs: fixtureB.runId,
  };

  for (const table of brainTables) {
    await expectRead(memberA, table, tenantA, idsA[table], true, "member A own-tenant");
    await expectRead(memberA, table, tenantB, idsB[table], false, "member A cross-tenant");
    await expectRead(memberB, table, tenantB, idsB[table], true, "member B own-tenant");
    await expectRead(memberB, table, tenantA, idsA[table], false, "member B cross-tenant");
  }

  for (const table of brainTables) {
    await attemptDeniedInsert(memberA, table, rowsB[table], "member A");
    await attemptDeniedUpdate(memberA, table, idsB[table], tenantB, "member A");
  }

  for (const table of [...brainTables].reverse()) {
    await attemptDeniedDelete(memberA, table, idsB[table], tenantB, "member A");
  }
} finally {
  await cleanup();
}

console.log(`\nBRAIN FOUNDATION RLS PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
