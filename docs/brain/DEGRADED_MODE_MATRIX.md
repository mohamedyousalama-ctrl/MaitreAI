# BRAIN Degraded Mode Matrix

The BRAIN degrades honestly. It may continue deterministic work when safe, but it must not invent catalog facts, accept orders without durable state, or hide safety uncertainty.

## Principles

- Known deterministic flows continue without the LLM only when all required truth is already published, current, and validated.
- Ambiguous free text is clarified or handed off.
- Any safety uncertainty routes to human or safety hold.
- If the database is unavailable, the BRAIN never accepts, prices, confirms, or invents an order.
- If WhatsApp outbound is unavailable, the outbox is retained and operators are alerted.
- If backlog exceeds threshold, shed optional work and disable shadow processing first.
- The system must prefer a short honest status over a confident but unsupported answer.

## Matrix

| failure | continue safely | required degraded behavior | prohibited behavior | recovery signal |
|---|---|---|---|---|
| LLM provider outage | Deterministic button/token flows, duplicate detection, known quote confirmation, order status from trusted state. | Disable LLM-dependent free-text interpretation; ask deterministic clarification when possible; route ambiguous text to human. | Do not ask another model to guess safety, price, or catalog facts without validation. | Provider health restored and queued LLM-required work below backlog threshold. |
| ASR outage | Text, buttons, and already-transcribed inbound messages. | Tell customer voice is unavailable only if channel policy allows; ask for text; route repeated voice-only attempts to human. | Do not infer order or safety terms from missing audio. | ASR health restored and audio queue drained. |
| Queue backlog | Ingress recording, duplicate suppression, urgent safety signals, human takeover, committed transactional outbox. | Shed shadow runs, analytics, non-urgent summaries, and optional memory writes first; increase handoff for ambiguous orders. | Do not continue accepting unlimited new active work when oldest message age breaches threshold. | Queue length and oldest age below tenant and global thresholds for a sustained interval. |
| Database unavailable | None for new order mutation. Static status page or operator alert only. | Stop accepting new order commitments; avoid ACKing work as processed; retain raw provider retries where possible; alert operators. | Do not quote, commit, mark tokens consumed, or claim order accepted from memory. | Database read/write health restored and reconciliation job verifies no unprocessed inbox gap. |
| Meta/WhatsApp API unavailable | Internal state mutation only when customer communication is not required for the business effect. | Retain outbox rows; retry according to provider policy; alert operators when transactional messages cannot send. | Do not mark messages sent without provider confirmation. Do not create duplicate outbox rows for the same effect. | Provider send succeeds or PM/operator marks alternate-channel resolution. |
| Catalog unavailable | Existing immutable quote may be displayed only if still valid and catalog snapshot is sufficient. | Disable new quotes and safety/catalog answers; route catalog-dependent questions to human. | Do not use stale cache to answer allergen, ingredient, price, modifier, or availability questions unless it is a validated quote snapshot for the same episode. | Catalog read path healthy and publication snapshot version verified. |
| Excessive tenant traffic | Priority deterministic flows, abuse checks, human takeover. | Apply tenant-level rate limits; shed optional work; throttle non-urgent processing; alert tenant operators. | Do not let one tenant starve global safety or transactional queues. | Tenant queue and message rates return below policy limits. |
| Repeated poison message | Duplicate suppression and incident evidence. | Stop retrying after bounded attempts; dead-letter with tenant/thread evidence; route thread to human if customer impact remains. | Do not retry forever or keep charging LLM/cost budgets for deterministic failures. | Operator classifies, fixes parser/catalog/data issue, or explicitly archives. |
| Cost-budget exhaustion | Deterministic flows, human takeover, already-quoted confirmation if safe. | Disable LLM and nonessential ASR/shadow work for affected scope; route ambiguous text to human; alert owner. | Do not bypass budget by using untracked provider calls. | Budget reset, owner override, or lower-cost mode approved. |
| Operator console unavailable | AI may continue only while it owns thread and no safety/human hold is required. | Stop initiating new human-required flows if no operator path exists; send channel-valid status when appropriate; alert on-call. | Do not claim human handoff is available when operators cannot see/respond. | Console health restored and held threads visible to staff. |

## Flood Controls

Tenant-level controls:

- Maximum inbound messages per tenant per minute.
- Maximum active queued events per tenant.
- Maximum queued age before optional work is shed.
- Maximum LLM calls per tenant per interval.
- Maximum ASR minutes per tenant per interval.
- Maximum concurrent active episodes per tenant.
- Abuse alert when tenant traffic deviates from baseline.

Phone-level controls:

- Maximum messages per customer phone per interval.
- Maximum audio duration and file size.
- Maximum text length.
- Maximum media count per interval.
- Maximum retries per inbound provider message.
- Maximum active queued events per phone.
- Cooldown or human review for repeated prompt injection, harassment, or poison inputs.

When flood controls trigger, the BRAIN records the throttle decision in durable evidence. It may send a short channel-valid throttling response only if policy allows; otherwise it silently retains or rejects according to provider and abuse policy.

## Backlog Priority Order

When capacity is constrained, process in this order:

1. Human takeover and ownership fencing.
2. Safety scanner positives and safety holds.
3. Ingress duplicate detection and durable ACK bookkeeping.
4. Transactional outbox for committed orders.
5. Active customer turns with deterministic paths.
6. LLM-required ambiguous turns.
7. Non-urgent memory writes.
8. Analytics and reporting.
9. Shadow processing.

Shadow processing is disabled first and restored last.
