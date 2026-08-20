select
  n.nspname                                            as schema_name,
  c.relname                                            as table_name,
  a.attname                                            as column_name,
  grantor.rolname                                      as grantor,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else coalesce(grantee.rolname, acl.grantee::text)
  end                                                  as grantee,
  acl.privilege_type                                   as privilege_type,
  acl.is_grantable                                     as is_grantable
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_attribute a
  on a.attrelid = c.oid
 and a.attnum > 0
 and not a.attisdropped
 and a.attacl is not null
cross join lateral pg_catalog.aclexplode(a.attacl) as acl
join pg_catalog.pg_roles grantor on grantor.oid = acl.grantor
left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
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
order by schema_name, table_name, column_name, grantee, privilege_type, grantor;
