import type { BrainIngressResult, BrainIngressStore, BrainIngressTenantResolver, BrainWebhookEnvelope } from "./types";
import { scanRawMessageForSafety } from "./safety-scanner";
import { sha256Hex, verifySha256Signature } from "./signature";
import { extractWhatsAppPhoneNumberId, normalizeWhatsAppBrainEvents } from "./whatsapp-normalizer";

export interface HandleWhatsAppBrainIngressInput {
  readonly rawBody: Buffer | ArrayBuffer | Uint8Array | string;
  readonly signatureHeader: string | null;
  readonly receivedAt?: Date;
  readonly tenantResolver: BrainIngressTenantResolver;
  readonly store: BrainIngressStore;
}

function bodyBuffer(body: Buffer | ArrayBuffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return Buffer.from(body);
}

export async function handleWhatsAppBrainIngress(input: HandleWhatsAppBrainIngressInput): Promise<BrainIngressResult> {
  const rawBody = bodyBuffer(input.rawBody);
  const receivedAt = (input.receivedAt ?? new Date()).toISOString();
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

  const envelope: BrainWebhookEnvelope = {
    tenantId: tenant.tenantId,
    provider: "whatsapp",
    channel: "whatsapp",
    appId: tenant.appId ?? null,
    receivedAt,
    payloadHash: sha256Hex(rawBody),
    signatureVerified,
    processingStatus: "normalized",
    rawPayload: payload,
  };
  const insertedEnvelope = await input.store.insertEnvelope(envelope);
  const events = normalizeWhatsAppBrainEvents({
    payload,
    tenantId: tenant.tenantId,
    receivedAt,
    envelopeId: insertedEnvelope.id,
  });

  let insertedEvents = 0;
  let duplicateEvents = 0;
  let safetyScans = 0;

  for (const event of events) {
    const persisted = await input.store.insertChannelEvent({ ...event, envelopeId: insertedEnvelope.id });
    if (persisted.inserted) {
      insertedEvents++;
      if (event.rawMessageForScan) {
        await input.store.insertSafetyScan({
          ...scanRawMessageForSafety(event.rawMessageForScan, tenant.tenantId),
          channelEventId: persisted.id,
        });
        safetyScans++;
      }
    } else {
      duplicateEvents++;
    }
  }

  return {
    ok: true,
    status: 200,
    tenantId: tenant.tenantId,
    envelopeId: insertedEnvelope.id,
    receivedEvents: events.length,
    insertedEvents,
    duplicateEvents,
    safetyScans,
  };
}
