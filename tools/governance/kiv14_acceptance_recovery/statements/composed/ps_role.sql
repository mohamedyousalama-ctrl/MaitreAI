select
  r.rolname,
  r.rolsuper,
  r.rolinherit,
  r.rolcreaterole,
  r.rolcreatedb,
  r.rolcanlogin,
  r.rolreplication,
  r.rolbypassrls
from pg_catalog.pg_roles r
where r.rolname in (
  'postgres',
  'service_role',
  'authenticated',
  'anon',
  'kivo_control_owner'
)
order by r.rolname;
