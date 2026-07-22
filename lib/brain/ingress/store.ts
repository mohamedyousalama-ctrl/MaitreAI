import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrainChannelEvent,
  BrainIngressPersistedEvent,
  BrainIngressSafetyScan,
  BrainIngressStore,
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

export class MemoryBrainIngressStore implements BrainIngressStore {
  readonly envelopes: BrainWebhookEnvelope[] = [];
  readonly events: BrainChannelEvent[] = [];
  readonly scans: BrainIngressSafetyScan[] = [];
  readonly statusHistory = new Map<string, WhatsAppStatusValue[]>();
  readonly statusAggregates = new Map<string, WhatsAppStatusValue>();

  async insertEnvelope(envelope: BrainWebhookEnvelope): Promise<{ id: string }> {
    const id = envelope.id ?? uuid();
    this.envelopes.push({ ...envelope, id });
    return { id };
  }

  async insertChannelEvent(event: BrainChannelEvent): Promise<BrainIngressPersistedEvent> {
    const existing = this.events.find(
      (candidate) =>
        candidate.tenantId === event.tenantId &&
        candidate.provider === event.provider &&
        candidate.eventDedupeKey === event.eventDedupeKey
    );
    if (existing?.id) {
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

  async insertSafetyScan(scan: BrainIngressSafetyScan): Promise<{ id: string }> {
    const id = uuid();
    this.scans.push(scan);
    return { id };
  }
}

export function createSupabaseBrainIngressStore(supabase: SupabaseClient): BrainIngressStore {
  return {
    async insertEnvelope(envelope) {
      const { data, error } = await supabase
        .from("webhook_envelopes")
        .insert({
          tenant_id: envelope.tenantId,
          provider: envelope.provider,
          channel: envelope.channel,
          app_id: envelope.appId ?? null,
          received_at: envelope.receivedAt,
          payload_hash: envelope.payloadHash,
          signature_verified: envelope.signatureVerified,
          processing_status: envelope.processingStatus,
          raw_payload: envelope.rawPayload,
          error: envelope.error ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(`BRAIN envelope insert failed: ${error.message}`);
      return { id: String(data.id) };
    },
    async insertChannelEvent(event) {
      const { data, error } = await supabase
        .from("channel_events")
        .upsert(
          {
            tenant_id: event.tenantId,
            envelope_id: event.envelopeId,
            provider: event.provider,
            channel: event.channel,
            event_kind: event.eventKind,
            event_dedupe_key: event.eventDedupeKey,
            event_index: event.eventIndex,
            provider_message_id: event.providerMessageId ?? null,
            provider_timestamp: event.providerTimestamp ?? null,
            customer_channel_id: event.customerChannelId ?? null,
            thread_key: event.threadKey ?? null,
            status: event.status ?? null,
            status_rank: event.statusRank,
            message_type: event.messageType ?? null,
            raw_event: event.rawEvent,
            normalized_event: event.normalizedEvent,
            received_at: event.receivedAt,
          },
          { onConflict: "tenant_id,provider,event_dedupe_key", ignoreDuplicates: true }
        )
        .select("id");
      if (error) throw new Error(`BRAIN channel event insert failed: ${error.message}`);
      const first = Array.isArray(data) ? data[0] : data;
      if (!first?.id) {
        return { id: event.id ?? "00000000-0000-0000-0000-000000000000", inserted: false };
      }
      return { id: String(first.id), inserted: true };
    },
    async insertSafetyScan(scan) {
      const { data, error } = await supabase
        .from("ingress_safety_scans")
        .upsert(
          {
            tenant_id: scan.tenantId,
            channel_event_id: scan.channelEventId,
            provider: scan.provider,
            source_message_id: scan.sourceMessageId,
            raw_text_hash: scan.rawTextHash ?? null,
            triage_class: scan.triageClass,
            safety_candidate: scan.safetyCandidate,
            explicit_stop: scan.explicitStop,
            human_takeover_requested: scan.humanTakeoverRequested,
            fast_path_markers: scan.fastPathMarkers,
            matched_spans: scan.matchedSpans,
            scanner_version: scan.scannerVersion,
            scanned_at: scan.scannedAt,
          },
          { onConflict: "tenant_id,channel_event_id", ignoreDuplicates: true }
        )
        .select("id");
      if (error) throw new Error(`BRAIN safety scan insert failed: ${error.message}`);
      const first = Array.isArray(data) ? data[0] : data;
      return { id: String(first?.id ?? "00000000-0000-0000-0000-000000000000") };
    },
  };
}
