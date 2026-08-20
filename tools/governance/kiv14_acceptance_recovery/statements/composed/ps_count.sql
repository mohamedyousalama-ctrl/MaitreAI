select
  (select count(*) from public.members) as members_n,
  (select count(*) from public.conversations) as conversations_n,
  (select count(*) from public.conversation_assignment_events) as cae_n,
  (
    select pg_catalog.md5(
      pg_catalog.string_agg(m.id::text, ',' order by m.id::text)
    )
    from public.members m
  ) as members_id_fingerprint;
