select
  n.nspname                                            as schema_name,
  p.proname                                            as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_args,
  p.oid::pg_catalog.regprocedure::text                 as function_signature,
  grantor.rolname                                      as grantor,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else coalesce(grantee.rolname, acl.grantee::text)
  end                                                  as grantee,
  acl.privilege_type                                   as privilege_type,
  acl.is_grantable                                     as is_grantable
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
) as acl
join pg_catalog.pg_roles grantor on grantor.oid = acl.grantor
left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
where n.nspname = 'public'
  and (
    p.proname like 'kv_control_%'
    or p.proname like 'kv_sys_control_%'
    or p.proname like 'kv_tg_%'
  )
  and acl.privilege_type = 'EXECUTE'
order by function_signature, grantee, grantor, privilege_type;
