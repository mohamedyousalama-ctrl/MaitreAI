select
  count(*)                                                        as fn_rows,
  min(pg_catalog.pg_get_userbyid(p.proowner))                     as fn_owner,
  bool_and(p.prosecdef)                                           as is_security_definer,
  min(coalesce(p.proconfig::text, '<null>'))                      as proconfig,
  bool_and(p.proretset)                                           as returns_setof,
  min(pg_catalog.pg_get_function_result(p.oid))                   as result_shape,
  min(pg_catalog.pg_get_function_arguments(p.oid))                as arg_list,
  min(coalesce(p.proacl::text, '<null>'))                         as acl,
  min(pg_catalog.md5(p.prosrc))                                   as body_md5,
  bool_and(pg_catalog.strpos(p.prosrc, 'auth.uid()') > 0)         as still_unrepaired
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'kv_control_assert_actor'
  and pg_catalog.pg_get_function_arguments(p.oid) = 'p_restaurant_id uuid, p_actor_kind text, p_require_manager boolean';
