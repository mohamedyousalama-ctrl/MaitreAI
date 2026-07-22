import type { ISODateTime, UUID } from "../types";
import type {
  BrainExecutionAttemptKind,
  BrainExecutionOperationKey,
  BrainExecutionQueuePayload,
  BrainExecutionRequestedBy,
} from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION_KEY_RE = /^[a-z0-9:_-]{1,180}$/i;
const FORBIDDEN_KEY_RE = /(text|transcript|message_body|body|phone|secret|token_value|raw|payload|pii|customer_name|customer_phone|llm|diagnostic)/i;

const allowedKeys = new Set([
  "schemaVersion",
  "route",
  "tenantId",
  "threadId",
  "channelEventId",
  "inboxId",
  "turnEventId",
  "operationKey",
  "attemptKind",
  "requestedBy",
  "enqueuedAt",
  "sequence",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertUuid(name: string, value: unknown): asserts value is UUID {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`BRAIN queue payload ${name} must be a UUID reference`);
  }
}

function assertIsoDateTime(name: string, value: unknown): asserts value is ISODateTime {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`BRAIN queue payload ${name} must be an ISO timestamp`);
  }
}

function assertAttemptKind(value: unknown): asserts value is BrainExecutionAttemptKind {
  if (value !== "deterministic" && value !== "llm_bound") {
    throw new Error("BRAIN queue payload attemptKind is invalid");
  }
}

function assertRequestedBy(value: unknown): asserts value is BrainExecutionRequestedBy {
  if (value !== "brain_ingress_shadow" && value !== "operator_replay" && value !== "system_recovery") {
    throw new Error("BRAIN queue payload requestedBy is invalid");
  }
}

function assertOperationKey(value: unknown): asserts value is BrainExecutionOperationKey {
  if (typeof value !== "string" || !OPERATION_KEY_RE.test(value)) {
    throw new Error("BRAIN queue payload operationKey must be a bounded routing key");
  }
}

export function operationKey(value: string): BrainExecutionOperationKey {
  assertOperationKey(value);
  return value;
}

export function assertMetadataOnlyQueuePayload(payload: unknown): asserts payload is BrainExecutionQueuePayload {
  if (!isRecord(payload)) throw new Error("BRAIN queue payload must be an object");

  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) throw new Error(`BRAIN queue payload has unsupported key: ${key}`);
    if (FORBIDDEN_KEY_RE.test(key)) throw new Error(`BRAIN queue payload contains forbidden text/PII key: ${key}`);
  }

  if (payload.schemaVersion !== 1) throw new Error("BRAIN queue payload schemaVersion must be 1");
  if (payload.route !== "turn_processing") throw new Error("BRAIN queue payload route is invalid");
  assertUuid("tenantId", payload.tenantId);
  assertUuid("threadId", payload.threadId);
  if (payload.channelEventId !== undefined) assertUuid("channelEventId", payload.channelEventId);
  if (payload.inboxId !== undefined) assertUuid("inboxId", payload.inboxId);
  if (payload.turnEventId !== undefined) assertUuid("turnEventId", payload.turnEventId);
  assertOperationKey(payload.operationKey);
  assertAttemptKind(payload.attemptKind);
  assertRequestedBy(payload.requestedBy);
  assertIsoDateTime("enqueuedAt", payload.enqueuedAt);
  const sequence = payload.sequence;
  if (sequence !== undefined && (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 1)) {
    throw new Error("BRAIN queue payload sequence must be a positive integer");
  }
}

export function makeChannelEventQueuePayload(args: {
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly channelEventId: UUID;
  readonly enqueuedAt: ISODateTime;
  readonly sequence?: number;
  readonly requestedBy?: BrainExecutionRequestedBy;
  readonly attemptKind?: BrainExecutionAttemptKind;
}): BrainExecutionQueuePayload {
  const payload: BrainExecutionQueuePayload = {
    schemaVersion: 1,
    route: "turn_processing",
    tenantId: args.tenantId,
    threadId: args.threadId,
    channelEventId: args.channelEventId,
    operationKey: operationKey(`shadow:channel_event:${args.channelEventId}`),
    attemptKind: args.attemptKind ?? "deterministic",
    requestedBy: args.requestedBy ?? "brain_ingress_shadow",
    enqueuedAt: args.enqueuedAt,
    ...(args.sequence ? { sequence: args.sequence } : {}),
  };
  assertMetadataOnlyQueuePayload(payload);
  return payload;
}
