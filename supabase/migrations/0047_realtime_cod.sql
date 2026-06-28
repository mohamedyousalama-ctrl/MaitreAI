-- ============================================================================
-- 0047 — enable Realtime for the COD ledger tables (LIVE0 Phase L3)
--
-- Adds the two COD tables the ledger/close-shift screens depend on to the
-- supabase_realtime publication + REPLICA IDENTITY FULL, so a settle/collect/
-- capture by one manager reflects on every manager's COD screen live (the shared
-- COD store re-pulls /api/cod/ledger on change).
--
-- Scope = cod_collections + cod_settlements:
--   • cod_collections — every capture/collect/settle touches it (insert on
--     capture, update→settled on settle); it backs driverLedger / heldItems /
--     codDailySummary.
--   • cod_settlements — inserted on each settle; backs settlementHistory.
--   cod_cash_events (append-only audit) is INTENTIONALLY EXCLUDED: the ledger UI
--   never reads it, and the two tables above already fire on every ledger-visible
--   change. Keeping the audit log off realtime avoids needless channel churn.
--
-- SECURITY (financial tables — verified before this migration, Step 0):
--   • M1.7/0041 left each COD table with a member SELECT policy
--     (<table>_read USING is_member_of(restaurant_id)) and NO member write policy.
--   • Realtime postgres_changes RESPECTS that SELECT policy, so a member-client
--     subscription receives ONLY its own tenant's rows — same trust boundary as
--     the existing orders realtime. is_member_of is SECURITY DEFINER, so the RLS
--     check evaluates correctly under the authenticated role.
--   • This migration does NOT touch any RLS policy. The M1.7 write-lockdown
--     (writes stay service-role only) is UNCHANGED — we only make READS reactive.
--
-- Additive: publication membership + replica identity ONLY. No table/column/data
-- change, no RLS change. Mirrors 0006/0045/0046 (idempotent).
--
-- PREPARE-ONLY — review before prod apply. Validated via BEGIN…ROLLBACK.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['cod_collections','cod_settlements'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
    -- Full replica identity so Realtime can evaluate RLS (restaurant_id) on the
    -- changed row for authenticated postgres_changes subscriptions.
    execute format('alter table public.%I replica identity full;', t);
  end loop;
end $$;

-- Rollback (manual; not auto-run):
--   alter publication supabase_realtime drop table public.cod_collections;
--   alter publication supabase_realtime drop table public.cod_settlements;
--   alter table public.cod_collections replica identity default;
--   alter table public.cod_settlements replica identity default;
