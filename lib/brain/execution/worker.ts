import { assertMetadataOnlyQueuePayload } from "./payload";
import {
  BRAIN_DETERMINISTIC_VISIBILITY_SECONDS,
  BRAIN_MAX_PROCESSING_ATTEMPTS,
  BRAIN_TURN_PROCESSING_QUEUE,
  classifyExecutionError,
  retryDelaySecondsForAttempt,
  shouldDeadLetterAttempt,
  shouldShedShadowProcessing,
  visibilityTimeoutSeconds,
} from "./policy";
import type {
  BrainExecutionQueueMessage,
  BrainExecutionQueuePayload,
  BrainExecutionStore,
  BrainExecutionWorkerResult,
} from "./types";

export interface BrainShadowWorkerOptions {
  readonly leaseDurationMs?: number;
  readonly crashAfterClaimOperationKeys?: ReadonlySet<string>;
  readonly performShadowWork?: (args: {
    readonly payload: BrainExecutionQueuePayload;
    readonly message: BrainExecutionQueueMessage;
    readonly leaseToken: string;
  }) => Promise<void> | void;
}

const defaultLeaseDurationMs = 45_000;

async function deadLetterInvalidPayload(store: BrainExecutionStore, message: BrainExecutionQueueMessage, error: Error): Promise<BrainExecutionWorkerResult> {
  await store.archiveQueueMessage({ queueName: message.queueName, messageId: message.messageId });
  return {
    status: "dead_lettered",
    messageId: message.messageId,
    reason: error.message,
  };
}

async function deadLetterMessage(args: {
  readonly store: BrainExecutionStore;
  readonly message: BrainExecutionQueueMessage;
  readonly payload: BrainExecutionQueuePayload;
  readonly errorClass: string;
  readonly errorMessage: string;
  readonly requiredOperatorAction: string;
  readonly businessEffectCommitted?: boolean;
}): Promise<BrainExecutionWorkerResult> {
  const now = new Date().toISOString();
  await args.store.recordDeadLetter({
    queueName: args.message.queueName,
    originalQueueMessageId: args.message.messageId,
    payload: args.payload,
    attemptCount: Math.max(args.message.readCount, 1),
    firstFailureAt: args.message.enqueuedAt,
    lastFailureAt: now,
    lastErrorClass: args.errorClass,
    lastErrorMessage: args.errorMessage,
    businessEffectCommitted: args.businessEffectCommitted ?? false,
    requiredOperatorAction: args.requiredOperatorAction,
  });
  await args.store.archiveQueueMessage({ queueName: args.message.queueName, messageId: args.message.messageId });
  return {
    status: "dead_lettered",
    messageId: args.message.messageId,
    operationKey: args.payload.operationKey,
    reason: args.errorClass,
  };
}

