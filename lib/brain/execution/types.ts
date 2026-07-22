import type { BrainOwner, ISODateTime, UUID } from "../types";

export type BrainExecutionAttemptKind = "deterministic" | "llm_bound";
export type BrainExecutionRequestedBy = "brain_ingress_shadow" | "operator_replay" | "system_recovery";
export type BrainExecutionQueueName = "brain_turn_processing" | "brain_turn_dead_letter";

export type BrainExecutionOperationKey = string & { readonly __brand: "BrainExecutionOperationKey" };

export interface BrainExecutionQueuePayload {
  readonly schemaVersion: 1;
  readonly route: "turn_processing";
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly channelEventId?: UUID;
  readonly inboxId?: UUID;
  readonly turnEventId?: UUID;
  readonly operationKey: BrainExecutionOperationKey;
  readonly attemptKind: BrainExecutionAttemptKind;
  readonly requestedBy: BrainExecutionRequestedBy;
  readonly enqueuedAt: ISODateTime;
  readonly sequence?: number;
}

export interface BrainExecutionQueueMessage {
  readonly queueName: BrainExecutionQueueName;
  readonly messageId: string;
  readonly readCount: number;
  readonly payload: unknown;
  readonly enqueuedAt: ISODateTime;
}

export interface BrainThreadExecutionState {
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly owner: BrainOwner;
  readonly ownershipGeneration: number;
  readonly episodeRevision: number | null;
  readonly processingToken: UUID | null;
  readonly processingLeaseUntilMs: number | null;
  readonly nextExpectedSequence: number;
}

export type BrainLeaseClaimResult =
  | {
      readonly claimed: true;
      readonly leaseToken: UUID;
      readonly leaseUntilMs: number;
      readonly thread: BrainThreadExecutionState;
    }
  | {
      readonly claimed: false;
      readonly reason: "thread_not_found" | "tenant_mismatch" | "lease_held" | "closed";
      readonly retryAfterSeconds?: number;
    };

export type BrainShadowCommitResult =
  | {
      readonly committed: true;
      readonly idempotent: boolean;
      readonly effectId: UUID;
    }
  | {
      readonly committed: false;
      readonly reason:
        | "thread_not_found"
        | "tenant_mismatch"
        | "stale_lease"
        | "ownership_generation_changed"
        | "episode_revision_changed";
    };

export interface BrainExecutionBacklogStats {
  readonly queueLength: number;
  readonly oldestMessageAgeSeconds: number;
}

export interface BrainExecutionDeadLetterInput {
  readonly queueName: BrainExecutionQueueName;
  readonly originalQueueMessageId: string;
  readonly payload: BrainExecutionQueuePayload;
  readonly attemptCount: number;
  readonly firstFailureAt: ISODateTime;
  readonly lastFailureAt: ISODateTime;
  readonly lastErrorClass: string;
  readonly lastErrorMessage: string;
  readonly businessEffectCommitted: boolean;
  readonly requiredOperatorAction: string;
}

export interface BrainExecutionThrottleInput {
  readonly tenantId: UUID;
  readonly threadId?: UUID;
  readonly channelEventId?: UUID;
  readonly throttleScope: "global" | "tenant" | "thread" | "phone";
  readonly throttleReason:
    | "queue_backlog"
    | "oldest_message_age"
    | "tenant_rate"
    | "phone_rate"
    | "thread_queue_depth"
    | "retry_limit"
    | "database_unavailable"
    | "provider_outage"
    | "cost_budget_exhausted";
  readonly metricName: string;
  readonly metricValue: number;
  readonly thresholdValue: number;
  readonly action: "shed_shadow" | "defer" | "dead_letter" | "alert_only";
}

export interface BrainExecutionEffectInput {
  readonly payload: BrainExecutionQueuePayload;
  readonly queueName: BrainExecutionQueueName;
  readonly queueMessageId: string;
  readonly leaseToken: UUID;
  readonly expectedOwnershipGeneration: number;
  readonly expectedEpisodeRevision: number | null;
  readonly effectMetadata?: Record<string, unknown>;
}

export interface BrainExecutionStore {
  getBacklogStats(queueName: BrainExecutionQueueName): Promise<BrainExecutionBacklogStats>;
  readNextQueueMessage(args: {
    readonly queueName: BrainExecutionQueueName;
    readonly visibilityTimeoutSeconds: number;
  }): Promise<BrainExecutionQueueMessage | null>;
  setQueueMessageVisibility(args: {
    readonly queueName: BrainExecutionQueueName;
    readonly messageId: string;
    readonly delaySeconds: number;
  }): Promise<void>;
  deleteQueueMessage(args: {
    readonly queueName: BrainExecutionQueueName;
    readonly messageId: string;
  }): Promise<void>;
  archiveQueueMessage(args: {
    readonly queueName: BrainExecutionQueueName;
    readonly messageId: string;
  }): Promise<void>;
  claimThreadLease(args: {
    readonly tenantId: UUID;
    readonly threadId: UUID;
    readonly leaseDurationMs: number;
  }): Promise<BrainLeaseClaimResult>;
  renewThreadLease(args: {
    readonly tenantId: UUID;
    readonly threadId: UUID;
    readonly leaseToken: UUID;
    readonly leaseDurationMs: number;
  }): Promise<boolean>;
  releaseThreadLease(args: {
    readonly tenantId: UUID;
    readonly threadId: UUID;
    readonly leaseToken: UUID;
  }): Promise<boolean>;
  commitShadowEffect(args: BrainExecutionEffectInput): Promise<BrainShadowCommitResult>;
  recordDeadLetter(input: BrainExecutionDeadLetterInput): Promise<void>;
  recordThrottle(input: BrainExecutionThrottleInput): Promise<void>;
}

export type BrainExecutionWorkerStatus =
  | "idle"
  | "processed"
  | "duplicate_effect"
  | "lease_backoff"
  | "shed_shadow"
  | "retry_scheduled"
  | "dead_lettered"
  | "stale_rejected"
  | "simulated_crash";

export interface BrainExecutionWorkerResult {
  readonly status: BrainExecutionWorkerStatus;
  readonly messageId?: string;
  readonly operationKey?: BrainExecutionOperationKey;
  readonly leaseToken?: UUID;
  readonly effectId?: UUID;
  readonly reason?: string;
  readonly delaySeconds?: number;
}
