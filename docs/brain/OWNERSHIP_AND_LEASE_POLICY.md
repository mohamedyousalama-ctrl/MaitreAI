# BRAIN Ownership And Lease Policy

This policy defines ownership, leases, operator contention, and stale-send fencing for BRAIN work. It is written to align with the already-applied `0099_conversation_control_plane.sql` migration.

## Sources Of Truth

The applied `0099` control plane extends the existing `public.conversations` table with:

- `control_epoch`, bumped on ownership transitions.
- A widened `ownership_state` check containing `AI_ACTIVE`, `HOLD_UNCLAIMED`, `HUMAN_ACTIVE`, `HUMAN_IDLE`, `AI_RESUME_PENDING`, `SYSTEM_HOLD`, and `CLOSED`.
- `conversation_assignment_events`, the append-only assignment audit stream.
- Triggered epoch bumping and assignment-event logging.
- Control RPCs for claim, reassignment, escalation, transition, and release to AI.

The applied `0100` BRAIN foundation creates `public.conversation_threads` with `owner` and `ownership_generation`. During transition, the live `public.conversations` control plane is authoritative for live channel ownership. `conversation_threads` is the BRAIN thread model and must mirror or reference the authoritative control-plane state until a separately approved cutover makes it canonical.

There must be one source of truth for who may write a customer-facing response:

- During transition: `public.conversations.ownership_state`, `owner`, `assigned_member_id`, and `control_epoch` are authoritative.
- In BRAIN tables: `conversation_threads.owner` and `ownership_generation` are a tenant-scoped projection used by BRAIN execution.
- At enqueue and send time: a BRAIN outbox message must fence against the authoritative generation. During transition, `control_epoch` is the live generation source; `ownership_generation` must not be allowed to drift into a conflicting authority.

## Thread Versus Episode Ownership

Ownership lives at thread level.

Thread-level ownership:

- `owner`: `AI` or `HUMAN`.
- `ownership_generation`: monotonic fencing value derived from the authoritative control plane.
- Human claim: active assigned human writer, claim timestamp, lease expiry timestamp, and claim reason where available.
- Manual pause: thread-level pause that prevents AI sends until explicit release.

Episode-level state is not ownership authority. Episodes hold:

- `assigned_engine_version`.
- `safety_hold`.
- `payment_hold`.
- `phase`.
- Episode lifecycle and episode revision.

Episode state may block a commit or require human handling, but it must not create a second owner. If episode and thread data disagree, the thread-level control plane wins and the disagreement is an incident.

## Lease Expiry

Lease expiry does not auto-return control to AI.

When a human claim times out, the allowed conceptual transition is:

`HUMAN_ACTIVE` -> `HUMAN_CLAIM_STALE` -> explicit handback or separately approved policy -> `AI_ACTIVE`

`HUMAN_CLAIM_STALE` is a lease posture, not a persisted `ownership_state` in the applied `0099` schema. Because `0099` does not include that value in its check constraint, future code must represent staleness through lease metadata, a read-model, or a separately reviewed migration. It must not write `HUMAN_CLAIM_STALE` into `public.conversations.ownership_state` unless a future migration adds that state.

Rules:

- Stale means the active human claim exceeded its lease or heartbeat threshold.
- Stale does not mean AI may send.
- Stale does not clear `assigned_member_id`.
- Stale does not clear safety hold, payment hold, manual pause, or escalation context.
- Return to AI requires explicit operator handback through the approved control-plane function or a separately approved automated policy.
- If no operator is available, the thread remains human-owned or held and the system may send only an approved handoff/status template that does not continue the AI conversation.

## Multi-Operator Rules

The pilot restaurant may have several operators online. Exactly one actor is the active writer for a human-owned thread.

| case | rule |
|---|---|
| First claim | Conditional claim succeeds only if current state and assignee allow it. Losers get view-only state. |
| Concurrent claims | Database conditional update serializes claims; exactly one active writer wins. |
| Non-owner operator view | May read the thread and assignment events according to tenant role policy, but may not send customer-facing messages as the active responder. |
| Supervisor override | A supervisor may override claim ownership through a recorded `MANAGER_TAKEOVER` or reassignment event. The event records actor, prior assignee, new assignee, reason, and generation. |
| Claim transfer | Transfer requires current active writer or supervisor authority. It records assignment event and bumps generation. |
| Human reply | Every manual outbound response is recorded in the same ordered event stream as AI messages, with actor id, ownership generation, channel policy evidence, and provider result. |
| Human idle | `HUMAN_IDLE` means human authority remains; AI does not resume unless explicit handback reaches `AI_ACTIVE`. |

Operators who are not the active writer may prepare internal notes, but those notes are not customer-visible and cannot be sent through the outbound gateway as customer messages.

## Ownership Generation Fencing

Ownership generation prevents stale AI sends after takeover.

At enqueue:

- Read authoritative owner and generation.
- If owner is not AI, do not enqueue AI customer-facing content.
- Store the captured generation on the outbox row.
- Store the intended send policy, usually `CANCEL_IF_OWNER_CHANGED` for AI-authored content.

Immediately before send:

- Re-read authoritative owner and generation.
- Re-read thread manual pause and hold status.
- Re-read prompt token status if the message contains an action affordance.
- Cancel the outbox row if owner or generation changed.
- Cancel the outbox row if current owner is human, stale-human, hold, manual pause, or closed.

The same check applies to template conversion. A stale AI free-form message may not be converted into a template after takeover; it must be cancelled because the owner changed.

## Manual Outbound Evidence

Manual outbound responses must enter the same ordered event history as AI messages:

- Human draft authorization.
- Active writer id.
- Thread id and tenant id.
- Current ownership generation.
- Response text or structured outbound shape.
- Channel policy decision at authorization.
- Channel policy decision at send.
- Provider result or cancellation reason.

This gives incident review one ordered timeline for inbound customer messages, AI events, human assignment events, manual messages, AI outbox messages, safety holds, and commits.

## Stop-Ship Signals

- Two active human writers can send to the same customer thread.
- AI sends after any human takeover or manual pause.
- Lease expiry automatically clears human ownership.
- `conversation_threads.ownership_generation` differs from the authoritative control epoch for a live thread without a documented projection update.
- Manual outbound response bypasses the event stream or outbound gateway.
- Future code writes an ownership state not allowed by the applied `0099` check constraint.
