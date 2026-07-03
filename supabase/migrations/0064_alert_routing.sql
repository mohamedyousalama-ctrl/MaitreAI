-- ============================================================================
-- MaitreAI — R4: alert routing preferences (audited settings write)
--
-- WHERE operational alerts (safety holds, send failures, payment mismatches) are
-- delivered. This is PURELY a routing preference — it never suppresses the
-- system_alerts RECORD (that is always written); it only decides which
-- notification channels fire. Written by the manager-only, audited
-- POST /api/settings/alerts route; validated in lib/settings/alerts.ts.
--
-- Shape: { "channels": { "banner": bool, "whatsapp": bool, "email": bool },
--          "whatsappNumber": "+E164" }.
--
-- Additive + nullable-with-default: no backfill needed, no behavior change for
-- existing tenants (empty {} = fall back to today's default routing).
--
-- Migration number 0064 assumes merge order #281=0062, R6=0063 (state at branch
-- time); renumber at merge if the landed order differs.
-- ============================================================================

alter table public.restaurants
  add column if not exists alert_routing jsonb not null default '{}'::jsonb;
