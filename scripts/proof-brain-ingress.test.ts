// ============================================================================
// WO-BRAIN-0A behavior proof.
//
// This is intentionally an in-memory behavior proof for the shadow-only BRAIN
// ingress handler. It does not require staging credentials and does not touch the
// live WhatsApp webhook or a database.
//
// Run:
//   node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-brain-ingress.test.ts
// ============================================================================

import { createHmac } from "node:crypto";
import {
  handleWhatsAppBrainIngress,
  MemoryBrainIngressStore,
  type BrainIngressTenantResolver,
} from "../lib/brain/ingress/index.ts";

const tenantA = "00000000-0000-4000-8000-00000000000a";
const tenantB = "00000000-0000-4000-8000-00000000000b";
const phoneA = "111111111111111";
const phoneB = "222222222222222";
const secretA = "tenant-a-app-secret";
const secretB = "tenant-b-app-secret";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    return;
  }
  fail++;
  console.error("  x FAIL:", name, detail ?? "");
}

const resolver: BrainIngressTenantResolver = {
  async resolveByPhoneNumberId(phoneNumberId) {
    if (phoneNumberId === phoneA) return { tenantId: tenantA, phoneNumberId: phoneA, appSecrets: [secretA] };
    if (phoneNumberId === phoneB) return { tenantId: tenantB, phoneNumberId: phoneB, appSecrets: [secretB] };
    return null;
  },
};

function sign(body: string, secret = secretA): string {
  return "sha256=" + createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex");
}

function webhookPayload(phoneNumberId: string, messages: unknown[] = [], statuses: unknown[] = [], extra: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_PROOF",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phoneNumberId, display_phone_number: "+966000000000" },
              contacts: [{ profile: { name: "Proof Customer" }, wa_id: "966500000000" }],
              messages,
              statuses,
              ...extra,
            },
          },
        ],
      },
    ],
  };
}

function textMessage(id: string, body: string, from = "966500000000") {
  return {
    from,
    id,
    timestamp: "1790000000",
    type: "text",
    text: { body },
  };
}

function statusEvent(id: string, status: string, timestamp: string) {
  return {
    id,
    status,
    timestamp,
    recipient_id: "966500000000",
  };
}

async function ingest(store: MemoryBrainIngressStore, payload: unknown, secret = secretA) {
  const body = JSON.stringify(payload);
  return await handleWhatsAppBrainIngress({
    rawBody: body,
    signatureHeader: sign(body, secret),
    tenantResolver: resolver,
    store,
  });
}

async function proofDuplicateInbound() {
  const store = new MemoryBrainIngressStore();
  const payload = webhookPayload(phoneA, [textMessage("wamid.inbound.1", "hello")]);
  await ingest(store, payload);
  await ingest(store, payload);

  const inbound = store.events.filter((event) => event.eventKind === "customer_inbound");
  check("duplicate inbound webhook -> one logical inbound event", inbound.length === 1, inbound.map((event) => event.eventDedupeKey));
  check("duplicate inbound still records no business effects", store.scans.length === 1);
}

async function proofStatusEventsDoNotCollide() {
  const store = new MemoryBrainIngressStore();
  const statuses = [
    statusEvent("wamid.outbound.1", "read", "1790000004"),
    statusEvent("wamid.outbound.1", "failed", "1790000003"),
    statusEvent("wamid.outbound.1", "sent", "1790000001"),
    statusEvent("wamid.outbound.1", "delivered", "1790000002"),
  ];
  await ingest(store, webhookPayload(phoneA, [], statuses));

  const events = store.events.filter((event) => event.eventKind === "outbound_status");
  const statusKey = `${tenantA}:whatsapp:wamid.outbound.1`;
  const aggregateHistory = store.statusHistory.get(statusKey) ?? [];
  check("four status events sharing one provider id are all recorded", events.length === 4, events);
  check("status dedupe keys include status+timestamp", new Set(events.map((event) => event.eventDedupeKey)).size === 4);
  check("status lattice preserves strongest status under out-of-order delivery", store.statusAggregates.get(statusKey) === "failed", aggregateHistory);
  check("later arriving earlier statuses did not discard read", aggregateHistory.includes("read"));
}

