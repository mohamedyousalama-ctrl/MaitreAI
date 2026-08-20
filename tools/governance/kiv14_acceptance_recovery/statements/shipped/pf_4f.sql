select
  p.oid::regprocedure                as function_signature,
  pg_catalog.pg_get_userbyid(p.proowner) as current_owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'kv_control_%'
    or p.proname like 'kv_sys_control_%'
    or p.proname like 'kv_tg_%')
order by 1;
