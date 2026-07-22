# BRAIN Tenant And Role Matrix

| path | DB identity | allowed operation | tenant source | service-role allowed? |
|---|---|---|---|---|
| Webhook ingress acknowledgement | Ordinary server runtime with member-equivalent tenant policy or dedicated non-bypass role in later WOs | Insert durable inbox row and ACK quickly | Verified WhatsApp number configuration | No |
| Per-thread turn assembly | Ordinary BRAIN runtime role | Read inbox/thread/episode rows for one tenant and thread | Existing inbox row tenant | No |
| Sensor and understanding compilation | Ordinary BRAIN runtime role | Read tenant catalog/evidence and write validated turn evidence | Existing thread/episode tenant | No |
| Semantic validator and domain snapshot | Ordinary BRAIN runtime role | Validate against tenant-scoped catalog, safety, quote, and episode state | Existing episode tenant | No |
| Pure decision kernel | No DB writes during pure decision | Produce deterministic `DecisionProposal` from validated inputs | Already-bound tenant context | No |
| Transactional committer | Ordinary BRAIN runtime role with explicit non-bypass write policies in later WOs | Commit turn events, quotes, outbox, safety records, and final order side effects | Existing episode tenant and transaction guards | No |
| Outbox dispatcher | Ordinary BRAIN runtime role | Send queued message only after owner/generation and tenant checks | Existing outbox tenant | No |
| PM migration/application | Migration owner / admin | Apply reviewed migrations | PM-controlled project context | Yes, controlled ceremony only |
| PM adversarial RLS test setup | Service role for fixture setup and cleanup; authenticated JWTs for attack attempts | Create fixture rows, then test RLS behavior as members | Explicit staging tenant IDs | Yes, setup only |

## Rules

- No service-role client may appear in ordinary BRAIN execution paths.
- Tenant id is bound from verified WhatsApp number config only.
- Customer text, LLM output, button payload, query parameter, or untrusted webhook metadata may never select tenant id.
- BRAIN tables carry `tenant_id` directly.
- References between BRAIN tables use composite tenant foreign keys so an id from tenant B cannot be attached to a row from tenant A.
- RLS policies use `public.is_member_of(tenant_id)` for member reads and deny ordinary cross-tenant access.
