-- ============================================================================
-- MaitreAI — 0101: WO-BRAIN-G0 FK tightening (PREPARE-ONLY).
--
-- Corrective DDL for the already-applied 0100 BRAIN foundation schema.
-- Do NOT edit 0100 in place; PM applies this migration after review.
--
-- Fixes:
--   1. Any BRAIN table that carries both thread_id and episode_id now proves the
--      episode belongs to that same (tenant_id, thread_id).
--   2. order_episodes.current_quote_id remains denormalized for efficient reads,
--      but now proves the quote belongs to the same episode.
--      Other quote pointers are tightened to the same episode for the same
--      reason.
--   3. committed_order_id pointers are tightened to same-tenant public.orders.
--      public.orders has no BRAIN episode id yet, so tenant equality is the
--      strongest invariant this foundation schema can enforce today.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_episodes_tenant_thread_id_key'
      and conrelid = 'public.order_episodes'::regclass
  ) then
    alter table public.order_episodes
      add constraint order_episodes_tenant_thread_id_key
      unique (tenant_id, thread_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outbox_messages_quote_episode_required_check'
      and conrelid = 'public.outbox_messages'::regclass
  ) then
    alter table public.outbox_messages
      add constraint outbox_messages_quote_episode_required_check
      check (quote_id is null or episode_id is not null);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_quotes_tenant_episode_id_key'
      and conrelid = 'public.order_quotes'::regclass
  ) then
    alter table public.order_quotes
      add constraint order_quotes_tenant_episode_id_key
      unique (tenant_id, episode_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_restaurant_id_id_key'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_restaurant_id_id_key
      unique (restaurant_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_memories_source_episode_thread_required_check'
      and conrelid = 'public.customer_memories'::regclass
  ) then
    alter table public.customer_memories
      add constraint customer_memories_source_episode_thread_required_check
      check (source_episode_id is null or thread_id is not null);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'brain_runs_episode_thread_required_check'
      and conrelid = 'public.brain_runs'::regclass
  ) then
    alter table public.brain_runs
      add constraint brain_runs_episode_thread_required_check
      check (episode_id is null or thread_id is not null);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'episode_turn_events_episode_thread_fk'
      and conrelid = 'public.episode_turn_events'::regclass
  ) then
    alter table public.episode_turn_events
      add constraint episode_turn_events_episode_thread_fk
      foreign key (tenant_id, thread_id, episode_id)
      references public.order_episodes(tenant_id, thread_id, id)
      on delete cascade;
  end if;

  alter table public.episode_turn_events
    drop constraint if exists episode_turn_events_episode_fk;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pending_prompts_episode_thread_fk'
      and conrelid = 'public.pending_prompts'::regclass
  ) then
    alter table public.pending_prompts
      add constraint pending_prompts_episode_thread_fk
      foreign key (tenant_id, thread_id, episode_id)
      references public.order_episodes(tenant_id, thread_id, id)
      on delete cascade;
  end if;

  alter table public.pending_prompts
    drop constraint if exists pending_prompts_episode_fk;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'safety_disclosures_episode_thread_fk'
      and conrelid = 'public.safety_disclosures'::regclass
  ) then
    alter table public.safety_disclosures
      add constraint safety_disclosures_episode_thread_fk
      foreign key (tenant_id, thread_id, episode_id)
      references public.order_episodes(tenant_id, thread_id, id)
      on delete cascade;
  end if;

  alter table public.safety_disclosures
    drop constraint if exists safety_disclosures_episode_fk;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outbox_messages_episode_thread_fk'
      and conrelid = 'public.outbox_messages'::regclass
  ) then
    alter table public.outbox_messages
      add constraint outbox_messages_episode_thread_fk
      foreign key (tenant_id, thread_id, episode_id)
      references public.order_episodes(tenant_id, thread_id, id);
  end if;

  alter table public.outbox_messages
    drop constraint if exists outbox_messages_episode_fk;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_memories_episode_thread_fk'
      and conrelid = 'public.customer_memories'::regclass
  ) then
    alter table public.customer_memories
      add constraint customer_memories_episode_thread_fk
      foreign key (tenant_id, thread_id, source_episode_id)
      references public.order_episodes(tenant_id, thread_id, id);
  end if;

  alter table public.customer_memories
    drop constraint if exists customer_memories_episode_fk;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'brain_runs_episode_thread_fk'
      and conrelid = 'public.brain_runs'::regclass
  ) then
    alter table public.brain_runs
      add constraint brain_runs_episode_thread_fk
      foreign key (tenant_id, thread_id, episode_id)
      references public.order_episodes(tenant_id, thread_id, id);
  end if;

  alter table public.brain_runs
    drop constraint if exists brain_runs_episode_fk;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_quotes_superseded_episode_fk'
      and conrelid = 'public.order_quotes'::regclass
  ) then
    alter table public.order_quotes
      add constraint order_quotes_superseded_episode_fk
      foreign key (tenant_id, episode_id, superseded_by_quote_id)
      references public.order_quotes(tenant_id, episode_id, id);
  end if;

  alter table public.order_quotes
    drop constraint if exists order_quotes_superseded_fk;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outbox_messages_quote_episode_fk'
      and conrelid = 'public.outbox_messages'::regclass
  ) then
    alter table public.outbox_messages
      add constraint outbox_messages_quote_episode_fk
      foreign key (tenant_id, episode_id, quote_id)
      references public.order_quotes(tenant_id, episode_id, id);
  end if;

  alter table public.outbox_messages
    drop constraint if exists outbox_messages_quote_fk;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_episodes_current_quote_episode_fk'
      and conrelid = 'public.order_episodes'::regclass
  ) then
    alter table public.order_episodes
      add constraint order_episodes_current_quote_episode_fk
      foreign key (tenant_id, id, current_quote_id)
      references public.order_quotes(tenant_id, episode_id, id);
  end if;

  alter table public.order_episodes
    drop constraint if exists order_episodes_current_quote_fk;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_episodes_committed_order_tenant_fk'
      and conrelid = 'public.order_episodes'::regclass
  ) then
    alter table public.order_episodes
      add constraint order_episodes_committed_order_tenant_fk
      foreign key (tenant_id, committed_order_id)
      references public.orders(restaurant_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_quotes_committed_order_tenant_fk'
      and conrelid = 'public.order_quotes'::regclass
  ) then
    alter table public.order_quotes
      add constraint order_quotes_committed_order_tenant_fk
      foreign key (tenant_id, committed_order_id)
      references public.orders(restaurant_id, id);
  end if;
end $$;

notify pgrst, 'reload schema';
