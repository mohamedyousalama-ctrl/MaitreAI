# BRAIN Incident Classes

Any incident below is stop-ship for BRAIN rollout until explicitly closed.

| class | stop-ship condition |
|---|---|
| Safety authorization | Customer output authorizes allergy/health safety or uses forbidden reassurance for a disclosed safety concern. |
| Safety propagation loss | A disclosed allergy/health risk fails to appear in structured safety evidence or kitchen ticket. |
| Money integrity | Committed total, line item, fee, tax, discount, or currency differs from the trusted quote. |
| Duplicate committed order | One episode, webhook retry, or confirm replay produces more than one committed order. |
| Cross-tenant access | Any tenant can read, write, reference, or infer another tenant's BRAIN state. |
| Service-role runtime bypass | Ordinary BRAIN execution path uses service-role access. |
| Human takeover breach | AI sends or commits after a human has taken ownership. |
| Internal text leakage | Prompt, diagnostics, trace, validator details, or policy text reaches customer output. |
| Memory privacy breach | V1 stores inferred memory or keeps explicit sensitive memory beyond consent/retention limits. |
| Inbox/outbox idempotency failure | Duplicate or out-of-order delivery mutates state twice or emits duplicate customer messages. |

## Automatic Traffic-Stop And Fail-Safe Handoff

When a stop-ship incident is suspected:

1. Stop new-episode assignment to the BRAIN for affected tenant(s), channel(s), or globally, depending on blast radius.
2. Put affected active episodes into human control.
3. Never transfer an in-progress BRAIN episode back to the legacy engine.
4. Preserve inbox, turn events, quotes, outbox, safety disclosures, and run traces.
5. Suppress unsent AI outbox messages whose ownership generation is stale or under investigation.
6. Keep fulfilled operational commitments visible to staff; do not silently erase evidence.
7. Require explicit incident closure before resuming BRAIN traffic.

## Kill-Switch Authority

- The founder may stop any BRAIN traffic by word.
- Engineering may stop traffic for safety, money, tenant, reliability, or privacy risk without waiting for product approval.
- Operations may request tenant-scoped stop for live customer risk.
- Weakening a safety, money, or tenant invariant requires a written amendment even from the founder.
- Restart requires documented incident class, affected scope, preserved evidence, fix/proof link, and owner sign-off.
