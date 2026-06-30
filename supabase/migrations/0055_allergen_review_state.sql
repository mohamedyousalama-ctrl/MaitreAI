-- ============================================================================
-- 0055 — allergen review-state + publish_menu_draft allergen-PRESERVE fix
--        (WB-ALLERGEN-2)
--
-- TWO changes, both safety-critical:
--
-- (a) REVIEW STATE — add two nullable columns to menu_items so we can tell
--     "nobody entered allergens yet" (unknown → escalate) apart from "the kitchen
--     CONFIRMED the allergen set" (a human review):
--       allergens_reviewed_at  timestamptz null
--       allergens_reviewed_by  uuid        null
--     reviewed_at IS NULL  ⇒ UNSPECIFIED / unknown (the safe default for every
--     existing + new item). A future console action (WB-ALLERGEN-3) stamps these;
--     nothing reads them yet. Additive, nullable, NO backfill, NO RLS change.
--
-- (b) DURABILITY FIX — the 0050 publish_menu_draft UPDATE branch sets
--       allergens = coalesce(draft.allergens, '{}')
--     so a re-publish/re-ingest whose draft lacks allergens SILENTLY WIPES an
--     item's allergens to empty (safety-data loss). This rewrites the UPDATE to
--     PRESERVE existing allergens unless the draft EXPLICITLY carries a non-empty
--     allergen list for that item — mirroring exactly how 0050 already preserves
--     the 86/`available` flag (by leaving the column out of the SET). The review
--     columns (allergens_reviewed_at/by) are NEVER written by publish — only the
--     console UI sets them — so a publish can never fabricate or clear a human
--     "kitchen confirmed" stamp. New items still start empty + unreviewed
--     (= unknown, correct). EVERYTHING ELSE in publish_menu_draft (item id /
--     price / category / 86 preservation, children rebuild, delete-absent) is
--     byte-identical to 0050.
--
-- PREPARE-ONLY — review before apply. Validated via BEGIN…ROLLBACK on prod.
-- ============================================================================

-- (a) review-state columns (additive, nullable, no backfill).
alter table public.menu_items add column if not exists allergens_reviewed_at timestamptz;
alter table public.menu_items add column if not exists allergens_reviewed_by uuid;

-- (b) publish_menu_draft with allergen preservation (only the item UPDATE's
--     `allergens` expression changed vs 0050; all else identical).
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
  --    menu_availability_events).
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
      --     (86) AND `allergens`/review-state (WB-ALLERGEN-2): a re-publish whose
      --     draft does NOT carry allergens for this item must NOT wipe them.
      select id into v_existing_item_id
      from public.menu_items
      where restaurant_id = p_restaurant_id and name = v_item->>'name'
      limit 1;

      if v_existing_item_id is null then
        -- New item: take the draft's allergens (default empty); reviewed_at/by
        -- default NULL (= unknown/unspecified, correct).
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
            -- WB-ALLERGEN-2 DURABILITY FIX: preserve existing allergens when the
            -- draft carries NONE; apply only when it explicitly lists them. (nullif
            -- maps an empty/absent draft list → NULL → coalesce keeps the old value.)
            allergens    = coalesce(
                             nullif(array(select jsonb_array_elements_text(v_item->'allergens')), '{}'::text[]),
                             allergens
                           )
            -- `available`, `allergens_reviewed_at`, `allergens_reviewed_by`
            -- intentionally NOT in this SET → preserved (86 + human review stamp).
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

  -- 5. Remove items absent from the new draft, then absent categories. Items first (FK).
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

-- Rollback (manual; not auto-run): restore the 0050 function body + drop the columns:
--   alter table public.menu_items drop column if exists allergens_reviewed_by;
--   alter table public.menu_items drop column if exists allergens_reviewed_at;
--   (and re-apply 0050_menu_publish_upsert.sql to restore the prior function body)
