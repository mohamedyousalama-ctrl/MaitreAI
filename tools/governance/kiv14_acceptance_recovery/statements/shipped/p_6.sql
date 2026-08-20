select
  (select count(*) from pg_catalog.pg_attribute a
    where a.attrelid = pg_catalog.to_regclass('public.conversation_assignment_events')
      and a.attnum > 0 and not a.attisdropped
      and a.attname in ('transition_id','operation_id','actor_kind','is_canonical',
                        'actor_member_version','actor_user_id','actor_label','actor_role')) as a1_columns,
  (select count(*) from public.conversation_assignment_events
    where transition_id is not null or operation_id is not null
       or actor_kind is not null or is_canonical is not null
       or actor_member_version is not null or actor_user_id is not null
       or actor_label is not null or actor_role is not null)                                 as a1_nonnull_rows;
