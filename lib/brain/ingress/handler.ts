import type {
  BrainChannelEvent,
  BrainIngressResult,
  BrainIngressStore,
  BrainIngressTenantResolver,
  BrainWebhookEnvelope,
} from "./types";
import { scanAndRecordRawSafetyInbound } from "./safety-scanner";
import { canonicalFingerprint, sha256Hex, verifySha256Signature } from "./signature";
import { extractWhatsAppPhoneNumberId, normalizeWhatsAppBrainEvents } from "./whatsapp-normalizer";

export interface HandleWhatsAppBrainIngressInput {
  readonly rawBody: Buffer | ArrayBuffer | Uint8Array | string;
  readonly signatureHeader: string | null;
  readonly receivedAt?: Date;
  readonly tenantResolver: BrainIngressTenantResolver;
  readonly store: BrainIngressStore;
}

export interface PersistVerifiedWhatsAppBrainIngressInput {
  readonly rawBody: Buffer | ArrayBuffer | Uint8Array | string;
  readonly payload: unknown;
  readonly tenantId: string;
  readonly appId?: string | null;
  readonly receivedAt?: Date;
  readonly store: BrainIngressStore;
}

function bodyBuffer(body: Buffer | ArrayBuffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(body);
}

export async function persistVerifiedWhatsAppBrainIngress(
  input: PersistVerifiedWhatsAppBrainIngressInput
): Promise<BrainIngressResult> {
  const rawBody = bodyBuffer(input.rawBody);
  const receivedAt = (input.receivedAt ?? new Date()).toISOString();
  const envelope: BrainWebhookEnvelope = {
    tenantId: input.tenantId,
    provider: "whatsapp",
    channel: "whatsapp",
    appId: input.appId ?? null,
    receivedAt,
    payloadHash: sha256Hex(rawBody),
    signatureVerified: true,
    processingStatus: "normalized",
    rawPayload: input.payload,
  };
  const persistedEnvelope = await input.store.insertEnvelope(envelope);
  const events = normalizeWhatsAppBrainEvents({
    payload: input.payload,
    tenantId: input.tenantId,
    receivedAt,
    envelopeId: persistedEnvelope.id,
  });

  let insertedEvents = 0;
  let duplicateEvents = 0;
  let safetyScans = 0;
  const persistedMessages: NonNullable<BrainIngressResult["persistedMessages"]>[number][] = [];

  for (const event of events) {
    const persisted = await input.store.insertChannelEvent({ ...event, envelopeId: persistedEnvelope.id });
    if (persisted.inserted) insertedEvents++;
    else duplicateEvents++;

    // Never return early for a duplicate event. A previous attempt may have
    // committed the raw event and failed before its safety scan completed.
    if (event.rawMessageForScan) {
      // Synchronous deterministic safety scanning is authoritative before bridge
      // release. Async work may enrich evidence later, but cannot replace or delay
      // this ingress gate.
      const scan = await scanAndRecordRawSafetyInbound({
        store: input.store,
        tenantId: input.tenantId,
        channelEventId: persisted.id,
        rawMessage: event.rawMessageForScan,
      });
      safetyScans++;
      persistedMessages.push({
        sourceMessageId: event.rawMessageForScan.sourceMessageId,
        channelEventId: persisted.id,
        scanOutcome: scan.outcome,
      });
    }
  }

  return {
    ok: true,
    status: 200,
    tenantId: input.tenantId,
    envelopeId: persistedEnvelope.id,
    receivedEvents: events.length,
    insertedEvents,
    duplicateEvents,
    safetyScans,
    persistedMessages,
  };
}

export async function recordSpeechTranscriptSafetyInbound(args: {
  readonly store: BrainIngressStore;
  readonly tenantId: string;
  readonly envelopeId: string;
  readonly sourceChannelEventId: string;
  readonly sourceMessageId: string;
  readonly transcript: string;
  readonly audioMessageReference: string;
  readonly transcriptionProvider: string;
  readonly transcriptionModel: string;
  readonly receivedAt?: Date;
}) {
  const receivedAt = (args.receivedAt ?? new Date()).toISOString();
  const event: BrainChannelEvent = {
    tenantId: args.tenantId,
    envelopeId: args.envelopeId,
    provider: "whatsapp",
    channel: "whatsapp",
    eventKind: "other",
    eventDedupeKey: `whatsapp:${args.tenantId}:speech_transcript:${canonicalFingerprint([args.sourceMessageId])}`,
    eventIndex: 0,
    sourceChannelEventId: args.sourceChannelEventId,
    providerMessageId: args.sourceMessageId,
    providerTimestamp: receivedAt,
    customerChannelId: null,
    threadKey: null,
    status: null,
    statusRank: 0,
    messageType: "speech_transcript",
    rawEvent: {
      sourceMessageId: args.sourceMessageId,
      audioMessageReference: args.audioMessageReference,
    },
    normalizedEvent: {
      sourceMessageId: args.sourceMessageId,
      transcript: args.transcript,
      transcriptionProvider: args.transcriptionProvider,
      transcriptionModel: args.transcriptionModel,
      derived: true,
      customerAuthored: false,
    },
    receivedAt,
  };
  const persisted = await args.store.insertChannelEvent(event);
  const scan = await scanAndRecordRawSafetyInbound({
    store: args.store,
    tenantId: args.tenantId,
    channelEventId: persisted.id,
    rawMessage: {
      sourceMessageId: args.sourceMessageId,
      messageType: "speech_transcript",
      text: args.transcript,
      mediaType: "audio",
      raw: event.normalizedEvent,
    },
    evidenceClass: "speech_transcript",
    audioMessageReference: args.audioMessageReference,
    transcriptionProvider: args.transcriptionProvider,
    transcriptionModel: args.transcriptionModel,
  });
  return { eventId: persisted.id, eventInserted: persisted.inserted, scan };
}

export async function handleWhatsAppBrainIngress(input: HandleWhatsAppBrainIngressInput): Promise<BrainIngressResult> {
  const rawBody = bodyBuffer(input.rawBody);
  let payload: unknown;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return {
      ok: false,
      status: 400,
      error: "invalid_json",
      receivedEvents: 0,
      insertedEvents: 0,
      duplicateEvents: 0,
      safetyScans: 0,
    };
  }

  const phoneNumberId = extractWhatsAppPhoneNumberId(payload);
  const tenant = await input.tenantResolver.resolveByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    return {
      ok: false,
      status: 403,
      error: "tenant_unresolved",
      receivedEvents: 0,
      insertedEvents: 0,
      duplicateEvents: 0,
      safetyScans: 0,
    };
  }

  const signatureVerified = verifySha256Signature(rawBody, input.signatureHeader, tenant.appSecrets);
  if (!signatureVerified) {
    return {
      ok: false,
      status: 401,
      error: "invalid_signature",
      tenantId: tenant.tenantId,
      receivedEvents: 0,
      insertedEvents: 0,
      duplicateEvents: 0,
      safetyScans: 0,
    };
  }

  try {
    return await persistVerifiedWhatsAppBrainIngress({
      rawBody,
      payload,
      tenantId: tenant.tenantId,
      appId: tenant.appId,
      receivedAt: input.receivedAt,
      store: input.store,
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "safety_ingress_persist_failed",
      tenantId: tenant.tenantId,
      receivedEvents: 0,
      insertedEvents: 0,
      duplicateEvents: 0,
      safetyScans: 0,
    };
  }
}
