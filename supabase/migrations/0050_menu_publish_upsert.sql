-- ============================================================================
-- 0050 — publish_menu_draft(): UPSERT-by-name instead of delete+recreate (S4)
--
-- PROBLEM (the re-publish footgun): the 0036 version DELETEs the whole live menu
-- and re-INSERTs from the draft. Every item gets a NEW uuid and `available` resets
-- to the draft default — so ANY re-publish after go-live silently un-86's sold-out
-- items, and the menu_items→menu_availability_events FK (ON DELETE CASCADE) wipes
-- the 86 audit trail. (Finalized orders are SAFE: orders.items is a jsonb snapshot
-- with no FK to menu_items — verified — so changing ids never dangles order history.)
--
-- FIX: reconcile by the only stable key that exists — NAME (no slug/external_ref on
-- draft or live). Categories and items are matched (restaurant_id, name) and UPDATED
-- in place (preserving id); brand-new ones are inserted; ones absent from the new
-- draft are deleted. For a matched (surviving) item we PRESERVE its current live
-- `available` — a manager's sold-out flag is operational state and must NOT be wiped
-- by a content update; only name_en/description/price/ingredients/allergens/category
-- change. A genuinely-new item gets the draft's available (default true). Children
-- (variants, choice groups/options, modifier links, modifiers) carry no preserved
-- state, so they are still fully rebuilt — but pointed at the PRESERVED item ids, so
-- menu_availability_events and open cart references to surviving items stay valid.
--
-- ASSUMPTION: item names are unique per restaurant, and category names per restaurant
-- (the human identity used for matching). A RENAME is treated as remove-old + add-new
-- (loses that item's id/86 — unavoidable without a stable ref). Documented limitation.
--
-- Additive/behavioral: replaces the function body only. No schema/table/RLS change,
-- no data touched outside the publish operation. PREPARE-ONLY — review before apply.
-- Validated via BEGIN…ROLLBACK.
-- ============================================================================

create or replace function public.publish_menu_draft(
  p_restaurant_id uuid,
  p_draft_id      uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_payload          jsonb;
  v_mod_map          jsonb := '{}'::jsonb;
  v_cat              jsonb;
  v_item             jsonb;
  v_variant          jsonb;
  v_group            jsonb;
  v_option           jsonb;
  v_modifier         jsonb;
  v_mod_name         text;
  v_cat_id           uuid;
  v_item_id          uuid;
  v_group_id         uuid;
  v_mod_id           uuid;
  v_existing_item_id uuid;
  v_draft_cat_names  text[] := '{}';
  v_draft_item_names text[] := '{}';
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

  -- 2. Rebuild the stateless CHILDREN only (NOT menu_items / menu_categories /
  --    menu_availability_events). These carry no preserved state and are pointed at
  --    the upserted item ids below. menu_items is left intact so item ids,
  --    `available`, and the cascade-linked availability events survive.
  delete from public.menu_item_modifiers      where restaurant_id = p_restaurant_id;
  delete from public.menu_item_choice_options  where restaurant_id = p_restaurant_id;
  delete from public.menu_item_choice_groups   where restaurant_id = p_restaurant_id;
  delete from public.menu_item_variants        where restaurant_id = p_restaurant_id;
  delete from public.modifiers                 where restaurant_id = p_restaurant_id;

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

  -- 4. Upsert categories → items (by name) → rebuild each item's children.
  for v_cat in
    select value from jsonb_array_elements(coalesce(v_payload->'categories', '[]'::jsonb))
  loop
    -- 4a. Category upsert by (restaurant_id, name) — preserve id.
    select id into v_cat_id
    from public.menu_categories
    where restaurant_id = p_restaurant_id and name = v_cat->>'name'
    limit 1;
    if v_cat_id is null then
      insert into public.menu_categories (restaurant_id, name, sort)
      values (p_restaurant_id, v_cat->>'name', coalesce((v_cat->>'sort')::int, 0))
      returning id into v_cat_id;
    else
      update public.menu_categories
      set sort = coalesce((v_cat->>'sort')::int, 0)
      where id = v_cat_id;
    end if;
    v_draft_cat_names := array_append(v_draft_cat_names, v_cat->>'name');

    for v_item in
      select value from jsonb_array_elements(coalesce(v_cat->'items', '[]'::jsonb))
    loop
      -- 4b. Item upsert by (restaurant_id, name). On UPDATE, PRESERVE `available`
      --     (do not overwrite the manager's 86 flag from the draft); update content
      --     + re-point category_id. On INSERT (new item), take the draft's available.
      select id into v_existing_item_id
      from public.menu_items
      where restaurant_id = p_restaurant_id and name = v_item->>'name'
      limit 1;

      if v_existing_item_id is null then
        insert into public.menu_items (
          restaurant_id, category_id, name, name_en, description,
          price, available, ingredients, allergens
        )
        values (
          p_restaurant_id, v_cat_id,
          v_item->>'name', v_item->>'name_en', coalesce(v_item->>'description', ''),
          (v_item->>'price')::numeric,
          coalesce((v_item->>'available')::boolean, true),
          coalesce(array(select jsonb_array_elements_text(v_item->'ingredients')), '{}'::text[]),
          coalesce(array(select jsonb_array_elements_text(v_item->'allergens')), '{}'::text[])
        )
        returning id into v_item_id;
      else
        update public.menu_items
        set category_id  = v_cat_id,
            name_en      = v_item->>'name_en',
            description  = coalesce(v_item->>'description', ''),
            price        = (v_item->>'price')::numeric,
            ingredients  = coalesce(array(select jsonb_array_elements_text(v_item->'ingredients')), '{}'::text[]),
            allergens    = coalesce(array(select jsonb_array_elements_text(v_item->'allergens')), '{}'::text[])
            -- NOTE: `available` intentionally NOT updated — 86 state is preserved.
        where id = v_existing_item_id;
        v_item_id := v_existing_item_id;
      end if;
      v_draft_item_names := array_append(v_draft_item_names, v_item->>'name');

      -- 4c. Rebuild this item's variants.
      for v_variant in
        select value from jsonb_array_elements(coalesce(v_item->'variants', '[]'::jsonb))
      loop
        insert into public.menu_item_variants (restaurant_id, item_id, name, price, sort, active)
        values (
          p_restaurant_id, v_item_id, v_variant->>'name',
          (v_variant->>'price')::numeric, coalesce((v_variant->>'sort')::int, 0), true
        );
      end loop;

      -- 4d. Rebuild this item's choice groups + options.
      for v_group in
        select value from jsonb_array_elements(coalesce(v_item->'choice_groups', '[]'::jsonb))
      loop
        insert into public.menu_item_choice_groups (restaurant_id, item_id, name, min_select, max_select, sort)
        values (
          p_restaurant_id, v_item_id, v_group->>'name',
          coalesce((v_group->>'min_select')::int, 1),
          coalesce((v_group->>'max_select')::int, 1),
          coalesce((v_group->>'sort')::int, 0)
        )
        returning id into v_group_id;

        for v_option in
          select value from jsonb_array_elements(coalesce(v_group->'options', '[]'::jsonb))
        loop
          insert into public.menu_item_choice_options (restaurant_id, group_id, label, price_delta, sort, active)
          values (
            p_restaurant_id, v_group_id, v_option->>'label',
            coalesce((v_option->>'price_delta')::numeric, 0),
            coalesce((v_option->>'sort')::int, 0), true
          );
        end loop;
      end loop;

      -- 4e. Rebuild this item's modifier links (by name, via the map above).
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

  -- 5. Remove items absent from the new draft (cascades THEIR children + 86 events
  --    — correct, the item is gone), then absent categories. Items first (FK).
  delete from public.menu_items
  where restaurant_id = p_restaurant_id
    and name <> all(v_draft_item_names);

  delete from public.menu_categories
  where restaurant_id = p_restaurant_id
    and name <> all(v_draft_cat_names);

  -- 6. Mark draft published; supersede any prior published draft.
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

revoke all on function public.publish_menu_draft(uuid, uuid) from public;
grant execute on function public.publish_menu_draft(uuid, uuid) to service_role;

-- Rollback (manual): restore the 0036 delete+recreate body (git: 0036_menu_draft.sql).
