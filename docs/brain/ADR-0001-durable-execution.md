# ADR-0001: Durable Execution Substrate

## Status

Accepted for BRAIN governance. Implementation remains future work.

## Context

BRAIN turn processing is asynchronous: ingress must acknowledge quickly, while turn assembly, safety scanning, catalog validation, quoting, and dispatch may require retryable background work. "An async worker runs the pipeline" is not precise enough. Engineers need one substrate, one retry model, and one durability model.

The applied `0100` schema already creates durable inbox, turn, run, quote, and outbox tables. The execution substrate must integrate with that Postgres truth without adding a second durable datastore unless there is a clear need.

Supabase Queues documentation: https://supabase.com/docs/guides/queues and PGMQ extension documentation: https://supabase.com/docs/guides/queues/pgmq.

## Decision

Use Supabase Queues / PGMQ as the BRAIN asynchronous turn-processing substrate.

Reason:

- It is Postgres-native and keeps queue state near tenant, inbox, episode, quote, and outbox truth.
- It adds no new external datastore for the first BRAIN rollout.
- It provides durable queue tables, visibility timeout semantics, read counts, delayed messages, and archive/delete operations.
- It fits the existing migration and PM-apply governance lane.

The canonical queue is a logged durable queue, not an unlogged queue. Queue messages carry only ids and routing metadata, never full customer transcripts or secrets:

- `tenant_id`
- `thread_id`
- `inbox_id` or `turn_event_id`
- `operation_key`
- `attempt_kind`
- `enqueued_at`
- `requested_by`

The database tables remain the system of record. Queue delivery is a scheduling mechanism, not proof that a business effect happened.

## Delivery Guarantees Are Not Effect Guarantees

PGMQ can make a message invisible to other consumers for a visibility timeout after a worker reads it, and a message can become visible again if not deleted or archived. That is a delivery guarantee shape, not an exactly-once business-effect guarantee.

Every business mutation still requires deterministic idempotency keys:

- Ingress insert keyed by tenant, channel, and channel message id.
- Turn assembly keyed by tenant, thread, source inbox, and turn index.
- Quote creation keyed by tenant, episode, quote revision, and episode revision.
- Commit keyed by tenant, episode, confirmed quote, and operation key.
- Outbox authorization keyed by tenant and idempotency key.
- Interactive token consumption keyed by token hash and single transaction.

Retries may run the same logical operation more than once. Idempotency keys ensure retries converge instead of duplicating cart changes, commits, or sends.

## Visibility Timeout

Default visibility timeout: 60 seconds for deterministic work and 180 seconds for LLM-bound work.

Rules:

- A worker must set or extend visibility only while it is actively processing.
- Long work is broken into stages so a worker does not hold a message invisible while waiting on a database transaction.
- Visibility timeout expiry means another worker may reclaim the queue message. It does not mean the prior worker's partial attempt is trusted.
- Every stage re-reads current tenant, thread, episode, ownership generation, and operation state before mutation.

## Retry Policy

Retries use bounded exponential backoff with jitter:

| attempt | delay |
|---|---|
| 1 | immediate |
| 2 | 10 seconds |
| 3 | 30 seconds |
| 4 | 2 minutes |
| 5 | 5 minutes |
| 6 | 15 minutes |

After the sixth failed processing attempt, the message is moved to dead-letter handling unless the failure class is explicitly marked transient by an operator.

Retryable:

- Provider timeout.
- Temporary queue read failure.
- Temporary Meta unavailable.
- LLM provider outage for non-safety-critical free text.
- Serializable transaction conflict.

Not retryable without intervention:

- Tenant mismatch.
- Invalid catalog publication state.
- Invalid quote or episode revision.
- Expired or replayed action token.
- Safety uncertainty requiring human.
- Poison message that repeats the same deterministic validation failure.

## Dead-Letter Handling

Dead-letter handling records:

- Original queue message id.
- Tenant, thread, inbox or turn id.
- Operation key.
- Last error class and message.
- Attempt count.
- First and last failure timestamp.
- Whether any business effect was committed.
- Required operator action.

Dead-letter messages are archived for audit and replay only after a PM or operator chooses a replay path. Replay must create a new operation key or explicitly reuse the old idempotency key depending on the intended effect. Silent replay is forbidden.

## Worker Death Recovery

If a worker dies:

1. The visibility timeout expires.
2. Another worker reads the message.
3. The new worker re-reads durable tables before doing anything.
4. Idempotency keys, episode revision, ownership generation, and outbox status decide whether work is still needed.
5. Duplicate attempts produce no duplicate business effects.

No worker may keep authoritative state only in memory. Progress belongs in Postgres tables.

## Database Transaction Rule

LLM work must never run inside an open database transaction.

Allowed sequence:

1. Read durable state.
2. Close transaction.
3. Call LLM or provider if needed.
4. Validate returned structure.
5. Open a short transaction for deterministic mutation.
6. Commit or roll back.

This prevents long transaction locks, inconsistent retries, and side effects that cannot be rolled back.

## Alternatives Considered

| alternative | upside | rejected because |
|---|---|---|
| Vercel background work | Simple for short follow-up tasks; close to existing deployment. | Not a shared durable queue contract; weak worker-death and replay semantics for transactional turn processing. |
| Vercel Workflow | More structured orchestration than ad hoc background work. | Adds platform-specific orchestration before the BRAIN has proven queue needs; still requires separate idempotency and DB truth. |
| Dedicated queue service | Strong queue features, independent scaling, mature dead-letter tooling. | Adds a new datastore and operational surface for the first rollout; increases tenant/security and replay complexity. |
| Postgres polling table hand-rolled in app | No new extension required. | Reimplements visibility timeout, metrics, archiving, and retry semantics that PGMQ already supplies. |

## Consequences

- Future BRAIN-0B work must implement queue creation, worker leases, retries, and dead-letter handling through Supabase Queues / PGMQ.
- Queue payloads contain references, not full business state.
- All mutations still run through Postgres transactions and idempotency keys.
- Shadow processing is optional work and is shed first under backlog or cost pressure.
- A queue message is considered complete only after the corresponding durable state transition has committed and the queue row has been deleted or archived.
