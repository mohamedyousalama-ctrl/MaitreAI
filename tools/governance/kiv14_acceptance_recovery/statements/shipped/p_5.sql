select
  (select r.oid from pg_catalog.pg_roles r where r.rolname = 'kivo_control_owner') is not null  as role_present,
  pg_catalog.to_regnamespace('auth')   is not null                                              as auth_schema_present,
  pg_catalog.has_schema_privilege(
    (select r.oid from pg_catalog.pg_roles r where r.rolname = 'kivo_control_owner'),
    pg_catalog.to_regnamespace('auth')::oid,   'USAGE')                                         as auth_usage,
  pg_catalog.has_schema_privilege(
    (select r.oid from pg_catalog.pg_roles r where r.rolname = 'kivo_control_owner'),
    pg_catalog.to_regnamespace('auth')::oid,   'CREATE')                                        as auth_create,
  pg_catalog.has_schema_privilege(
    (select r.oid from pg_catalog.pg_roles r where r.rolname = 'kivo_control_owner'),
    pg_catalog.to_regnamespace('public')::oid, 'CREATE')                                        as public_create;
