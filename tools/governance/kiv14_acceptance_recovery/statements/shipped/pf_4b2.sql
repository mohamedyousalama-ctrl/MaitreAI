select
  count(*)                                                  as membership_rows,
  count(*) filter (where m.set_option)                      as rows_with_set,
  count(*) filter (where m.inherit_option)                  as rows_with_inherit,
  count(*) filter (where not m.admin_option)                as rows_without_admin,
  count(*) filter (where not grantor_role.rolsuper)         as rows_with_nonsuperuser_grantor,
  count(*) filter (where member_role.rolname <> current_user) as rows_not_held_by_executor
from pg_catalog.pg_auth_members m
join pg_catalog.pg_roles member_role  on member_role.oid  = m.member
join pg_catalog.pg_roles target_role  on target_role.oid  = m.roleid
join pg_catalog.pg_roles grantor_role on grantor_role.oid = m.grantor
where target_role.rolname = 'kivo_control_owner';
