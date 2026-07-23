import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrainChannelEvent,
  BrainIngressPersistedEvent,
  BrainIngressSafetyScan,
  BrainIngressStore,
  BrainSafetyEvidence,
  BrainSafetyScanErrorCategory,
  BrainSafetyScanOutcome,
  BrainSafetyScanResult,
  BrainWebhookEnvelope,
  WhatsAppStatusValue,
} from "./types";
import { reduceWhatsAppStatusLattice, WHATSAPP_STATUS_RANK } from "./whatsapp-normalizer";

function uuid(): string {
  return randomUUID();
}

function eventStatusKey(event: BrainChannelEvent): string | null {
  if (event.eventKind !== "outbound_status" || !event.providerMessageId) return null;
  return `${event.tenantId}:${event.provider}:${event.providerMessageId}`;
}

interface StoredSafetyScan extends BrainIngressSafetyScan {
  readonly id: string;
  scanOutcome: BrainSafetyScanOutcome;
  errorCategory: BrainSafetyScanErrorCategory | null;
  resultFingerprint: string | null;
}

interface StoredSafetyEvidence extends BrainSafetyEvidence {
  readonly id: string;
  readonly tenantId: string;
  readonly scanId: string;
}

function completedOutcome(outcome: BrainSafetyScanOutcome): outcome is BrainSafetyScanResult["outcome"] {
  return outcome === "completed_signal" || outcome === "completed_no_signal";
}

function immutableChannelEventIdentity(event: BrainChannelEvent): string {
  return JSON.stringify({
    provider: event.provider,
    channel: event.channel,
    event_kind: event.eventKind,
    source_channel_event_id: event.sourceChannelEventId ?? null,
    provider_message_id: event.providerMessageId ?? null,
    customer_channel_id: event.customerChannelId ?? null,
    thread_key: event.threadKey ?? null,
    status: event.status ?? null,
    message_type: event.messageType ?? null,
    raw_event: event.rawEvent,
    provider_timestamp: event.providerTimestamp ?? null,
  });
}

function compareCanonical(left: unknown, right: unknown): number {
  const leftJson = JSON.stringify(left);
  const rightJson = JSON.stringify(right);
  return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
}

