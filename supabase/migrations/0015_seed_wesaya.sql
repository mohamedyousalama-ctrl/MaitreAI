-- ============================================================================
-- MaitreAI — Wesaya tenant seed
-- Adds the وصاية / Wesaya restaurant and catalog only. The seed is idempotent
-- and never updates or deletes existing tenant rows.
-- ============================================================================

do $$
declare
  r_id uuid;
begin
  insert into public.restaurants (
    name,
    logo_url,
    phone,
    currency,
    country,
    default_language,
    dialect,
    timezone,
    business_type,
    active,
    is_open,
    accept_preorders
  )
  select
    'وصاية',
    'https://wesaya.getorders.net/favicon.png',
    '01007636322',
    'ج.م',
    'EG',
    'ar',
    'egyptian',
    'Africa/Cairo',
    'Wesaya',
    true,
    true,
    false
  where not exists (
    select 1
    from public.restaurants
    where name = 'وصاية'
  );

  select id into r_id
  from public.restaurants
  where name = 'وصاية'
  order by created_at
  limit 1;

  insert into public.branches (restaurant_id, name, phone, notes, active)
  select r_id, seed.name, '01007636322', seed.notes, seed.active
  from (
    values
      ('فرع الهرم', 'يعمل ٢٤ ساعة', true),
      ('فرع الهرم (-1)', 'يعمل ٢٤ ساعة', true)
  ) as seed(name, notes, active)
  where not exists (
    select 1
    from public.branches b
    where b.restaurant_id = r_id
      and b.name = seed.name
  );

  insert into public.menu_categories (restaurant_id, name, sort)
  select r_id, seed.name, seed.sort
  from (
    values
      ('العروض', 1),
      ('سندويتشات الدجاج', 2),
      ('سندويتشات البرجر', 3),
      ('البيتزا', 4),
      ('الوجبات العائلية', 5),
      ('الوجبات الفردية', 6),
      ('الأصناف الجانبية', 7),
      ('المشروبات', 8)
  ) as seed(name, sort)
  where not exists (
    select 1
    from public.menu_categories c
    where c.restaurant_id = r_id
      and c.name = seed.name
  );

  insert into public.menu_items (
    restaurant_id,
    category_id,
    name,
    name_en,
    description,
    price,
    image_url,
    available,
    image_kind,
    image_status
  )
  select
    r_id,
    c.id,
    seed.name,
    seed.name_en,
    seed.description,
    seed.price,
    seed.image_url,
    seed.available,
    'real',
    'approved'
  from (
    values
      ('العروض', 'عرض ٢ بيتزا وسط', '2 medium pizzas on offer', '2 medium pizzas of your choice', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/4955804c-5a67-4f60-8491-57751f3a5830.jpg', false),
      ('العروض', 'عرض كاديا', 'kadya Offer', 'Six pieces of broast + 2 coleslaw + rice + fries + BBQ sauce + bread Choosing of taste', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/224d5085-0d87-4fe2-b80d-5d17eea6fe3d.jpg', false),
      ('العروض', 'عرض شير بوكس', 'Sharebox offer', '4 single sandwiches of your choice + fries + drink', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/31ab414f-7068-427c-b531-8ccf9f00a355.jpg', false),
      ('العروض', 'عرض ميجا ميل', 'mega meal offer', 'Family Rizo 2 pieces of chicken + 1 bread Choice of taste', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/c6e174e0-86d8-4c70-9e34-18856227107e.jpg', false),
      ('العروض', 'عرض ٨ قطع بروست', 'Offer of 8 pieces of Broast', '8 pieces of broast with bread Choice of taste', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/113c118c-1ae9-46a3-b4a5-c505439f6364.jpg', false),
      ('العروض', 'عرض أكيل', 'Akeel Offer', '1 rizo with 1 zinger with 1 salad', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/c59e0fe0-4e38-41e3-a1e9-f50a970f553b.jpg', false),
      ('العروض', 'عرض دبل', 'double Offer', '2 zinger or beef sandwiches of your choice', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/1ca11eca-e872-4bf8-a75f-dd8dae22462e.jpg', false),
      ('العروض', 'عرض الكتيبة', 'The katiba offer', 'Four pieces of broast + rice + tomatoes + bread', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/e553f8e4-c2d4-46d7-a996-4e2a06409de4.jpg', false),
      ('العروض', 'سوبر وصاية', 'Super Guardianship', 'It consists of two pieces of broast + 2 strips + coleslaw', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/cb4dde29-ffef-4c6b-8d14-86693e8d765e.jpg', false),
      ('سندويتشات الدجاج', 'ميسي زنجر', 'Missy Zinger', 'Chicken breasts + BBQ sauce + American cheese + chili mayonnaise + lettuce + pickled cucumbers + sesame bread', 130.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/47651d9b-3559-4cc7-a5e6-b8f7613e8905.png', true),
      ('سندويتشات الدجاج', 'فيليه سوبريم', 'Fillet supreme', 'French bread + 2 pieces of strips + mayonnaise + cappuccino + cheddar sauce', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/d52ac979-70ee-4b94-8494-d6ed059473b0.png', false),
      ('سندويتشات الدجاج', 'زنجر', 'Zinger', 'Chicken breasts, American cheese, mayonnaise, lettuce, sesame bread', 120.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/3d4bdff6-c299-47ff-889c-a7a9fa9c6c53.png', true),
      ('سندويتشات الدجاج', 'تويستر', 'Twister', 'Chicken breasts, cheddar sauce mayonnaise, tomatoes, lettuce, tortilla bread', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/57bace0d-6447-4967-ac9e-a677fe97ebec.png', false),
      ('سندويتشات البرجر', 'برجر لحم', 'Beef burger', 'Bread + 2 slices of onion + slice of cheddar + burger patty + lettuce + mayonnaise', 145.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/9d317f79-f416-4a76-8edf-0801740225c0.jpg', true),
      ('البيتزا', 'بيتزا ببروني', 'Pepperoni pizza', 'Smoked pepperoni + special tomato sauce with mozzarella cheese', 120.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/4f3ac079-27c0-4be2-9e13-0681cb089f57.png', true),
      ('البيتزا', 'بيتزا خضار', 'Vegetable pizza', 'Special tomato sauce with mozzarella cheese + cheese slices + olives + green pepper', 105.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/3a335cf6-6ee1-406c-ae7e-560930b115f2.png', true),
      ('البيتزا', 'بيتزا سماش لحم', 'Smash meat pizza', 'Meat pieces with onions, special tomato and mozzarella cheese', 135.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/5d1a9403-4a62-48dc-a10d-1bff0e483bf3.jpg', true),
      ('البيتزا', 'بيتزا هوت دوج', 'Hot dog pizza', 'Dough + pizza sauce + hot dog + green pepper + onion + mozzarella + olives', 115.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/1c3f7e16-37af-4679-ab9e-9f3412f2d520.jpg', true),
      ('البيتزا', 'بيتزا باربكيو', 'BBQ', 'Dough + BBQ sauce + Shawarma + Onion + Sausages + Mozzarella + BBQ sauce', 135.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/8b78f84f-47de-486d-aaa4-d5d2a20ee708.png', true),
      ('البيتزا', 'بيتزا تشيكن رانش', 'Chicken Ranch Pizza', 'Size Small 145 L.E. Medium 195 L.E. large 235 L.E.', 145.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/7a3e83ac-928b-4563-8cf9-3d62b944c450.jpg', true),
      ('البيتزا', 'بيتزا دجاج', 'Chicken pizza', 'Dough + pizza sauce + onion + green pepper + shawarma + mozzarella + olives', 125.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/de029b1c-ed04-4959-bea3-61aa30a2d9c1.png', true),
      ('البيتزا', 'بيتزا ميكس جبن', 'Cheese Mix', 'Dough + pizza sauce + Kiri Mozzarella + American cheese', 130.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/757e6a33-7d1f-49e1-b0f3-590aa75a4d0b.jpg', true),
      ('البيتزا', 'بيتزا سوبر كرانشي', 'Super Crunchy Pizza', 'Crunchy chicken with mozzarella and spicy sauce', 145.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/e1feee15-cf3b-4555-8c7b-e2de96247ac9.png', true),
      ('البيتزا', 'بيتزا كرانشي سموك', 'Crunchy Smoke', 'smoked Turkey and mozzarella cheese cutlets', 140.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/8b960870-a7db-4966-ad2a-2b6fc90e858d.jpeg', true),
      ('البيتزا', 'بيتزا كيري بسطرمة', 'Kerry Pastrami', 'Kiri cheese with pastrami and mozzarella', 135.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/05729467-a668-4bf4-be98-66e81a4ccb88.jpg', true),
      ('البيتزا', 'بيتزا سوبر رانش', 'Super Ranch Pizza', 'Chicken sausages + grilled chicken pieces + ranch sauce + pepper', 170.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/08cc624a-256c-4e77-9d9f-5c0a126bbc18.png', true),
      ('الوجبات العائلية', 'ستربس ١٥ قطعة', 'Strips 15 pieces', 'Served with family salad + + fries + bread', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/2977bde1-9b3c-42dc-a7d0-85dfff8f1522.png', false),
      ('الوجبات العائلية', 'وجبة وصاية العائلية', 'Family Guardianship Meal', 'Served with 2 salads + large fries + bread', 425.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/ade81151-130b-4937-8353-2a1bf3907418.png', true),
      ('الوجبات العائلية', 'عرض ٦ قطع', '6-piece offer', '6 pieces without wings and 2 loaves of bread', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/8cff3886-3707-43e6-8944-9e08efdb0bd1.png', false),
      ('الوجبات الفردية', 'وجبة سناك', 'Snack meal', '2 pieces of chicken with fries, bread and salad', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/bbeca404-581a-4e55-b637-6a9dd5ded144.png', false),
      ('الوجبات الفردية', 'سوبر دينر', 'Super dinner', '4 pieces of chicken, fries, bread and rice', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/864b3f05-f955-4ac4-8efc-c0bd2d2f65f2.png', false),
      ('الوجبات الفردية', 'ستربس ٣ قطع', 'Strips 3 pieces', '3 pieces of strips with bread, fries and mushrooms', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/76d4cb22-42d9-4a01-b476-1155fa344c33.png', false),
      ('الوجبات الفردية', 'ستربس ٥ قطع', 'Strips 5 pieces', '5 pieces of strips, bread, mushrooms and fries', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/ac9ca429-b5bc-4815-9c1f-3551b1d7c950.png', false),
      ('الوجبات الفردية', 'وجبة أطفال', 'Kids meal', 'strips with fries and bread + a children''s toy Your choice', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/415b5e62-250c-4e9c-a77a-f3b0e9d4fdea.png', false),
      ('الوجبات الفردية', 'ستربس ٧ قطع', 'Strips 7 pieces', 'Seven pieces of strips + fries + coleslaw + bread', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/11e95387-2769-4123-a452-770de6ee5156.png', false),
      ('الوجبات الفردية', 'سناك بلس', 'Snack plus', '1 rice + 2 pieces of Brost coleslaw + potatoes + bread', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/e1d0e5ed-b1a8-47d2-beb6-eedb1e8ebb29.png', false),
      ('الوجبات الفردية', 'وجبة دينر', 'Dinner meal', 'Three pieces of broast + fries + bread + coleslaw', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/a07c27b3-f8de-4c9d-ab94-e73341c7ec80.png', false),
      ('الوجبات الفردية', 'قطعة بروست', 'Broast piece', 'Broast piece + Fries', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/53db49b9-47c4-4d60-9b08-070d2ee22dfc.png', false),
      ('الأصناف الجانبية', 'أرز', 'rice', '', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/47f9bcc9-084b-4161-897b-3add6b92f693.png', false),
      ('الأصناف الجانبية', 'ريزو', 'Rizzo', 'choose of taybe', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/fa88c40c-24b7-4235-a17f-60316d66969e.png', false),
      ('الأصناف الجانبية', 'بطاطس', 'potatoes', '', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/a143bc8a-54d3-4b9a-9738-5728b871c786.png', false),
      ('الأصناف الجانبية', 'هالبينو', 'Jalapeno', '', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/3a574957-6317-40b9-97cb-773fe7a71613.png', false),
      ('الأصناف الجانبية', 'إضافة كاتشب', 'Add ketchup', '', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/b8b3dcb8-3cb3-4856-86a1-724fcf5c06b0.png', false),
      ('الأصناف الجانبية', 'قطعة ستربس', 'A piece of strips', '', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/6e4bc65c-9067-4975-9f89-d61c7c8d84b3.jpg', false),
      ('الأصناف الجانبية', 'ريزو دبل شيدر', 'ريزو دبل شيدر', 'Spiced rice + strips pieces + cheddar sauce + shredded cheddar + barbecue sauce', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/ca44bcdf-0a7b-4608-ac13-8bf06ba93e10.jpg', false),
      ('الأصناف الجانبية', 'كول سلو', 'Klauslu', '', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/2dfd28c2-1b20-44ff-8439-c228cb24a556.png', false),
      ('المشروبات', 'مياه معدنية', 'Mineral water', '', 0.00, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/5dd3a4fa-b01a-4c1a-b5a4-d6e4f80c733d.png', false)
  ) as seed(category_name, name, name_en, description, price, image_url, available)
  join public.menu_categories c
    on c.restaurant_id = r_id
   and c.name = seed.category_name
  where not exists (
    select 1
    from public.menu_items i
    where i.restaurant_id = r_id
      and i.name = seed.name
  );
end $$;

create or replace function public.link_wesaya_member(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r_id uuid;
begin
  select id into r_id
  from public.restaurants
  where name = 'وصاية'
  order by created_at
  limit 1;

  if r_id is null then
    raise exception 'Wesaya restaurant has not been seeded';
  end if;

  if exists (
    select 1
    from public.members
    where user_id = p_user_id
      and restaurant_id <> r_id
  ) then
    raise exception 'User % already belongs to another restaurant; refusing to alter tenant resolution', p_user_id;
  end if;

  insert into public.members (restaurant_id, user_id, role)
  select r_id, p_user_id, 'manager'
  where not exists (
    select 1
    from public.members
    where restaurant_id = r_id
      and user_id = p_user_id
  );

  return r_id;
end;
$$;
