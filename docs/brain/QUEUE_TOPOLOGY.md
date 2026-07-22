# BRAIN Queue Topology

WO-BRAIN-0B uses Supabase Queues / PGMQ as the durable execution substrate from
`ADR-0001-durable-execution.md`. Queue delivery schedules work; committed
database rows remain the system of record for business effects.

## Queues

| queue | type | purpose | payload contents |
|---|---|---|---|
| `brain_turn_processing` | PGMQ logged durable queue | Schedules shadow turn-processing work from normalized `channel_events`. Workers claim a per-thread lease before doing any work. | Reference ids and routing metadata only: tenant, thread, channel event or inbox or turn id, operation key, attempt kind, enqueue time, requested-by marker, sequence. |
| `brain_turn_dead_letter` | PGMQ logged durable queue | Durable archive/replay lane for poison messages after bounded retries or non-retryable validation failures. | Same reference-only payload plus error class, attempt count, and required operator action. |

## Payload Rules

Queue payloads must never carry customer transcripts, message body text, phone
numbers, customer names, secrets, raw webhook payloads, LLM text, or policy
diagnostics. Payloads carry only ids and routing metadata. The TypeScript
`BrainExecutionQueuePayload` type has no free-form text or metadata field, and
runtime validation rejects unknown keys and text-like or PII-like keys.

## Processing Order

1. Worker reads one PGMQ message with a visibility timeout: 60 seconds for
   deterministic work, 180 seconds for LLM-bound stages.
2. Worker claims `conversation_threads.processing_token` in a short database
   operation. If another worker holds an unexpired lease, this worker backs off.
3. Worker closes the claim operation before doing parsing, model-bound, or
   provider-bound work.
4. Worker reopens a short commit operation, re-verifies tenant id, lease token,
   ownership generation, episode revision, and operation idempotency key, then
   records the shadow result or rejects the attempt as stale.
5. Worker deletes or archives the queue message only after the durable state
   transition has been recorded.

## Degraded Mode

Shadow processing is optional work. If backlog length or oldest message age
crosses policy thresholds, shadow work is shed before production work. Flood
controls are recorded in `brain_execution_throttle_events`; dead-lettered items
are inspectable through `brain_list_execution_dead_letters`.

## Stop Mechanism

WO-BRAIN-0B does not add a scheduler. The shadow driver is explicitly invoked.
Stopping it is killing the invoked process or not setting the opt-in runtime
flag. There is no live-webhook coupling and no customer-facing side effect.
