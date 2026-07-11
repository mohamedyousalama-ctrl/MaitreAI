-- ============================================================================
-- MaitreAI — WO-COMPANION W2: two-axis (ingredient × preparation) per-dish data.
-- PREPARE-ONLY. Apply is a SEPARATE approved event (like 0055/0080). Nothing in the
-- live conversation reads these until allergy_companion_mode is ON for a tenant, and
-- every runtime READ is deploy-safe (brain loads menu_items via select("*"), so a
-- missing column is simply absent → the mapper falls back to unknown/unverified) and
-- every runtime WRITE probes for the column (42703 → "not applied", never a crash).
-- So this migration can land ahead of the code and the code ahead of the apply.
--
-- Extends the EXISTING allergens/allergens_reviewed_at pattern (0055) — NOT a
-- parallel system. Axis 1 (ingredient) already exists: menu_items.ingredients +
-- .allergens + allergens_reviewed_at/by. Axis 2 (preparation) is added here.
--
--   menu_items +=
--     cross_contact_risks  text[]  — tags from a controlled vocab (shared_fryer,
--                                     shared_grill, shared_oil, shared_utensils,
--                                     shared_prep_area, garnish_risk, sauce_risk,
--                                     supplier_may_contain).
--     prep_status          text    — 'controlled' | 'shared_risk' | 'unknown'.
--     prep_verified_at     timestamptz — the §2 prep review stamp (mirrors
--     prep_verified_by     uuid          allergens_reviewed_at/by exactly).
--     kitchen_can_isolate  text    — 'yes' | 'no' | 'unknown' (optional).
--     preparation_notes    text    — free text.
--
-- Posture: additive, nullable, NO backfill, NO RLS change (matches 0055).
-- ============================================================================

-- 1. Axis-2 (preparation) columns + prep review stamp -----------------------
alter table public.menu_items add column if not exists cross_contact_risks text[] not null default '{}';
alter table public.menu_items add column if not exists prep_status         text;   -- controlled|shared_risk|unknown (null ⇒ unknown)
alter table public.menu_items add column if not exists prep_verified_at     timestamptz;
alter table public.menu_items add column if not exists prep_verified_by     uuid;
alter table public.menu_items add column if not exists kitchen_can_isolate  text;   -- yes|no|unknown (optional; null ⇒ unknown)
alter table public.menu_items add column if not exists preparation_notes    text;

-- 2. publish_menu_draft — DURABILITY: preserve INGREDIENTS on re-publish -----
-- WB-ALLERGEN-2 (0055) fixed this for `allergens` but NOT for `ingredients`: the
-- item UPDATE still does `ingredients = coalesce(draft.ingredients, '{}')`, so a
-- re-publish/re-ingest whose draft lacks ingredients SILENTLY WIPES them. In W2 the
-- ingredient list is a SAFETY input to the two-axis truth model, so this rewrites the
-- UPDATE to PRESERVE existing ingredients unless the draft explicitly carries a
-- non-empty list — mirroring EXACTLY how 0055 preserves allergens (the ONLY change
-- vs 0055 is that one `ingredients` expression). The NEW axis-2 columns
-- (cross_contact_risks / prep_status / prep_verified_at/by / kitchen_can_isolate /
-- preparation_notes) are PRESERVED BY OMISSION — publish never references them, so a
-- re-publish can never touch them (same as the review-stamp columns). New items start
-- with the column defaults (prep_status null = unknown, unverified), which is correct.
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

  delete from public.menu_item_modifiers      where restaurant_id = p_restaurant_id;
  delete from public.menu_item_choice_options  where restaurant_id = p_restaurant_id;
  delete from public.menu_item_choice_groups   where restaurant_id = p_restaurant_id;
  delete from public.menu_item_variants        where restaurant_id = p_restaurant_id;
  delete from public.modifiers                 where restaurant_id = p_restaurant_id;

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

  for v_cat in
    select value from jsonb_array_elements(coalesce(v_payload->'categories', '[]'::jsonb))
  loop
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
            -- WB-ALLERGEN-2 (0055): preserve allergens when the draft carries NONE.
            allergens    = coalesce(
                             nullif(array(select jsonb_array_elements_text(v_item->'allergens')), '{}'::text[]),
                             allergens
                           ),
            -- WO-COMPANION W2: SAME preserve treatment for ingredients (a two-axis
            -- safety input) — a draft with no ingredients must NOT wipe them.
            ingredients  = coalesce(
                             nullif(array(select jsonb_array_elements_text(v_item->'ingredients')), '{}'::text[]),
                             ingredients
                           )
            -- `available`, `allergens_reviewed_at/by`, and ALL axis-2 columns
            -- (cross_contact_risks/prep_status/prep_verified_at/by/kitchen_can_isolate/
            -- preparation_notes) are intentionally NOT in this SET → preserved.
        where id = v_existing_item_id;
        v_item_id := v_existing_item_id;
      end if;
      v_draft_item_names := array_append(v_draft_item_names, v_item->>'name');

      for v_variant in
        select value from jsonb_array_elements(coalesce(v_item->'variants', '[]'::jsonb))
      loop
        insert into public.menu_item_variants (restaurant_id, item_id, name, price, sort, active)
        values (
          p_restaurant_id, v_item_id, v_variant->>'name',
          (v_variant->>'price')::numeric, coalesce((v_variant->>'sort')::int, 0), true
        );
      end loop;

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

  delete from public.menu_items
  where restaurant_id = p_restaurant_id
    and name <> all(v_draft_item_names);

  delete from public.menu_categories
  where restaurant_id = p_restaurant_id
    and name <> all(v_draft_cat_names);

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

-- Rollback (manual; not auto-run):
--   alter table public.menu_items drop column if exists preparation_notes;
--   alter table public.menu_items drop column if exists kitchen_can_isolate;
--   alter table public.menu_items drop column if exists prep_verified_by;
--   alter table public.menu_items drop column if exists prep_verified_at;
--   alter table public.menu_items drop column if exists prep_status;
--   alter table public.menu_items drop column if exists cross_contact_risks;
--   (and re-apply 0055_allergen_review_state.sql to restore the prior function body)
