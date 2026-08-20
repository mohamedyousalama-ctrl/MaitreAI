select
  member_role.rolname as member_role,
  target_role.rolname as granted_role,
  grantor_role.rolname as grantor_role,
  m.admin_option,
  m.inherit_option,
  m.set_option
from pg_auth_members m
join pg_roles member_role on member_role.oid = m.member
join pg_roles target_role on target_role.oid = m.roleid
join pg_roles grantor_role on grantor_role.oid = m.grantor
where target_role.rolname = 'kivo_control_owner'
   or member_role.rolname = 'kivo_control_owner'
order by member_role.rolname, target_role.rolname, grantor_role.rolname;
