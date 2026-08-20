select
  n.nspname                                            as schema_name,
  c.relname                                            as table_name,
  pg_catalog.pg_get_userbyid(c.relowner)               as owner,
  c.relrowsecurity                                     as relrowsecurity,
  c.relforcerowsecurity                                as relforcerowsecurity
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
    'members',
    'member_identity_versions',
    'control_operations',
    'conversation_audit_failures',
    'conversations',
    'messages',
    'customers',
    'restaurants',
    'conversation_assignment_events'
  )
order by schema_name, table_name;
