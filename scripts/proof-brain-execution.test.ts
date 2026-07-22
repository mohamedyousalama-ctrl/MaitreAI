// ============================================================================
// WO-BRAIN-0B behavior proof.
//
// In-memory proof for the shadow-only BRAIN durable execution substrate. It does
// not require staging credentials, does not apply migrations, and does not touch
// the live WhatsApp webhook, live engine, orders, conversations, or WhatsApp.
//
// Run:
//   node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-brain-execution.test.ts
// ============================================================================

import {
  MemoryBrainExecutionStore,
  assertMetadataOnlyQueuePayload,
  makeChannelEventQueuePayload,
  poisonMessage,
  processBrainExecutionMessage,
  runBrainShadowWorkerOnce,
  type BrainExecutionQueuePayload,
} from "../lib/brain/execution/index.ts";

const tenantA = "00000000-0000-4000-8000-00000000000a";
const tenantB = "00000000-0000-4000-8000-00000000000b";
const threadA = "10000000-0000-4000-8000-00000000000a";
const threadB = "10000000-0000-4000-8000-00000000000b";
const eventA = "20000000-0000-4000-8000-00000000000a";
const eventB = "20000000-0000-4000-8000-00000000000b";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    return;
  }
  fail++;
  console.error("  x FAIL:", name, detail ?? "");
}

function payload(args: {
  tenantId?: string;
  threadId?: string;
  channelEventId?: string;
  sequence?: number;
} = {}): BrainExecutionQueuePayload {
  return makeChannelEventQueuePayload({
    tenantId: args.tenantId ?? tenantA,
    threadId: args.threadId ?? threadA,
    channelEventId: args.channelEventId ?? eventA,
    enqueuedAt: "2026-07-22T00:00:00.000Z",
    sequence: args.sequence,
  });
}

async function proofConcurrentLeaseClaim() {
  const store = new MemoryBrainExecutionStore();
  store.addThread({ tenantId: tenantA, threadId: threadA });

  const claims = await Promise.all([
    store.claimThreadLease({ tenantId: tenantA, threadId: threadA, leaseDurationMs: 60_000 }),
    store.claimThreadLease({ tenantId: tenantA, threadId: threadA, leaseDurationMs: 60_000 }),
  ]);

  check("two workers claim one thread -> exactly one proceeds", claims.filter((claim) => claim.claimed).length === 1, claims);
  check("losing worker backs off without state corruption", claims.some((claim) => !claim.claimed && claim.reason === "lease_held"), claims);
}

async function proofWorkerDeathRecovery() {
  const store = new MemoryBrainExecutionStore();
  store.addThread({ tenantId: tenantA, threadId: threadA });
  const p = payload();
  store.enqueue(p);

  const crash = await runBrainShadowWorkerOnce(store, { crashAfterClaimOperationKeys: new Set([p.operationKey]) });
  check("worker death simulated after claim", crash.status === "simulated_crash", crash);
  check("dead worker committed no effect", store.effects.length === 0, store.effects);

  store.advanceTime(61_000);
  const recovered = await runBrainShadowWorkerOnce(store);
  check("expired lease lets another worker reclaim", recovered.status === "processed", recovered);
  check("reclaimed message commits shadow effect exactly once", store.effects.length === 1, store.effects);
}

async function proofDuplicateDeliveryIdempotency() {
  const store = new MemoryBrainExecutionStore();
  store.addThread({ tenantId: tenantA, threadId: threadA });
  store.enqueue(payload());

  const message = await store.readNextQueueMessage({ queueName: "brain_turn_processing", visibilityTimeoutSeconds: 60 });
  if (!message) throw new Error("expected queue message");
  const first = await processBrainExecutionMessage(store, message);
  const second = await processBrainExecutionMessage(store, message);

  check("same queue message delivered twice -> first commits", first.status === "processed", first);
  check("same queue message delivered twice -> second is idempotent", second.status === "duplicate_effect", second);
  check("duplicate delivery creates one shadow business effect", store.effects.length === 1, store.effects);
}

