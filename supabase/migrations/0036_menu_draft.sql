-- ============================================================================
-- MaitreAI — Menu ingestion: draft table + atomic publish function
--
-- Adds a menu_drafts table to hold validated-but-not-yet-live menu payloads.
-- The agent (loadBrain) reads the live menu tables (menu_categories, menu_items,
-- etc.) exactly as before — zero change to the read path.
--
-- Lifecycle:
--   POST /api/onboarding/menu/ingest  → validates payload, writes menu_drafts
--                                        row with status='draft'
--   POST /api/onboarding/menu/publish → calls publish_menu_draft() which
--                                        atomically replaces the live menu
--   GET  /api/onboarding/menu/draft   → returns latest draft for review
--
-- publish_menu_draft() is SECURITY DEFINER so the API (admin client) can call
-- it without needing per-table permissions on the live tables beyond what the
-- admin key already grants. The function validates ownership before touching
-- any rows.
-- ============================================================================

-- Draft storage ---------------------------------------------------------------
create table if not exists public.menu_drafts (
  id              uuid        primary key default gen_random_uuid(),
  restaurant_id   uuid        not null references public.restaurants(id) on delete cascade,
  status          text        not null default 'draft'
                              check (status in ('draft', 'published', 'superseded')),
  payload         jsonb       not null,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  published_at    timestamptz
);
create index if not exists menu_drafts_restaurant_idx on public.menu_drafts(restaurant_id);
create index if not exists menu_drafts_status_idx     on public.menu_drafts(restaurant_id, status);

-- RLS: members can read their restaurant's drafts; managers can write.
alter table public.menu_drafts enable row level security;
drop policy if exists menu_drafts_read  on public.menu_drafts;
drop policy if exists menu_drafts_write on public.menu_drafts;
create policy menu_drafts_read  on public.menu_drafts
  for select using (public.is_member_of(restaurant_id));
create policy menu_drafts_write on public.menu_drafts
  for all using (public.is_manager_of(restaurant_id))
  with check (public.is_manager_of(restaurant_id));

-- Atomic publish function -----------------------------------------------------
-- Replaces the entire live menu for a restaurant from a validated draft payload
-- in a single transaction. Called by the publish route via admin client .rpc().
--
-- Payload shape (JSON):
--   {
--     "categories": [
--       {
--         "name": "المقبلات",  -- required, non-empty
--         "sort": 0,
--         "items": [
--           {
--             "name": "حمص",           -- required
--             "name_en": "Hummus",     -- optional
--             "description": "...",
--             "price": 25.00,          -- required, >= 0
--             "available": true,
--             "ingredients": ["حمص"],
--             "allergens": ["sesame"],
--             "modifier_names": ["بدون بصل"],  -- references modifiers[].name
--             "variants": [
--               { "name": "عادي", "price": 25.00, "sort": 0 }
--             ],
--             "choice_groups": [
--               {
--                 "name": "المذاق",
--                 "min_select": 1, "max_select": 1, "sort": 0,
--                 "options": [
--                   { "label": "حار", "price_delta": 0, "sort": 0 }
--                 ]
--               }
--             ]
--           }
--         ]
--       }
--     ],
--     "modifiers": [
--       { "name": "بدون بصل", "price_impact": 0, "category": "dietary" }
--     ]
--   }

