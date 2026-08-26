-- 0112 — ledger reconciliation for migration 0108
-- APPLIED to production 2026-08-26 via Supabase apply_migration.
--
-- 0108_kiv13_m1_additive_scope1.sql is FULLY APPLIED to this database. Verified
-- present 2026-08-26: 21 functions (kv_control_*, kv_sys_control_*, kv_tg_*), the
-- kv_control_result composite type, the control_operations and
-- member_identity_versions tables, and the kivo_control_owner role.
--
-- It carried NO row in supabase_migrations.schema_migrations, while its sibling
-- 0107 does. The consequence is that the ledger claimed the control plane was
-- never replaced, when in fact 0108 removed the entire control_* family that 0099
-- created — which is why application code kept calling functions that no longer
-- existed, and why the console claim path returned 502 (fixed in 3993845).
--
-- 0108's source lives in pull request #571, still OPEN. The migration is live in
-- production while its text is absent from the default branch. This row records
-- the applied state; getting the SQL into the repository requires merging #571.

insert into supabase_migrations.schema_migrations (version, name, created_by)
values ('20260813113225', '0108_kiv13_m1_additive_scope1', 'reconciliation: applied out-of-band, source in open PR #571')
on conflict (version) do nothing;
