select
  current_user                                                                                            as executor,
  pg_catalog.current_setting('row_security')                                                              as row_security_setting,
  pg_catalog.to_regclass('public.members')                                  is not null                   as members_present,
  pg_catalog.has_table_privilege(pg_catalog.to_regclass('public.members'),'SELECT')                        as members_select,
  pg_catalog.row_security_active(pg_catalog.to_regclass('public.members'))                                 as members_rls_active,
  pg_catalog.to_regclass('public.member_identity_versions')                 is not null                   as miv_present,
  pg_catalog.has_table_privilege(pg_catalog.to_regclass('public.member_identity_versions'),'SELECT')       as miv_select,
  pg_catalog.row_security_active(pg_catalog.to_regclass('public.member_identity_versions'))                as miv_rls_active,
  pg_catalog.to_regclass('public.conversation_assignment_events')           is not null                   as cae_present,
  pg_catalog.has_table_privilege(pg_catalog.to_regclass('public.conversation_assignment_events'),'SELECT') as cae_select,
  pg_catalog.row_security_active(pg_catalog.to_regclass('public.conversation_assignment_events'))          as cae_rls_active;
