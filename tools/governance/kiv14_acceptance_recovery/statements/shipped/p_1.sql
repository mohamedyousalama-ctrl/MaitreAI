select
  count(*)                                                   as table_rows,
  count(*) filter (where pg_catalog.pg_get_userbyid(c.relowner) = 'kivo_control_owner') as owned_ok,
  count(*) filter (where c.relrowsecurity)                    as rls_on,
  count(*) filter (where c.relforcerowsecurity)               as force_rls_on
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('member_identity_versions','control_operations','conversation_audit_failures');
