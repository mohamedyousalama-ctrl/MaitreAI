select
  count(*)                                          as role_rows,
  bool_and(not r.rolsuper)                          as ok_not_super,
  bool_and(not r.rolcanlogin)                       as ok_no_login,
  bool_and(not r.rolbypassrls)                      as ok_no_bypassrls,
  bool_and(not r.rolcreatedb)                       as ok_no_createdb,
  bool_and(not r.rolcreaterole)                     as ok_no_createrole,
  bool_and(not r.rolinherit)                        as ok_no_inherit,
  bool_and(not r.rolreplication)                    as ok_no_replication
from pg_catalog.pg_roles r
where r.rolname = 'kivo_control_owner';