function safetyResultFingerprint(
  scan: BrainIngressSafetyScan,
  evidence: readonly BrainSafetyEvidence[],
  outcome: BrainSafetyScanResult["outcome"]
): string {
  const canonicalEvidence = evidence
    .map((row) => ({
      evidence_class: row.evidenceClass,
      disclosure_class: row.disclosureClass,
      matched_excerpt: row.matchedExcerpt,
      start_offset: row.startOffset,
      end_offset: row.endOffset,
      excerpt_hash: row.excerptHash,
      customer_authored: row.customerAuthored,
      audio_message_reference: row.audioMessageReference ?? null,
      transcription_provider: row.transcriptionProvider ?? null,
      transcription_model: row.transcriptionModel ?? null,
    }))
    .sort(compareCanonical);
  const canonicalSpans = scan.matchedSpans
    .map((span) => ({
      kind: span.kind,
      label: span.label,
      text: span.text,
      start: span.start,
      end: span.end,
    }))
    .sort(compareCanonical);
  const payload = {
    channel_event_id: scan.channelEventId ?? null,
    provider: scan.provider,
    source_message_id: scan.sourceMessageId,
    raw_text_hash: scan.rawTextHash ?? null,
    triage_class: scan.triageClass,
    safety_candidate: scan.safetyCandidate,
    explicit_stop: scan.explicitStop,
    human_takeover_requested: scan.humanTakeoverRequested,
    fast_path_markers: [...scan.fastPathMarkers].sort(),
    matched_spans: canonicalSpans,
    scanner_version: scan.scannerVersion,
    scan_outcome: outcome,
    evidence: canonicalEvidence,
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function validateEvidence(evidence: readonly BrainSafetyEvidence[]): void {
  for (const row of evidence) {
    if (!row.matchedExcerpt || row.startOffset < 0 || row.endOffset <= row.startOffset) {
      throw new Error("BRAIN safety evidence offsets are invalid");
    }
    if (row.excerptHash.length !== 64) throw new Error("BRAIN safety evidence hash is invalid");
    if (row.evidenceClass === "customer_text") {
      if (
        !row.customerAuthored ||
        row.audioMessageReference ||
        row.transcriptionProvider ||
        row.transcriptionModel
      ) {
        throw new Error("BRAIN customer text evidence provenance is invalid");
      }
    } else if (
      row.customerAuthored ||
      !row.audioMessageReference ||
      !row.transcriptionProvider ||
      !row.transcriptionModel
    ) {
      throw new Error("BRAIN speech transcript evidence provenance is invalid");
    }
  }
}

export class MemoryBrainIngressStore implements BrainIngressStore {
  readonly envelopes: BrainWebhookEnvelope[] = [];
  readonly events: BrainChannelEvent[] = [];
  readonly scans: StoredSafetyScan[] = [];
  readonly evidence: StoredSafetyEvidence[] = [];
  readonly statusHistory = new Map<string, WhatsAppStatusValue[]>();
  readonly statusAggregates = new Map<string, WhatsAppStatusValue>();

  async insertEnvelope(envelope: BrainWebhookEnvelope): Promise<{ id: string; inserted: boolean }> {
    const existing = this.envelopes.find(
      (candidate) =>
        candidate.tenantId === envelope.tenantId &&
        candidate.provider === envelope.provider &&
        candidate.payloadHash === envelope.payloadHash
    );
    if (existing?.id) return { id: existing.id, inserted: false };
    const id = envelope.id ?? uuid();
    this.envelopes.push({ ...envelope, id });
    return { id, inserted: true };
  }

  async insertChannelEvent(event: BrainChannelEvent): Promise<BrainIngressPersistedEvent> {
    const existing = this.events.find(
      (candidate) =>
        candidate.tenantId === event.tenantId &&
        candidate.provider === event.provider &&
        candidate.eventDedupeKey === event.eventDedupeKey
    );
    if (existing?.id) {
      if (immutableChannelEventIdentity(existing) !== immutableChannelEventIdentity(event)) {
        throw new Error("KIVO_CHANNEL_EVENT_DEDUPE_CONFLICT");
      }
      return { id: existing.id, inserted: false, duplicateOfId: existing.id };
    }

    const id = event.id ?? uuid();
    const stored = { ...event, id };
    this.events.push(stored);

    const statusKey = eventStatusKey(stored);
    if (statusKey && stored.status) {
      const history = this.statusHistory.get(statusKey) ?? [];
      history.push(stored.status);
      this.statusHistory.set(statusKey, history);
      const aggregate = reduceWhatsAppStatusLattice(history);
      if (aggregate) this.statusAggregates.set(statusKey, aggregate);
      return {
        id,
        inserted: true,
        aggregateStatus: aggregate,
        aggregateStatusRank: aggregate ? WHATSAPP_STATUS_RANK[aggregate] : 0,
      };
    }

    return { id, inserted: true };
  }

  async completeSafetyScan(
    scan: BrainIngressSafetyScan,
    evidence: readonly BrainSafetyEvidence[],
    outcome: BrainSafetyScanResult["outcome"]
  ): Promise<BrainSafetyScanResult> {
    const expectedOutcome = evidence.length > 0 ? "completed_signal" : "completed_no_signal";
    if (outcome !== expectedOutcome) {
      throw new Error(`BRAIN safety outcome mismatch: ${outcome}`);
    }
    if (
      (outcome === "completed_signal" && scan.safetyCandidate !== true) ||
      (outcome === "completed_no_signal" && scan.safetyCandidate !== false)
    ) {
      throw new Error(`BRAIN safety candidate/outcome mismatch: ${outcome}`);
    }
    validateEvidence(evidence);
    const resultFingerprint = safetyResultFingerprint(scan, evidence, outcome);

    const existing = this.scans.find(
      (candidate) => candidate.tenantId === scan.tenantId && candidate.channelEventId === scan.channelEventId
    );
    if (existing && completedOutcome(existing.scanOutcome)) {
      if (existing.resultFingerprint !== resultFingerprint) {
        throw new Error(
          "KIVO_SAFETY_SCAN_RESULT_CONFLICT: completed scan fingerprint mismatch; critical alert required"
        );
      }
      return {
        scanId: existing.id,
        outcome: existing.scanOutcome,
        evidenceCount: this.evidence.filter((row) => row.scanId === existing.id).length,
        alreadyCompleted: true,
      };
    }

    const id = existing?.id ?? uuid();
    if (existing) {
      Object.assign(existing, scan, { scanOutcome: outcome, errorCategory: null, resultFingerprint });
    } else {
      this.scans.push({ ...scan, id, scanOutcome: outcome, errorCategory: null, resultFingerprint });
    }
    for (const row of evidence) {
      this.evidence.push({ ...row, id: uuid(), tenantId: scan.tenantId, scanId: id });
    }
    return { scanId: id, outcome, evidenceCount: evidence.length, alreadyCompleted: false };
  }

  async failSafetyScan(args: {
    readonly tenantId: string;
    readonly channelEventId: string;
    readonly provider: "whatsapp";
    readonly sourceMessageId: string;
    readonly rawTextHash?: string | null;
    readonly scannerVersion: string;
    readonly errorCategory: BrainSafetyScanErrorCategory;
    readonly scannedAt: string;
  }): Promise<{ id: string; outcome: BrainSafetyScanOutcome }> {
    const existing = this.scans.find(
      (candidate) => candidate.tenantId === args.tenantId && candidate.channelEventId === args.channelEventId
    );
    if (existing && completedOutcome(existing.scanOutcome)) return { id: existing.id, outcome: existing.scanOutcome };
    if (existing) {
      existing.scanOutcome = "failed";
      existing.errorCategory = args.errorCategory;
      existing.resultFingerprint = null;
      return { id: existing.id, outcome: existing.scanOutcome };
    }

    const id = uuid();
    this.scans.push({
      id,
      tenantId: args.tenantId,
      channelEventId: args.channelEventId,
      provider: args.provider,
      sourceMessageId: args.sourceMessageId,
      rawTextHash: args.rawTextHash ?? null,
      triageClass: null,
      safetyCandidate: false,
      explicitStop: false,
      humanTakeoverRequested: false,
      fastPathMarkers: [],
      matchedSpans: [],
      scannerVersion: args.scannerVersion,
      scannedAt: args.scannedAt,
      scanOutcome: "failed",
      errorCategory: args.errorCategory,
      resultFingerprint: null,
    });
    return { id, outcome: "failed" };
  }
}

function firstRpcRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return (data[0] as Record<string, unknown> | undefined) ?? null;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

function rpcId(row: Record<string, unknown> | null, operation: string): string {
  const id = String(row?.id ?? "");
  if (!id) throw new Error(`BRAIN ${operation} returned no id`);
  return id;
}

function rpcError(operation: string, error: { code?: string; message?: string }): Error {
  const wrapped = new Error(`BRAIN ${operation} RPC failed: ${error.message ?? "unknown error"}`);
  if (error.code) Object.assign(wrapped, { code: error.code });
  return wrapped;
}

/**
 * Approved service-role exception for synchronous safety ingress persistence.
 * The caller must inject the server-only admin client; every write goes through
 * a tenant-validating RPC whose EXECUTE grant is restricted to service_role.
 */
export function createSupabaseBrainIngressStore(supabase: SupabaseClient): BrainIngressStore {
  return {
    async insertEnvelope(envelope) {
      const { data, error } = await supabase.rpc("brain_record_webhook_envelope", {
        p_tenant_id: envelope.tenantId,
        p_provider: envelope.provider,
        p_channel: envelope.channel,
        p_app_id: envelope.appId ?? null,
        p_received_at: envelope.receivedAt,
        p_payload_hash: envelope.payloadHash,
        p_signature_verified: envelope.signatureVerified,
        p_processing_status: envelope.processingStatus,
        p_raw_payload: envelope.rawPayload,
        p_error: envelope.error ?? null,
      });
      if (error) throw rpcError("envelope", error);
      const row = firstRpcRow(data);
      return { id: rpcId(row, "envelope RPC"), inserted: row?.inserted === true };
    },
    async insertChannelEvent(event) {
      const { data, error } = await supabase.rpc("brain_record_channel_event", {
        p_tenant_id: event.tenantId,
        p_envelope_id: event.envelopeId,
        p_provider: event.provider,
        p_channel: event.channel,
        p_event_kind: event.eventKind,
        p_event_dedupe_key: event.eventDedupeKey,
        p_event_index: event.eventIndex,
        p_source_channel_event_id: event.sourceChannelEventId ?? null,
        p_provider_message_id: event.providerMessageId ?? null,
        p_provider_timestamp: event.providerTimestamp ?? null,
        p_customer_channel_id: event.customerChannelId ?? null,
        p_thread_key: event.threadKey ?? null,
        p_status: event.status ?? null,
        p_status_rank: event.statusRank,
        p_message_type: event.messageType ?? null,
        p_raw_event: event.rawEvent,
        p_normalized_event: event.normalizedEvent,
        p_received_at: event.receivedAt,
      });
      if (error) throw rpcError("channel event", error);
      const row = firstRpcRow(data);
      const id = rpcId(row, "channel event RPC");
      const inserted = row?.inserted === true;
      return inserted ? { id, inserted } : { id, inserted, duplicateOfId: id };
    },
    async completeSafetyScan(scan, evidence, outcome) {
      const { data, error } = await supabase.rpc("brain_complete_ingress_safety_scan", {
        p_tenant_id: scan.tenantId,
        p_channel_event_id: scan.channelEventId,
        p_provider: scan.provider,
        p_source_message_id: scan.sourceMessageId,
        p_raw_text_hash: scan.rawTextHash ?? null,
        p_triage_class: scan.triageClass,
        p_safety_candidate: scan.safetyCandidate,
        p_explicit_stop: scan.explicitStop,
        p_human_takeover_requested: scan.humanTakeoverRequested,
        p_fast_path_markers: scan.fastPathMarkers,
        p_matched_spans: scan.matchedSpans,
        p_scanner_version: scan.scannerVersion,
        p_scanned_at: scan.scannedAt,
        p_scan_outcome: outcome,
        p_evidence: evidence.map((row) => ({
          evidence_class: row.evidenceClass,
          disclosure_class: row.disclosureClass,
          matched_excerpt: row.matchedExcerpt,
          start_offset: row.startOffset,
          end_offset: row.endOffset,
          excerpt_hash: row.excerptHash,
          customer_authored: row.customerAuthored,
          audio_message_reference: row.audioMessageReference ?? null,
          transcription_provider: row.transcriptionProvider ?? null,
          transcription_model: row.transcriptionModel ?? null,
        })),
      });
      if (error) throw rpcError("safety completion", error);
      const row = firstRpcRow(data);
      const returnedOutcome = String(row?.scan_outcome ?? "");
      if (returnedOutcome !== "completed_signal" && returnedOutcome !== "completed_no_signal") {
        throw new Error(`BRAIN safety completion RPC returned invalid outcome: ${returnedOutcome}`);
      }
      return {
        scanId: rpcId(row, "safety completion RPC"),
        outcome: returnedOutcome,
        evidenceCount: Number(row?.evidence_count ?? 0),
        alreadyCompleted: row?.already_completed === true,
      };
    },
    async failSafetyScan(args) {
      const { data, error } = await supabase.rpc("brain_fail_ingress_safety_scan", {
        p_tenant_id: args.tenantId,
        p_channel_event_id: args.channelEventId,
        p_provider: args.provider,
        p_source_message_id: args.sourceMessageId,
        p_raw_text_hash: args.rawTextHash ?? null,
        p_scanner_version: args.scannerVersion,
        p_error_category: args.errorCategory,
        p_scanned_at: args.scannedAt,
      });
      if (error) throw rpcError("safety failure", error);
      const row = firstRpcRow(data);
      const outcome = String(row?.scan_outcome ?? "") as BrainSafetyScanOutcome;
      return { id: rpcId(row, "safety failure RPC"), outcome };
    },
  };
}
