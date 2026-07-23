import type { ISODateTime, UUID } from "../types";

export type BrainIngressProvider = "whatsapp";
export type BrainIngressChannel = "whatsapp";
export type BrainIngressEventKind = "customer_inbound" | "outbound_status" | "other";

export type BrainSafetyTriageClass =
  | "SAFETY_INFORMATION_QUERY"
  | "EXPLICIT_CUSTOMER_DISCLOSURE"
  | "THIRD_PARTY_DISCLOSURE"
  | "PROBABLE_DISCLOSURE"
  | "UNCERTAIN_SAFETY_SIGNAL"
  | "CROSS_CONTAMINATION_QUERY"
  | "NON_MEDICAL_PREFERENCE";

export type BrainSafetySpanKind =
  | "allergy"
  | "allergen"
  | "ingredient"
  | "medical"
  | "symptom"
  | "cross_contact"
  | "third_party"
  | "preference"
  | "stop"
  | "human";

export type BrainSafetyEvidenceClass = "customer_text" | "speech_transcript";
export type BrainSafetyScanOutcome = "pending" | "completed_signal" | "completed_no_signal" | "failed";
export type BrainSafetyScanErrorCategory =
  | "scanner_failed"
  | "evidence_validation_failed"
  | "evidence_persist_failed"
  | "database_unavailable";

export interface BrainIngressTenant {
  readonly tenantId: UUID;
  readonly phoneNumberId: string;
  readonly appId?: string | null;
  readonly appSecrets: readonly string[];
}

export interface BrainIngressTenantResolver {
  resolveByPhoneNumberId(phoneNumberId: string | null): Promise<BrainIngressTenant | null>;
}

export interface BrainWebhookEnvelope {
  readonly id?: UUID;
  readonly tenantId: UUID;
  readonly provider: BrainIngressProvider;
  readonly channel: BrainIngressChannel;
  readonly appId?: string | null;
  readonly receivedAt: ISODateTime;
  readonly payloadHash: string;
  readonly signatureVerified: boolean;
  readonly processingStatus: "received" | "normalized" | "rejected" | "failed";
  readonly rawPayload: unknown;
  readonly error?: string | null;
}

export interface BrainRawMessageForScan {
  readonly sourceMessageId: string;
  readonly messageType: string;
  readonly text: string;
  readonly interactiveId?: string | null;
  readonly mediaType?: string | null;
  readonly raw: unknown;
}

export interface BrainChannelEvent {
  readonly id?: UUID;
  readonly tenantId: UUID;
  readonly envelopeId?: UUID;
  readonly provider: BrainIngressProvider;
  readonly channel: BrainIngressChannel;
  readonly eventKind: BrainIngressEventKind;
  readonly eventDedupeKey: string;
  readonly eventIndex: number;
  readonly sourceChannelEventId?: UUID | null;
  readonly providerMessageId?: string | null;
  readonly providerTimestamp?: ISODateTime | null;
  readonly customerChannelId?: string | null;
  readonly threadKey?: string | null;
  readonly status?: WhatsAppStatusValue | null;
  readonly statusRank: number;
  readonly messageType?: string | null;
  readonly rawEvent: unknown;
  readonly normalizedEvent: unknown;
  readonly receivedAt: ISODateTime;
  readonly rawMessageForScan?: BrainRawMessageForScan;
}

export interface BrainSafetyMatchedSpan {
  readonly kind: BrainSafetySpanKind;
  readonly label: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface BrainSafetyEvidence {
  readonly evidenceClass: BrainSafetyEvidenceClass;
  readonly disclosureClass: BrainSafetySpanKind;
  readonly matchedExcerpt: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly excerptHash: string;
  readonly customerAuthored: boolean;
  readonly audioMessageReference?: string | null;
  readonly transcriptionProvider?: string | null;
  readonly transcriptionModel?: string | null;
}

export interface BrainIngressSafetyScan {
  readonly tenantId: UUID;
  readonly channelEventId?: UUID;
  readonly provider: BrainIngressProvider;
  readonly sourceMessageId: string;
  readonly rawTextHash?: string | null;
  readonly triageClass: BrainSafetyTriageClass | null;
  readonly safetyCandidate: boolean;
  readonly explicitStop: boolean;
  readonly humanTakeoverRequested: boolean;
  readonly fastPathMarkers: readonly string[];
  readonly matchedSpans: readonly BrainSafetyMatchedSpan[];
  readonly scannerVersion: string;
  readonly scannedAt: ISODateTime;
}

export interface BrainSafetyScanResult {
  readonly scanId: UUID;
  readonly outcome: Extract<BrainSafetyScanOutcome, "completed_signal" | "completed_no_signal">;
  readonly evidenceCount: number;
  readonly alreadyCompleted: boolean;
}

export type WhatsAppStatusValue = "sent" | "delivered" | "read" | "failed";

export interface BrainIngressPersistedEvent {
  readonly id: UUID;
  readonly inserted: boolean;
  readonly duplicateOfId?: UUID;
  readonly aggregateStatus?: WhatsAppStatusValue | null;
  readonly aggregateStatusRank?: number;
}

export interface BrainIngressStore {
  insertEnvelope(envelope: BrainWebhookEnvelope): Promise<{ id: UUID; inserted: boolean }>;
  insertChannelEvent(event: BrainChannelEvent): Promise<BrainIngressPersistedEvent>;
  completeSafetyScan(
    scan: BrainIngressSafetyScan,
    evidence: readonly BrainSafetyEvidence[],
    outcome: Extract<BrainSafetyScanOutcome, "completed_signal" | "completed_no_signal">
  ): Promise<BrainSafetyScanResult>;
  failSafetyScan(args: {
    readonly tenantId: UUID;
    readonly channelEventId: UUID;
    readonly provider: BrainIngressProvider;
    readonly sourceMessageId: string;
    readonly rawTextHash?: string | null;
    readonly scannerVersion: string;
    readonly errorCategory: BrainSafetyScanErrorCategory;
    readonly scannedAt: ISODateTime;
  }): Promise<{ id: UUID; outcome: BrainSafetyScanOutcome }>;
}

export interface BrainIngressPersistedMessage {
  readonly sourceMessageId: string;
  readonly channelEventId: UUID;
  readonly scanOutcome: Extract<BrainSafetyScanOutcome, "completed_signal" | "completed_no_signal">;
}

export interface BrainIngressResult {
  readonly ok: boolean;
  readonly status: number;
  readonly error?: string;
  readonly tenantId?: UUID;
  readonly envelopeId?: UUID;
  readonly receivedEvents: number;
  readonly insertedEvents: number;
  readonly duplicateEvents: number;
  readonly safetyScans: number;
  readonly persistedMessages?: readonly BrainIngressPersistedMessage[];
}
