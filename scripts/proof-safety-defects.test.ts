// WO-PROOF-3 — executable reproductions for C-02 / C-03 / C-04.
//
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//     scripts/proof-safety-defects.test.ts
//
// This is intentionally a RED acceptance suite. Observed-outcome checks must pass,
// while an unfixed defect's acceptance check must fail. A finding that does not
// reproduce is reported as such and its acceptance check is allowed to pass.

import { __setTestAdminClient } from "../lib/supabase/admin.ts";
import { POST } from "../app/api/whatsapp/webhook/route.ts";
import { detectAllergenAvoidance } from "../lib/ai/allergen-gate.ts";
import { isSafetyClassInbound } from "../lib/ai/safety-bridge.ts";
import { isFeatureExplicitlyEnabled } from "../lib/tenant/tier.ts";
import { coalesceInbound, type CoalesceRow } from "../lib/messaging/inbound-coalescing.ts";
import {
  normalizeWhatsAppImages,
  normalizeWhatsAppInbound,
} from "../lib/messaging/adapters/whatsapp.ts";
import { respondAndSendWhatsApp } from "../lib/messaging/respond-and-send.ts";
import {
  hashWesayaProductionFeatureFlags,
  WESAYA_PRODUCTION_FEATURE_FLAGS,
  WESAYA_PRODUCTION_FEATURE_FLAGS_CAPTURED_AT,
  WESAYA_PRODUCTION_FEATURE_FLAGS_HASH_ALGORITHM,
  WESAYA_PRODUCTION_FEATURE_FLAGS_SHA256,
  wesayaProductionFlags,
  type WesayaProductionFeatureFlags,
} from "./fixtures/wesaya-production-flags.ts";

const PINNED_REVISION = "c38c6b6830ec7a5307bbcbdd1704998e5d4528f5";
const WESAYA_ID = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";

let observedFailures = 0;
let acceptanceFailures = 0;
let acceptancePasses = 0;

