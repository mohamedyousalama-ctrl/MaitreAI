select
  count(*)                                    as uid_rows,
  min(p.prosrc)                               as prosrc,
  min(pg_catalog.md5(p.prosrc))               as prosrc_md5,
  min(pg_catalog.pg_get_functiondef(p.oid))   as functiondef,
  min(pg_catalog.pg_get_function_arguments(p.oid)) as arg_list
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'auth' and p.proname = 'uid';