async function proofStaleWorkerRejected() {
  const store = new MemoryBrainExecutionStore();
  store.addThread({ tenantId: tenantA, threadId: threadA, ownershipGeneration: 7, episodeRevision: 3 });
  const first = await store.claimThreadLease({ tenantId: tenantA, threadId: threadA, leaseDurationMs: 10_000 });
  if (!first.claimed) throw new Error("expected first claim");
  store.advanceTime(11_000);
  const second = await store.claimThreadLease({ tenantId: tenantA, threadId: threadA, leaseDurationMs: 10_000 });
  if (!second.claimed) throw new Error("expected reclaim");

  const staleCommit = await store.commitShadowEffect({
    payload: payload(),
    queueName: "brain_turn_processing",
    queueMessageId: "stale-proof",
    leaseToken: first.leaseToken,
    expectedOwnershipGeneration: first.thread.ownershipGeneration,
    expectedEpisodeRevision: first.thread.episodeRevision,
  });

  check("stale worker with old lease token is rejected", staleCommit.committed === false && staleCommit.reason === "stale_lease", staleCommit);
  check("stale worker rejection commits no shadow effect", store.effects.length === 0, store.effects);
}

async function proofPoisonDeadLetterDoesNotBlockThread() {
  const store = new MemoryBrainExecutionStore();
  store.addThread({ tenantId: tenantA, threadId: threadA });
  const poison = payload({ channelEventId: eventA });
  const healthy = payload({ channelEventId: eventB, sequence: 2 });
  store.enqueue(poison);
  store.enqueue(healthy);

  const poisonResults: string[] = [];
  const failPoison = {
    performShadowWork({ payload: current }: { payload: BrainExecutionQueuePayload }) {
      if (current.operationKey === poison.operationKey) throw poisonMessage("deterministic parser poison proof");
    },
  };

  poisonResults.push((await runBrainShadowWorkerOnce(store, failPoison)).status);
  const healthyResult = await runBrainShadowWorkerOnce(store, failPoison);
  check("poison retry delay lets other thread work continue", healthyResult.status === "processed", healthyResult);
  check("healthy work committed while poison is delayed", store.effects.some((effect) => effect.operationKey.endsWith(eventB)), store.effects);

  for (let i = 0; i < 5; i++) {
    store.advanceTime(1_000_000);
    poisonResults.push((await runBrainShadowWorkerOnce(store, failPoison)).status);
  }

  check("poison message retries before dead-letter", poisonResults.filter((status) => status === "retry_scheduled").length === 5, poisonResults);
  check("poison message dead-lettered after bounded attempts", poisonResults.at(-1) === "dead_lettered" && store.deadLetters.length === 1, {
    poisonResults,
    deadLetters: store.deadLetters,
  });
  check("poison did not duplicate other work", store.effects.filter((effect) => effect.operationKey.endsWith(eventB)).length === 1, store.effects);
}

async function proofBacklogShedsShadowFirst() {
  const store = new MemoryBrainExecutionStore();
  store.addThread({ tenantId: tenantA, threadId: threadA });
  const p = payload();
  for (let i = 0; i < 1002; i++) store.enqueue(p);

  const result = await runBrainShadowWorkerOnce(store);
  check("backlog above threshold sheds shadow processing first", result.status === "shed_shadow", result);
  check("shed shadow records durable throttle evidence", store.throttles.length === 1 && store.effects.length === 0, {
    throttles: store.throttles,
    effects: store.effects,
  });
}

function proofPayloadCannotCarryCustomerText() {
  const good = payload();
  assertMetadataOnlyQueuePayload(good);

  const bad = { ...good, customerText: "hello, I have a peanut allergy" };
  let rejected = false;
  try {
    assertMetadataOnlyQueuePayload(bad);
  } catch {
    rejected = true;
  }
  check("queue payload rejects customer text fields", rejected, bad);
}

async function proofCrossTenantWorkerCannotWrite() {
  const store = new MemoryBrainExecutionStore();
  store.addThread({ tenantId: tenantA, threadId: threadA });
  store.addThread({ tenantId: tenantB, threadId: threadB });
  store.enqueue(payload({ tenantId: tenantB, threadId: threadA, channelEventId: eventB }));

  const result = await runBrainShadowWorkerOnce(store);
  check("cross-tenant thread reference is rejected", result.status === "dead_lettered", result);
  check("cross-tenant worker writes no tenant B effect through tenant A thread id", store.effects.length === 0, store.effects);
  check("cross-tenant rejection is inspectable as dead-letter", store.deadLetters.length === 1, store.deadLetters);
}

async function main() {
  await proofConcurrentLeaseClaim();
  await proofWorkerDeathRecovery();
  await proofDuplicateDeliveryIdempotency();
  await proofStaleWorkerRejected();
  await proofPoisonDeadLetterDoesNotBlockThread();
  await proofBacklogShedsShadowFirst();
  proofPayloadCannotCarryCustomerText();
  await proofCrossTenantWorkerCannotWrite();

  console.log(`BRAIN EXECUTION PROOF: ${pass}/${pass + fail} passed`);
  if (fail > 0) process.exit(1);
}

await main();
