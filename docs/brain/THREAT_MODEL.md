# BRAIN Threat Model

This model covers G0 foundations for KTDK. The live engine is out of scope.

| vector | failure mode | control |
|---|---|---|
| Prompt injection | Customer asks the model to reveal policy, ignore safety rules, invent prices, change tenant, or commit an order directly. | Treat LLM output as `UntrustedUserAct`; validate into `ValidatedUserActBatch`; only deterministic code may mutate state, money, safety, or outbound structure. |
| Cross-tenant ID forgery | Button payload, URL, LLM output, or customer text includes a thread, episode, order, quote, or customer id from another tenant. | Tenant is resolved from verified WhatsApp number config only; every BRAIN table has `tenant_id`; BRAIN-to-BRAIN references use composite tenant foreign keys; RLS member policies deny cross-tenant reads. |
| Duplicate webhooks | Meta retries the same inbound message or a network retry resubmits the same payload. | `channel_inbox` has a per-tenant/channel/message unique key; turn assembly is idempotent; commit uses quote and episode revision guards. |
| Out-of-order webhooks | Later customer turns arrive before earlier ones, or a delayed old webhook arrives after a response. | Durable inbox with received timestamps and state; per-thread serial processing; episode revision and prompt token generation checks. |
| Rapid-fire races | Multiple customer messages land while a turn is in progress and create duplicate responses or conflicting cart deltas. | Per-thread serial executor; active episode partial unique index; turn events with sequence/revision; outbox idempotency keys. |
| Stale button/action tokens | Customer taps an old confirm, amend, address, or menu token after the episode changed. | Pending prompt token hash, expiry, and ownership generation; episode revision revalidation before commit. |
| ASR mishearing safety terms | Voice input mishears allergy, ingredient, or symptom words and proceeds normally. | Low-confidence voice plus possible safety terms forces deterministic safety handling, clarification, and human escalation when needed. |
| Service-role RLS bypass | Ordinary BRAIN execution accidentally uses a service-role client and bypasses tenant policies. | Tenant role matrix forbids service role in ordinary BRAIN paths; static scan and code review gate; service role reserved for controlled migrations, admin setup, and PM-run tests. |
| Internal diagnostics leakage | Trace, prompt, policy, tool, or validator text becomes part of customer output. | Branded response text types; customer renderer allow-list; `InternalDiagnostic` never flows to `CustomerResponse`. |
| Money drift | LLM computes totals, stale catalog data survives confirmation, or price changes between quote and commit. | Integer-minor-unit math only; immutable `order_quote`; confirm-to-commit revalidates quote, catalog, availability, expiry, and episode revision. |
| Safety propagation loss | Allergy or health disclosure is acknowledged in chat but absent from the kitchen ticket. | Structured `safety_disclosures`; committer requires kitchen note propagation before order commit. |
| Human takeover race | Human takes control while an AI response is queued. | Ownership generation fencing; outbox dispatch checks current owner/generation immediately before send. |
