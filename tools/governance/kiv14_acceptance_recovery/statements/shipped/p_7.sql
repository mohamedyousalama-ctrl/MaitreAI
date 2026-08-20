select
  (select count(*) from public.members)                                          as members_n,
  (select count(*) from public.member_identity_versions)                         as miv_rows,
  (select count(*) from public.member_identity_versions where valid_to is null)   as miv_open_rows,
  (select count(*) from public.member_identity_versions where version <> 1)       as miv_non_v1_rows;