create or replace function public.publish_menu_draft(
  p_restaurant_id uuid,
  p_draft_id      uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_payload       jsonb;
  v_mod_map       jsonb := '{}'::jsonb;
  v_cat           jsonb;
  v_item          jsonb;
  v_variant       jsonb;
  v_group         jsonb;
  v_option        jsonb;
  v_modifier      jsonb;
  v_mod_name      text;
  v_cat_id        uuid;
  v_item_id       uuid;
  v_group_id      uuid;
  v_mod_id        uuid;
begin
  -- 1. Lock and fetch draft — validates ownership + status atomically.
  select payload into v_payload
  from public.menu_drafts
  where id = p_draft_id
    and restaurant_id = p_restaurant_id
    and status = 'draft'
  for update;

  if v_payload is null then
    raise exception '[menu] draft % not found or already published for restaurant %',
      p_draft_id, p_restaurant_id;
  end if;

  -- 2. Atomic menu replacement — order matters (FK children before parents).
  delete from public.menu_item_modifiers   where restaurant_id = p_restaurant_id;
  delete from public.menu_item_choice_options where restaurant_id = p_restaurant_id;
  delete from public.menu_item_choice_groups  where restaurant_id = p_restaurant_id;
  delete from public.menu_item_variants       where restaurant_id = p_restaurant_id;
  delete from public.menu_items               where restaurant_id = p_restaurant_id;
  delete from public.menu_categories          where restaurant_id = p_restaurant_id;
  delete from public.modifiers                where restaurant_id = p_restaurant_id;

  -- 3. Insert modifiers; build name→id map for item linking.
  for v_modifier in
    select value from jsonb_array_elements(coalesce(v_payload->'modifiers', '[]'::jsonb))
  loop
    insert into public.modifiers (restaurant_id, name, price_impact, category, active)
    values (
      p_restaurant_id,
      v_modifier->>'name',
      coalesce((v_modifier->>'price_impact')::numeric, 0),
      coalesce(v_modifier->>'category', ''),
      true
    )
    returning id into v_mod_id;

    v_mod_map := v_mod_map || jsonb_build_object(v_modifier->>'name', v_mod_id::text);
  end loop;

  -- 4. Insert categories → items → variants / choice groups / modifier links.
  for v_cat in
    select value from jsonb_array_elements(coalesce(v_payload->'categories', '[]'::jsonb))
  loop
    insert into public.menu_categories (restaurant_id, name, sort)
    values (
      p_restaurant_id,
      v_cat->>'name',
      coalesce((v_cat->>'sort')::int, 0)
    )
    returning id into v_cat_id;

    for v_item in
      select value from jsonb_array_elements(coalesce(v_cat->'items', '[]'::jsonb))
    loop
      insert into public.menu_items (
        restaurant_id, category_id,
        name, name_en, description,
        price, available,
        ingredients, allergens
      )
      values (
        p_restaurant_id,
        v_cat_id,
        v_item->>'name',
        v_item->>'name_en',
        coalesce(v_item->>'description', ''),
        (v_item->>'price')::numeric,
        coalesce((v_item->>'available')::boolean, true),
        coalesce(
          array(select jsonb_array_elements_text(v_item->'ingredients')),
          '{}'::text[]
        ),
        coalesce(
          array(select jsonb_array_elements_text(v_item->'allergens')),
          '{}'::text[]
        )
      )
      returning id into v_item_id;

      -- Variants
      for v_variant in
        select value from jsonb_array_elements(coalesce(v_item->'variants', '[]'::jsonb))
      loop
        insert into public.menu_item_variants (restaurant_id, item_id, name, price, sort, active)
        values (
          p_restaurant_id,
          v_item_id,
          v_variant->>'name',
          (v_variant->>'price')::numeric,
          coalesce((v_variant->>'sort')::int, 0),
          true
        );
      end loop;

      -- Choice groups + options
      for v_group in
        select value from jsonb_array_elements(coalesce(v_item->'choice_groups', '[]'::jsonb))
      loop
        insert into public.menu_item_choice_groups (
          restaurant_id, item_id, name, min_select, max_select, sort
        )
        values (
          p_restaurant_id,
          v_item_id,
          v_group->>'name',
          coalesce((v_group->>'min_select')::int, 1),
          coalesce((v_group->>'max_select')::int, 1),
          coalesce((v_group->>'sort')::int, 0)
        )
        returning id into v_group_id;

        for v_option in
          select value from jsonb_array_elements(coalesce(v_group->'options', '[]'::jsonb))
        loop
          insert into public.menu_item_choice_options (
            restaurant_id, group_id, label, price_delta, sort, active
          )
          values (
            p_restaurant_id,
            v_group_id,
            v_option->>'label',
            coalesce((v_option->>'price_delta')::numeric, 0),
            coalesce((v_option->>'sort')::int, 0),
            true
          );
        end loop;
      end loop;

      -- Modifier links (by name, via map built above)
      for v_mod_name in
        select jsonb_array_elements_text(coalesce(v_item->'modifier_names', '[]'::jsonb))
      loop
        if v_mod_map ? v_mod_name then
          insert into public.menu_item_modifiers (restaurant_id, item_id, modifier_id)
          values (p_restaurant_id, v_item_id, (v_mod_map->>v_mod_name)::uuid)
          on conflict do nothing;
        end if;
      end loop;

    end loop; -- items
  end loop;   -- categories

  -- 5. Mark draft published; supersede any prior published draft.
  update public.menu_drafts
  set status = 'superseded'
  where restaurant_id = p_restaurant_id
    and status = 'published'
    and id <> p_draft_id;

  update public.menu_drafts
  set status = 'published', published_at = now()
  where id = p_draft_id;

end;
$$;

-- Grant execute to service-role (called via admin client only; RLS on the
-- underlying tables still protects cross-tenant reads).
revoke all on function public.publish_menu_draft(uuid, uuid) from public;
grant execute on function public.publish_menu_draft(uuid, uuid) to service_role;