function observed(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✅ OBSERVED ${name}`);
    return;
  }
  observedFailures++;
  console.log(`  ❌ REPRO HARNESS ${name}`, detail ?? "");
}

function acceptance(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    acceptancePasses++;
    console.log(`  ✅ ACCEPTANCE ${name}`);
    return;
  }
  acceptanceFailures++;
  console.log(`  ❌ ACCEPTANCE ${name}`, detail ?? "");
}

function printOutcome(label: string, value: Record<string, unknown>): void {
  console.log(`  OUTCOME ${label}: ${JSON.stringify(value)}`);
}

type FlagKey = keyof WesayaProductionFeatureFlags;

function assertCompleteVector(
  name: string,
  flags: Record<FlagKey, boolean>,
  expectedOverrides: Partial<Record<FlagKey, boolean>> = {}
): void {
  const baseKeys = Object.keys(WESAYA_PRODUCTION_FEATURE_FLAGS).sort();
  const keys = Object.keys(flags).sort();
  observed(`${name}: uses all 34 production keys`, keys.length === 34 && JSON.stringify(keys) === JSON.stringify(baseKeys), {
    count: keys.length,
  });
  const unexpectedDiffs = baseKeys.filter(
    (key) =>
      flags[key as FlagKey] !== WESAYA_PRODUCTION_FEATURE_FLAGS[key as FlagKey] &&
      !(key in expectedOverrides)
  );
  observed(`${name}: changes only the named contrast flags`, unexpectedDiffs.length === 0, {
    unexpectedDiffs,
  });
}

const onlyFalse = Object.entries(WESAYA_PRODUCTION_FEATURE_FLAGS)
  .filter(([, enabled]) => enabled === false)
  .map(([key]) => key);
observed(
  "shared Wesaya fixture is 34 flags with only delivery_runs=false",
  Object.keys(WESAYA_PRODUCTION_FEATURE_FLAGS).length === 34 &&
    JSON.stringify(onlyFalse) === JSON.stringify(["delivery_runs"]),
  { count: Object.keys(WESAYA_PRODUCTION_FEATURE_FLAGS).length, onlyFalse }
);
observed(
  "shared Wesaya fixture has an ISO capture timestamp",
  new Date(WESAYA_PRODUCTION_FEATURE_FLAGS_CAPTURED_AT).toISOString() ===
    WESAYA_PRODUCTION_FEATURE_FLAGS_CAPTURED_AT
);
observed(
  "shared Wesaya fixture SHA-256 matches the frozen production flag vector",
  WESAYA_PRODUCTION_FEATURE_FLAGS_HASH_ALGORITHM === "SHA-256" &&
    hashWesayaProductionFeatureFlags() ===
      WESAYA_PRODUCTION_FEATURE_FLAGS_SHA256,
  {
    algorithm: WESAYA_PRODUCTION_FEATURE_FLAGS_HASH_ALGORITHM,
    expected: WESAYA_PRODUCTION_FEATURE_FLAGS_SHA256,
    actual: hashWesayaProductionFeatureFlags(),
  }
);
const fixtureSecretLikeKeys = Object.keys(
  WESAYA_PRODUCTION_FEATURE_FLAGS
).filter((key) =>
  /(?:secret|password|credential|private[_-]?key|api[_-]?key|access[_-]?token)/i.test(
    key
  )
);
observed(
  "shared Wesaya fixture contains only boolean feature flags and no secret-like keys",
  Object.values(WESAYA_PRODUCTION_FEATURE_FLAGS).every(
    (value) => typeof value === "boolean"
  ) && fixtureSecretLikeKeys.length === 0,
  { fixtureSecretLikeKeys }
);

type Filter = { col: string; val: unknown };
type DbCall = {
  table: string;
  op: "query" | "select" | "insert" | "upsert" | "update";
  payload?: unknown;
  select: string | null;
  filters: Filter[];
};

function makeBuilderClient(resultFor: (call: DbCall) => unknown): {
  client: { from: (table: string) => Record<string, unknown>; rpc: () => Promise<{ data: null; error: null }> };
  calls: DbCall[];
} {
  const calls: DbCall[] = [];
  const from = (table: string): Record<string, unknown> => {
    const call: DbCall = { table, op: "query", select: null, filters: [] };
    const remember = (op: DbCall["op"], payload?: unknown) => {
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
    for (const method of [
      "eq",
      "neq",
      "is",
      "not",
      "gt",
      "gte",
      "lt",
      "lte",
      "order",
      "limit",
      "in",
      "contains",
    ]) {
      builder[method] = (col?: string, val?: unknown) => {
        if (method === "eq" && col) call.filters.push({ col, val });
        return builder;
      };
    }
    builder.maybeSingle = async () => resultFor(call);
    builder.single = async () => resultFor(call);
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(resultFor(call)).then(resolve, reject);
    return builder;
  };
  return {
    client: { from, rpc: async () => ({ data: null, error: null }) },
    calls,
  };
}

function payloadMeta(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  return ((payload as { meta?: Record<string, unknown> }).meta ?? {});
}

function insertedWithMeta(calls: DbCall[], kind: string): boolean {
  return calls.some(
    (call) =>
      call.table === "messages" &&
      call.op === "insert" &&
      payloadMeta(call.payload).kind === kind
  );
}

function insertedSafetyAlert(calls: DbCall[]): boolean {
  return calls.some(
    (call) =>
      call.table === "system_alerts" &&
      call.op === "insert" &&
      (call.payload as { type?: string } | undefined)?.type === "safety_unattended_handoff"
  );
}

// ── C-02: allergy_simple disables the HUMAN_ACTIVE safety bridge ─────────────
console.log("\nC-02 — HUMAN_ACTIVE + production vector + Arabic allergy disclosure");
console.log(
  "  PATH c38c6b6: lib/messaging/respond-and-send.ts:958-972 gates the bridge; " +
    ":1037-1039 returns skipped_takeover before runCustomerTurn; " +
    "lib/ai/customer-turn.ts:973-996 is therefore unreachable."
);

const C02_TEXT = "ابني عنده حساسية لبن";
const C02_UPDATED_AT = new Date(Date.now() - 5 * 60_000).toISOString();
const C02_CREATED_AT = new Date().toISOString();

function makeC02Admin(flags: Record<FlagKey, boolean>) {
  const inbound = {
    sender: "customer",
    text: C02_TEXT,
    meta: {},
    created_at: C02_CREATED_AT,
  };
  let callsRef: DbCall[] = [];
  const built = makeBuilderClient((call) => {
    if (call.table === "conversations" && call.op === "select") {
      if ((call.select ?? "").includes("customers(phone)")) {
        return {
          data: {
            id: "conversation-c02",
            owner: "human",
            channel: "whatsapp",
            customer_id: "customer-c02",
            escalation_reason: null,
            updated_at: C02_UPDATED_AT,
            ownership_state: "HUMAN_ACTIVE",
            is_safety_hold: false,
            control_epoch: 7,
            customers: { phone: "201000000000" },
          },
          error: null,
        };
      }
      if ((call.select ?? "").includes("ownership_state, updated_at")) {
        return {
          data: { ownership_state: "HUMAN_ACTIVE", updated_at: C02_UPDATED_AT },
          error: null,
        };
      }
      return { data: null, error: null };
    }
    if (call.table === "orders" && call.op === "select") {
      return { data: null, error: null };
    }
    if (call.table === "restaurants" && call.op === "select") {
      if ((call.select ?? "").includes("feature_flags")) {
        return {
          data: { feature_flags: flags, dialect: "egyptian", name: "وصاية" },
          error: null,
        };
      }
      return { data: { name: "وصاية" }, error: null };
    }
    if (call.table === "messages" && call.op === "select") {
      if ((call.select ?? "").includes("sender, text, meta, created_at")) {
        return { data: [inbound], error: null };
      }
      if ((call.select ?? "").includes("text, created_at")) {
        return { data: inbound, error: null };
      }
      return { data: [], error: null };
    }
    if (call.table === "messages" && call.op === "insert") {
      return {
        data: { id: `message-${callsRef.filter((entry) => entry.table === "messages" && entry.op === "insert").length}` },
        error: null,
      };
    }
    if (call.table === "system_alerts" && call.op === "select") {
      return { data: [], error: null };
    }
    if (call.op === "insert" || call.op === "upsert" || call.op === "update") {
      return { data: [], error: null };
    }
    return { data: null, error: null };
  });
  callsRef = built.calls;
  return built;
}

const c02ProductionFlags = wesayaProductionFlags();
const c02ContrastFlags = wesayaProductionFlags({ allergy_simple: false });
assertCompleteVector("C-02 production", c02ProductionFlags);
assertCompleteVector("C-02 allergy_simple-off control", c02ContrastFlags, {
  allergy_simple: false,
});
observed("C-02 input is safety-class", isSafetyClassInbound(C02_TEXT));
observed(
  "C-02 handoff timeout is not elapsed, while the 3-minute bridge window is elapsed",
  Date.now() - Date.parse(C02_UPDATED_AT) < 15 * 60_000 &&
    Date.now() - Date.parse(C02_UPDATED_AT) >= 3 * 60_000
);

const c02Production = makeC02Admin(c02ProductionFlags);
const c02ProductionResult = await respondAndSendWhatsApp(
  c02Production.client as never,
  WESAYA_ID,
  "conversation-c02"
);
const c02ProductionMarker = insertedWithMeta(c02Production.calls, "safety_bridge_ack");
const c02ProductionAlert = insertedSafetyAlert(c02Production.calls);
const c02ProductionAllergyAudit = c02Production.calls.some(
  (call) => call.table === "allergy_events" && call.op === "insert"
);
printOutcome("C-02 production", {
  input: C02_TEXT,
  safety_bridge: c02ProductionFlags.safety_bridge,
  allergy_simple: c02ProductionFlags.allergy_simple,
  status: c02ProductionResult.status,
  durableSafetyMarker: c02ProductionMarker,
  durableAllergyAudit: c02ProductionAllergyAudit,
  alertRaised: c02ProductionAlert,
});
// CURRENT-BROKEN-BEHAVIOR: reproduces a defect; this is not intended behavior.
observed(
  "C-02 reproduced: production vector silently returns skipped_takeover",
  c02ProductionResult.status === "skipped_takeover"
);
// CURRENT-BROKEN-BEHAVIOR: reproduces a defect; this is not intended behavior.
observed(
  "C-02 reproduced: no durable safety marker/allergy audit and no safety alert",
  !c02ProductionMarker && !c02ProductionAllergyAudit && !c02ProductionAlert
);

const c02Contrast = makeC02Admin(c02ContrastFlags);
const c02ContrastResult = await respondAndSendWhatsApp(
  c02Contrast.client as never,
  WESAYA_ID,
  "conversation-c02"
);
const c02ContrastMarker = insertedWithMeta(c02Contrast.calls, "safety_bridge_ack");
const c02ContrastAlert = insertedSafetyAlert(c02Contrast.calls);
printOutcome("C-02 allergy_simple=false control", {
  input: C02_TEXT,
  safety_bridge: c02ContrastFlags.safety_bridge,
  allergy_simple: c02ContrastFlags.allergy_simple,
  status: c02ContrastResult.status,
  durableSafetyMarker: c02ContrastMarker,
  alertRaised: c02ContrastAlert,
});
observed(
  "C-02 isolated: changing only allergy_simple to false fires the bridge",
  c02ContrastResult.status === "safety_bridged" &&
    c02ContrastMarker &&
    c02ContrastAlert
);
acceptance(
  "C-02 fixed: the real production vector durably marks and alerts the disclosure",
  c02ProductionResult.status === "safety_bridged" &&
    c02ProductionMarker &&
    c02ProductionAlert,
  {
    status: c02ProductionResult.status,
    durableSafetyMarker: c02ProductionMarker,
    alertRaised: c02ProductionAlert,
  }
);

// ── C-03: image caption is dropped when media_turn_trigger is OFF ─────────────
console.log("\nC-03 — captioned image + complete vector with media_turn_trigger=false");
console.log(
  "  PATH c38c6b6: lib/messaging/adapters/whatsapp.ts:201-206 drops image-only input " +
    "from the main normalizer; app/api/whatsapp/webhook/route.ts:557-600 keeps caption " +
    "extraction/persistence behind media_turn_trigger."
);

const C03_TEXT = "ابني عنده حساسية لبن";
const c03Flags = wesayaProductionFlags({ media_turn_trigger: false });
assertCompleteVector("C-03 media_turn_trigger-off case", c03Flags, {
  media_turn_trigger: false,
});

const c03Payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            contacts: [{ wa_id: "201000000000", profile: { name: "عميل الاختبار" } }],
            messages: [
              {
                from: "201000000000",
                id: "wamid.C03",
                timestamp: "1784736000",
                type: "image",
                image: {
                  id: "media-c03",
                  mime_type: "image/jpeg",
                  caption: C03_TEXT,
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

const c03Admin = makeBuilderClient((call) => {
  if (call.table === "restaurants" && call.op === "select") {
    return {
      data: { feature_flags: c03Flags, country: "EG", dialect: "egyptian" },
      error: null,
    };
  }
  if (call.op === "insert" || call.op === "upsert" || call.op === "update") {
    return { data: [], error: null };
  }
  return { data: null, error: null };
});

const savedWebhookEnv = {
  WHATSAPP_SKIP_SIGNATURE: process.env.WHATSAPP_SKIP_SIGNATURE,
  WHATSAPP_RESTAURANT_ID: process.env.WHATSAPP_RESTAURANT_ID,
};
process.env.WHATSAPP_SKIP_SIGNATURE = "true";
process.env.WHATSAPP_RESTAURANT_ID = WESAYA_ID;
__setTestAdminClient(c03Admin.client);
let c03ResponseStatus = 0;
let c03ResponseBody: Record<string, unknown> = {};
try {
  const request = new Request("https://proof.invalid/api/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(c03Payload),
  });
  const response = await POST(request as never);
  c03ResponseStatus = response.status;
  c03ResponseBody = (await response.json()) as Record<string, unknown>;
} finally {
  __setTestAdminClient(undefined);
  for (const [key, value] of Object.entries(savedWebhookEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const c03MainInbound = normalizeWhatsAppInbound(c03Payload);
const c03ImageExtract = normalizeWhatsAppImages(c03Payload);
const c03PersistCall = c03Admin.calls.find(
  (call) => call.table === "messages" && call.op === "upsert"
);
const c03PersistPayload = (c03PersistCall?.payload as { text?: string } | undefined);
const c03CaptionPersisted = c03PersistPayload?.text === C03_TEXT;
const c03TurnEntered = c03Admin.calls.some(
  (call) =>
    call.table === "conversations" &&
    call.op === "select" &&
    (call.select ?? "").includes("customers(phone)")
);
const c03SafetyScanned =
  c03CaptionPersisted &&
  detectAllergenAvoidance(c03PersistPayload?.text ?? "").fired &&
  c03TurnEntered;
printOutcome("C-03", {
  inputKind: "image",
  caption: C03_TEXT,
  media_turn_trigger: c03Flags.media_turn_trigger,
  mainNormalizerRows: c03MainInbound.length,
  imageExtractorCaption: c03ImageExtract[0]?.caption ?? null,
  captionPersisted: c03CaptionPersisted,
  safetyTurnEntered: c03TurnEntered,
  safetyScanned: c03SafetyScanned,
  webhookStatus: c03ResponseStatus,
  webhookPersistedCount: c03ResponseBody.persisted ?? null,
});
observed("C-03 route handled the webhook without a persistence error", c03ResponseStatus === 200);
observed(
  "C-03 control: the dedicated image extractor can read the customer caption",
  c03ImageExtract[0]?.caption === C03_TEXT
);
observed(
  "C-03 control: the dropped caption is safety-class if scanned",
  detectAllergenAvoidance(C03_TEXT).fired
);
// CURRENT-BROKEN-BEHAVIOR: reproduces a defect; this is not intended behavior.
observed(
  "C-03 reproduced: media flag OFF yields no extracted main-lane text, persistence, or safety turn",
  c03MainInbound.length === 0 &&
    !c03CaptionPersisted &&
    !c03TurnEntered &&
    !c03SafetyScanned
);
acceptance(
  "C-03 fixed: media flag OFF still persists and safety-scans a customer-authored caption",
  c03CaptionPersisted && c03SafetyScanned,
  {
    captionPersisted: c03CaptionPersisted,
    safetyTurnEntered: c03TurnEntered,
    safetyScanned: c03SafetyScanned,
  }
);

// ── C-04: verify the alleged coalescing loss against the real vector ──────────
console.log("\nC-04 — two-message burst + production inbound_coalescing=true");
console.log(
  "  PATH c38c6b6: lib/messaging/inbound-coalescing.ts:91-125 joins every unanswered " +
    "customer text; lib/messaging/respond-and-send.ts:1212-1244 uses mergedText, " +
    ":1491 and :1622 pass it as userMessage; lib/ai/customer-turn.ts:973-996 scans it."
);

const c04Flags = wesayaProductionFlags();
assertCompleteVector("C-04 production", c04Flags);
const C04_T0 = Date.parse("2026-07-23T12:00:00.000Z");
const c04At = (offsetMs: number) => new Date(C04_T0 + offsetMs).toISOString();
const c04Rows: CoalesceRow[] = [
  {
    sender: "customer",
    text: "عندي حساسية من المكسرات",
    created_at: c04At(0),
    meta: null,
  },
  {
    sender: "customer",
    text: "وعايز اطلب فراخ وبطاطس",
    created_at: c04At(250),
    meta: null,
  },
];
const c04CoalescingOn = isFeatureExplicitlyEnabled(
  "inbound_coalescing",
  c04Flags
);
const c04Turn = coalesceInbound(c04Rows, {
  enabled: c04CoalescingOn,
  watermarkMs: null,
});
const c04DisclosureSurvives =
  !!c04Turn &&
  c04Turn.count === 2 &&
  c04Turn.mergedText.includes("عندي حساسية من المكسرات");
const c04SafetyScanned =
  !!c04Turn && detectAllergenAvoidance(c04Turn.mergedText).fired;
printOutcome("C-04", {
  inputs: c04Rows.map((row) => row.text),
  inbound_coalescing: c04CoalescingOn,
  coalescedCount: c04Turn?.count ?? 0,
  assembledTurn: c04Turn?.mergedText ?? null,
  disclosureSurvives: c04DisclosureSurvives,
  safetyScanned: c04SafetyScanned,
});
observed(
  "C-04 NOT reproduced: the first disclosure survives into the assembled turn",
  c04DisclosureSurvives
);
observed(
  "C-04 NOT reproduced: the assembled turn fires the deterministic allergen detector",
  c04SafetyScanned
);
acceptance(
  "C-04 fixed criterion is already satisfied at c38c6b6",
  c04DisclosureSurvives && c04SafetyScanned
);

console.log(
  `\nWO-PROOF-3 @ ${PINNED_REVISION.slice(0, 7)}: ` +
    `${observedFailures} reproduction-harness failure(s), ` +
    `${acceptanceFailures} red acceptance failure(s), ` +
    `${acceptancePasses} acceptance pass(es).`
);
console.log(
  acceptanceFailures > 0
    ? "EXPECTED RED: unresolved reproduced defects keep this suite non-zero."
    : "GREEN: every acceptance criterion is satisfied."
);

if (observedFailures > 0 || acceptanceFailures > 0) process.exitCode = 1;