async function proofMultipleMessagesInOneEnvelope() {
  const store = new MemoryBrainIngressStore();
  await ingest(
    store,
    webhookPayload(phoneA, [
      textMessage("wamid.multi.1", "first"),
      textMessage("wamid.multi.2", "second"),
      textMessage("wamid.multi.3", "third"),
    ])
  );

  check("one webhook carrying multiple messages -> each atomic event", store.events.length === 3, store.events.length);
  check("each message has its own source id scan", new Set(store.scans.map((scan) => scan.sourceMessageId)).size === 3);
}

async function proofRawSafetyBeforeCoalescing() {
  const store = new MemoryBrainIngressStore();
  await ingest(
    store,
    webhookPayload(phoneA, [
      textMessage("wamid.safety.1", "ابني عنده حساسية لبن"),
      textMessage("wamid.safety.2", "عايز وجبة دجاج"),
    ])
  );

  const first = store.scans.find((scan) => scan.sourceMessageId === "wamid.safety.1");
  const second = store.scans.find((scan) => scan.sourceMessageId === "wamid.safety.2");
  check("short standalone disclosure is scanned as its own raw message", first?.safetyCandidate === true, first);
  check("third-party disclosure class is preserved before coalescing", first?.triageClass === "THIRD_PARTY_DISCLOSURE", first?.triageClass);
  check("following unrelated order text does not erase raw safety scan", second !== undefined && first !== undefined);
}

async function proofInvalidSignatureRejected() {
  const store = new MemoryBrainIngressStore();
  const body = JSON.stringify(webhookPayload(phoneA, [textMessage("wamid.bad.sig", "hello")]));
  const result = await handleWhatsAppBrainIngress({
    rawBody: body,
    signatureHeader: "sha256=bad",
    tenantResolver: resolver,
    store,
  });

  check("forged signature rejected", result.status === 401 && result.ok === false, result);
  check("forged signature persists nothing", store.envelopes.length === 0 && store.events.length === 0 && store.scans.length === 0, store);

  const absentResult = await handleWhatsAppBrainIngress({
    rawBody: body,
    signatureHeader: null,
    tenantResolver: resolver,
    store,
  });
  check("absent signature rejected", absentResult.status === 401 && absentResult.ok === false, absentResult);
  check("absent signature persists nothing", store.envelopes.length === 0 && store.events.length === 0 && store.scans.length === 0, store);
}

async function proofCrossTenantBinding() {
  const store = new MemoryBrainIngressStore();
  await ingest(
    store,
    webhookPayload(phoneA, [
      {
        ...textMessage("wamid.cross.tenant", "hello"),
        interactive: { button_reply: { id: `tenant:${tenantB}:confirm`, title: "Confirm" } },
      },
    ])
  );

  check("phone-number config maps event to tenant A", store.events.every((event) => event.tenantId === tenantA), store.events);
  check("payload/button tenant B cannot choose row tenant", store.events.every((event) => event.tenantId !== tenantB), store.events);

  const bodyB = JSON.stringify(webhookPayload(phoneA, [textMessage("wamid.cross.sig", "hello")]));
  const wrongTenantSignature = await handleWhatsAppBrainIngress({
    rawBody: bodyB,
    signatureHeader: sign(bodyB, secretB),
    tenantResolver: resolver,
    store,
  });
  check("tenant B secret cannot sign tenant A phone-number event", wrongTenantSignature.status === 401, wrongTenantSignature);
}

async function main() {
  await proofDuplicateInbound();
  await proofStatusEventsDoNotCollide();
  await proofMultipleMessagesInOneEnvelope();
  await proofRawSafetyBeforeCoalescing();
  await proofInvalidSignatureRejected();
  await proofCrossTenantBinding();

  console.log(`BRAIN INGRESS PROOF: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

await main();
