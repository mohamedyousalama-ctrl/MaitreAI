import { randomUUID } from "crypto";
import type { BrainOwner, ISODateTime, UUID } from "../types";
import { assertMetadataOnlyQueuePayload } from "./payload";
import { BRAIN_TURN_PROCESSING_QUEUE } from "./policy";
import type {
  BrainExecutionBacklogStats,
  BrainExecutionDeadLetterInput,
  BrainExecutionEffectInput,
  BrainExecutionQueueMessage,
  BrainExecutionQueueName,
  BrainExecutionQueuePayload,
  BrainExecutionStore,
  BrainExecutionThrottleInput,
  BrainLeaseClaimResult,
  BrainShadowCommitResult,
  BrainThreadExecutionState,
} from "./types";

interface MemoryQueueRow {
  readonly queueName: BrainExecutionQueueName;
  readonly messageId: string;
  readonly payload: BrainExecutionQueuePayload;
  readonly enqueuedAtMs: number;
  readCount: number;
  visibleAtMs: number;
  archived: boolean;
  deleted: boolean;
}

interface MemoryEffectRecord {
  readonly effectId: UUID;
  readonly tenantId: UUID;
  readonly threadId: UUID;
  readonly operationKey: string;
  readonly queueMessageId: string;
  readonly committedAtMs: number;
}

function nowIso(ms: number): ISODateTime {
  return new Date(ms).toISOString();
}

function threadKey(tenantId: UUID, threadId: UUID): string {
  return `${tenantId}:${threadId}`;
}

function operationKey(tenantId: UUID, operation: string): string {
  return `${tenantId}:${operation}`;
}

function cloneThread(thread: BrainThreadExecutionState): BrainThreadExecutionState {
  return { ...thread };
}

export class MemoryBrainExecutionStore implements BrainExecutionStore {
  nowMs: number;
  readonly threads = new Map<string, BrainThreadExecutionState>();
  readonly queue: MemoryQueueRow[] = [];
  readonly effects: MemoryEffectRecord[] = [];
  readonly deadLetters: BrainExecutionDeadLetterInput[] = [];
  readonly throttles: BrainExecutionThrottleInput[] = [];

  constructor(nowMs = Date.parse("2026-07-22T00:00:00.000Z")) {
    this.nowMs = nowMs;
  }

  advanceTime(ms: number) {
    this.nowMs += ms;
  }

  addThread(args: {
    readonly tenantId: UUID;
    readonly threadId: UUID;
    readonly owner?: BrainOwner;
    readonly ownershipGeneration?: number;
    readonly episodeRevision?: number | null;
    readonly nextExpectedSequence?: number;
    readonly state?: "open" | "closed";
  }) {
    this.threads.set(threadKey(args.tenantId, args.threadId), {
      tenantId: args.tenantId,
      threadId: args.threadId,
      owner: args.owner ?? "AI",
      ownershipGeneration: args.ownershipGeneration ?? 0,
      episodeRevision: args.episodeRevision ?? 0,
      processingToken: null,
      processingLeaseUntilMs: null,
      nextExpectedSequence: args.nextExpectedSequence ?? 1,
    });
  }

  getThread(tenantId: UUID, threadId: UUID): BrainThreadExecutionState | null {
    return this.threads.get(threadKey(tenantId, threadId)) ?? null;
  }

  setThread(args: {
    readonly tenantId: UUID;
    readonly threadId: UUID;
    readonly patch: Partial<BrainThreadExecutionState>;
  }) {
    const key = threadKey(args.tenantId, args.threadId);
    const existing = this.threads.get(key);
    if (!existing) throw new Error("thread not found");
    this.threads.set(key, { ...existing, ...args.patch });
  }

  enqueue(payload: BrainExecutionQueuePayload, queueName: BrainExecutionQueueName = BRAIN_TURN_PROCESSING_QUEUE): BrainExecutionQueueMessage {
    assertMetadataOnlyQueuePayload(payload);
    const row: MemoryQueueRow = {
      queueName,
      messageId: String(this.queue.length + 1),
      payload,
      enqueuedAtMs: this.nowMs,
      readCount: 0,
      visibleAtMs: this.nowMs,
      archived: false,
      deleted: false,
    };
    this.queue.push(row);
    return this.messageFromRow(row);
  }

  async getBacklogStats(queueName: BrainExecutionQueueName): Promise<BrainExecutionBacklogStats> {
    const activeRows = this.queue.filter((row) => row.queueName === queueName && !row.deleted && !row.archived);
    const oldest = activeRows.reduce<number | null>((min, row) => (min === null ? row.enqueuedAtMs : Math.min(min, row.enqueuedAtMs)), null);
    return {
      queueLength: activeRows.length,
      oldestMessageAgeSeconds: oldest === null ? 0 : Math.max(0, Math.floor((this.nowMs - oldest) / 1000)),
    };
  }

  async readNextQueueMessage(args: {
    readonly queueName: BrainExecutionQueueName;
    readonly visibilityTimeoutSeconds: number;
  }): Promise<BrainExecutionQueueMessage | null> {
    const row = this.queue.find(
      (candidate) =>
        candidate.queueName === args.queueName &&
        !candidate.deleted &&
        !candidate.archived &&
        candidate.visibleAtMs <= this.nowMs
    );
    if (!row) return null;
    row.readCount++;
    row.visibleAtMs = this.nowMs + args.visibilityTimeoutSeconds * 1000;
    return this.messageFromRow(row);
  }