export async function processBrainExecutionMessage(
  store: BrainExecutionStore,
  message: BrainExecutionQueueMessage,
  options: BrainShadowWorkerOptions = {}
): Promise<BrainExecutionWorkerResult> {
  try {
    assertMetadataOnlyQueuePayload(message.payload);
  } catch (error) {
    return await deadLetterInvalidPayload(store, message, error instanceof Error ? error : new Error(String(error)));
  }

  const payload = message.payload;
  if (payload.attemptKind === "llm_bound") {
    await store.setQueueMessageVisibility({
      queueName: message.queueName,
      messageId: message.messageId,
      delaySeconds: visibilityTimeoutSeconds("llm_bound"),
    });
  }

  const stats = await store.getBacklogStats(message.queueName);
  const shed =
    payload.requestedBy === "brain_ingress_shadow" && message.readCount <= 1
      ? shouldShedShadowProcessing(stats)
      : { shed: false };
  if (shed.shed) {
    await store.recordThrottle({
      tenantId: payload.tenantId,
      threadId: payload.threadId,
      channelEventId: payload.channelEventId,
      throttleScope: shed.reason === "queue_backlog" ? "global" : "tenant",
      throttleReason: shed.reason ?? "queue_backlog",
      metricName: shed.reason === "oldest_message_age" ? "oldest_message_age_seconds" : "queue_length",
      metricValue: shed.reason === "oldest_message_age" ? stats.oldestMessageAgeSeconds : stats.queueLength,
      thresholdValue: shed.reason === "oldest_message_age" ? 300 : 1000,
      action: "shed_shadow",
    });
    await store.setQueueMessageVisibility({ queueName: message.queueName, messageId: message.messageId, delaySeconds: 60 });
    return {
      status: "shed_shadow",
      messageId: message.messageId,
      operationKey: payload.operationKey,
      reason: shed.reason,
      delaySeconds: 60,
    };
  }

  const claim = await store.claimThreadLease({
    tenantId: payload.tenantId,
    threadId: payload.threadId,
    leaseDurationMs: options.leaseDurationMs ?? defaultLeaseDurationMs,
  });
  if (!claim.claimed) {
    if (claim.reason === "thread_not_found" || claim.reason === "tenant_mismatch") {
      return await deadLetterMessage({
        store,
        message,
        payload,
        errorClass: "TENANT_THREAD_NOT_FOUND",
        errorMessage: claim.reason,
        requiredOperatorAction: "Inspect tenant/thread references before replay.",
      });
    }
    const delaySeconds = claim.retryAfterSeconds ?? 5;
    await store.setQueueMessageVisibility({ queueName: message.queueName, messageId: message.messageId, delaySeconds });
    return {
      status: "lease_backoff",
      messageId: message.messageId,
      operationKey: payload.operationKey,
      reason: claim.reason,
      delaySeconds,
    };
  }

  if (options.crashAfterClaimOperationKeys?.has(payload.operationKey)) {
    return {
      status: "simulated_crash",
      messageId: message.messageId,
      operationKey: payload.operationKey,
      leaseToken: claim.leaseToken,
    };
  }

  let businessEffectCommitted = false;
  try {
    await options.performShadowWork?.({ payload, message, leaseToken: claim.leaseToken });
    const commit = await store.commitShadowEffect({
      payload,
      queueName: message.queueName,
      queueMessageId: message.messageId,
      leaseToken: claim.leaseToken,
      expectedOwnershipGeneration: claim.thread.ownershipGeneration,
      expectedEpisodeRevision: claim.thread.episodeRevision,
      effectMetadata: { mode: "shadow" },
    });
    await store.releaseThreadLease({ tenantId: payload.tenantId, threadId: payload.threadId, leaseToken: claim.leaseToken });

    if (!commit.committed) {
      await store.setQueueMessageVisibility({ queueName: message.queueName, messageId: message.messageId, delaySeconds: 0 });
      return {
        status: "stale_rejected",
        messageId: message.messageId,
        operationKey: payload.operationKey,
        reason: commit.reason,
      };
    }

    businessEffectCommitted = true;
    await store.deleteQueueMessage({ queueName: message.queueName, messageId: message.messageId });
    return {
      status: commit.idempotent ? "duplicate_effect" : "processed",
      messageId: message.messageId,
      operationKey: payload.operationKey,
      effectId: commit.effectId,
    };
  } catch (error) {
    const classified = classifyExecutionError(error);
    await store.releaseThreadLease({ tenantId: payload.tenantId, threadId: payload.threadId, leaseToken: claim.leaseToken });
    if (!classified.retryable || shouldDeadLetterAttempt(message.readCount)) {
      return await deadLetterMessage({
        store,
        message,
        payload,
        errorClass: classified.errorClass,
        errorMessage: classified.message,
        requiredOperatorAction: classified.requiredOperatorAction,
        businessEffectCommitted,
      });
    }
    const nextAttempt = Math.min(message.readCount + 1, BRAIN_MAX_PROCESSING_ATTEMPTS);
    const delaySeconds = retryDelaySecondsForAttempt(nextAttempt, payload.operationKey);
    await store.setQueueMessageVisibility({ queueName: message.queueName, messageId: message.messageId, delaySeconds });
    return {
      status: "retry_scheduled",
      messageId: message.messageId,
      operationKey: payload.operationKey,
      reason: classified.errorClass,
      delaySeconds,
    };
  }
}

export async function runBrainShadowWorkerOnce(
  store: BrainExecutionStore,
  options: BrainShadowWorkerOptions = {}
): Promise<BrainExecutionWorkerResult> {
  const message = await store.readNextQueueMessage({
    queueName: BRAIN_TURN_PROCESSING_QUEUE,
    visibilityTimeoutSeconds: BRAIN_DETERMINISTIC_VISIBILITY_SECONDS,
  });
  if (!message) return { status: "idle" };
  return await processBrainExecutionMessage(store, message, options);
}
