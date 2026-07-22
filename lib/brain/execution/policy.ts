import type { BrainExecutionAttemptKind, BrainExecutionBacklogStats, BrainExecutionQueueName } from "./types";

export const BRAIN_TURN_PROCESSING_QUEUE: BrainExecutionQueueName = "brain_turn_processing";
export const BRAIN_TURN_DEAD_LETTER_QUEUE: BrainExecutionQueueName = "brain_turn_dead_letter";

export const BRAIN_DETERMINISTIC_VISIBILITY_SECONDS = 60;
export const BRAIN_LLM_BOUND_VISIBILITY_SECONDS = 180;
export const BRAIN_MAX_PROCESSING_ATTEMPTS = 6;

export const BRAIN_SHADOW_BACKLOG_LENGTH_THRESHOLD = 1000;
export const BRAIN_SHADOW_OLDEST_AGE_SECONDS_THRESHOLD = 300;

const retryBaseDelaySeconds = [0, 10, 30, 120, 300, 900] as const;

function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

export function visibilityTimeoutSeconds(attemptKind: BrainExecutionAttemptKind): number {
  return attemptKind === "llm_bound" ? BRAIN_LLM_BOUND_VISIBILITY_SECONDS : BRAIN_DETERMINISTIC_VISIBILITY_SECONDS;
}

export function retryDelaySecondsForAttempt(nextAttempt: number, operationKey: string): number {
  const base = retryBaseDelaySeconds[Math.min(Math.max(nextAttempt, 1), retryBaseDelaySeconds.length) - 1];
  if (base === 0) return 0;
  const jitter = stableHash(`${operationKey}:${nextAttempt}`) % Math.max(1, Math.ceil(base / 10));
  return base + jitter;
}

export function shouldDeadLetterAttempt(attemptCount: number): boolean {
  return attemptCount >= BRAIN_MAX_PROCESSING_ATTEMPTS;
}

export function shouldShedShadowProcessing(stats: BrainExecutionBacklogStats): { shed: boolean; reason?: "queue_backlog" | "oldest_message_age" } {
  if (stats.queueLength > BRAIN_SHADOW_BACKLOG_LENGTH_THRESHOLD) return { shed: true, reason: "queue_backlog" };
  if (stats.oldestMessageAgeSeconds > BRAIN_SHADOW_OLDEST_AGE_SECONDS_THRESHOLD) {
    return { shed: true, reason: "oldest_message_age" };
  }
  return { shed: false };
}

export class BrainExecutionProcessingError extends Error {
  readonly errorClass: string;
  readonly retryable: boolean;
  readonly requiredOperatorAction: string;

  constructor(message: string, args: { errorClass: string; retryable: boolean; requiredOperatorAction: string }) {
    super(message);
    this.name = "BrainExecutionProcessingError";
    this.errorClass = args.errorClass;
    this.retryable = args.retryable;
    this.requiredOperatorAction = args.requiredOperatorAction;
  }
}

export function poisonMessage(message: string, errorClass = "POISON_MESSAGE"): BrainExecutionProcessingError {
  return new BrainExecutionProcessingError(message, {
    errorClass,
    retryable: true,
    requiredOperatorAction: "Inspect payload references and classify for replay or archive.",
  });
}

export function nonRetryableExecutionError(message: string, errorClass: string): BrainExecutionProcessingError {
  return new BrainExecutionProcessingError(message, {
    errorClass,
    retryable: false,
    requiredOperatorAction: "Operator review required before replay.",
  });
}

export function classifyExecutionError(error: unknown): BrainExecutionProcessingError {
  if (error instanceof BrainExecutionProcessingError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new BrainExecutionProcessingError(message, {
    errorClass: "TRANSIENT_EXECUTION_ERROR",
    retryable: true,
    requiredOperatorAction: "Retry automatically; inspect only if attempts exhaust.",
  });
}