  async setQueueMessageVisibility(args: {
    readonly queueName: BrainExecutionQueueName;
    readonly messageId: string;
    readonly delaySeconds: number;
  }): Promise<void> {
    const row = this.mustQueueRow(args.queueName, args.messageId);
    row.visibleAtMs = this.nowMs + args.delaySeconds * 1000;
  }

  async deleteQueueMessage(args: { readonly queueName: BrainExecutionQueueName; readonly messageId: string }): Promise<void> {
    this.mustQueueRow(args.queueName, args.messageId).deleted = true;
  }

  async archiveQueueMessage(args: { readonly queueName: BrainExecutionQueueName; readonly messageId: string }): Promise<void> {
    this.mustQueueRow(args.queueName, args.messageId).archived = true;
  }

  async claimThreadLease(args: {
    readonly tenantId: UUID;
    readonly threadId: UUID;
    readonly leaseDurationMs: number;
  }): Promise<BrainLeaseClaimResult> {
    const key = threadKey(args.tenantId, args.threadId);
    const thread = this.threads.get(key);
    if (!thread) return { claimed: false, reason: "thread_not_found" };
    if (thread.processingToken && thread.processingLeaseUntilMs && thread.processingLeaseUntilMs > this.nowMs) {
      return {
        claimed: false,
        reason: "lease_held",
        retryAfterSeconds: Math.max(1, Math.ceil((thread.processingLeaseUntilMs - this.nowMs) / 1000)),
      };
    }

    const leaseToken = randomUUID();
    const leaseUntilMs = this.nowMs + args.leaseDurationMs;
    const claimedThread: BrainThreadExecutionState = {
      ...thread,
      processingToken: leaseToken,
      processingLeaseUntilMs: leaseUntilMs,
    };
    this.threads.set(key, claimedThread);
    return {
      claimed: true,
      leaseToken,
      leaseUntilMs,
      thread: cloneThread(claimedThread),
    };
  }

  async renewThreadLease(args: {
    readonly tenantId: UUID;
    readonly threadId: UUID;
    readonly leaseToken: UUID;
    readonly leaseDurationMs: number;
  }): Promise<boolean> {
    const key = threadKey(args.tenantId, args.threadId);
    const thread = this.threads.get(key);
    if (!thread || thread.processingToken !== args.leaseToken) return false;
    this.threads.set(key, {
      ...thread,
      processingLeaseUntilMs: this.nowMs + args.leaseDurationMs,
    });
    return true;
  }

  async releaseThreadLease(args: { readonly tenantId: UUID; readonly threadId: UUID; readonly leaseToken: UUID }): Promise<boolean> {
    const key = threadKey(args.tenantId, args.threadId);
    const thread = this.threads.get(key);
    if (!thread || thread.processingToken !== args.leaseToken) return false;
    this.threads.set(key, {
      ...thread,
      processingToken: null,
      processingLeaseUntilMs: null,
    });
    return true;
  }

  async commitShadowEffect(args: BrainExecutionEffectInput): Promise<BrainShadowCommitResult> {
    const thread = this.threads.get(threadKey(args.payload.tenantId, args.payload.threadId));
    if (!thread) return { committed: false, reason: "thread_not_found" };
    if (thread.tenantId !== args.payload.tenantId) return { committed: false, reason: "tenant_mismatch" };
    if (thread.processingToken !== args.leaseToken) return { committed: false, reason: "stale_lease" };
    if (thread.ownershipGeneration !== args.expectedOwnershipGeneration) {
      return { committed: false, reason: "ownership_generation_changed" };
    }
    if (thread.episodeRevision !== args.expectedEpisodeRevision) {
      return { committed: false, reason: "episode_revision_changed" };
    }

    const existing = this.effects.find((effect) => effect.operationKey === operationKey(args.payload.tenantId, args.payload.operationKey));
    if (existing) return { committed: true, idempotent: true, effectId: existing.effectId };

    const effect: MemoryEffectRecord = {
      effectId: randomUUID(),
      tenantId: args.payload.tenantId,
      threadId: args.payload.threadId,
      operationKey: operationKey(args.payload.tenantId, args.payload.operationKey),
      queueMessageId: args.queueMessageId,
      committedAtMs: this.nowMs,
    };
    this.effects.push(effect);
    return { committed: true, idempotent: false, effectId: effect.effectId };
  }

  async recordDeadLetter(input: BrainExecutionDeadLetterInput): Promise<void> {
    this.deadLetters.push(input);
  }

  async recordThrottle(input: BrainExecutionThrottleInput): Promise<void> {
    this.throttles.push(input);
  }

  private messageFromRow(row: MemoryQueueRow): BrainExecutionQueueMessage {
    return {
      queueName: row.queueName,
      messageId: row.messageId,
      readCount: row.readCount,
      payload: row.payload,
      enqueuedAt: nowIso(row.enqueuedAtMs),
    };
  }

  private mustQueueRow(queueName: BrainExecutionQueueName, messageId: string): MemoryQueueRow {
    const row = this.queue.find((candidate) => candidate.queueName === queueName && candidate.messageId === messageId);
    if (!row) throw new Error(`queue message not found: ${queueName}/${messageId}`);
    return row;
  }
}
