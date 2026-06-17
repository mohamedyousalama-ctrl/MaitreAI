-- ============================================================================
-- MaitreAI — Wesaya corrected v2 seed
-- Scoped to the وصاية / Wesaya tenant. Correct prices come from the attached
-- wesaya_restaurant_COMPLETE_v2 menu_data.json bundle.
-- ============================================================================

do $$
declare
  r_id uuid;
begin
  insert into public.restaurants (name, logo_url, phone, currency, country, default_language, dialect, timezone, business_type, active, is_open, accept_preorders)
  select 'وصاية', 'https://wesaya.getorders.net/favicon.png', '01007636322', 'ج.م', 'EG', 'ar', 'egyptian', 'Africa/Cairo', 'Wesaya', true, true, false
  where not exists (select 1 from public.restaurants where name = 'وصاية');

  select id into r_id from public.restaurants where name = 'وصاية' order by created_at limit 1;

  update public.restaurants
  set logo_url = 'https://wesaya.getorders.net/favicon.png', phone = '01007636322', currency = 'ج.م', country = 'EG', default_language = 'ar', dialect = 'egyptian', timezone = 'Africa/Cairo', business_type = 'Wesaya', active = true, is_open = true, accept_preorders = false
  where id = r_id;

  create temporary table wesaya_category_seed on commit drop as
  select * from (values
    ('العروض', 1), ('سندويتشات الدجاج', 2), ('سندويتشات البرجر', 3), ('البيتزا', 4),
    ('الوجبات العائلية', 5), ('الوجبات الفردية', 6), ('الأصناف الجانبية', 7), ('المشروبات', 8)
  ) as seed(name, sort);

  create temporary table wesaya_item_seed on commit drop as
  select * from (values
('العروض', 'عرض ٢ بيتزا وسط', '2 medium pizzas on offer', '2 medium pizzas of your choice', 290, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/4955804c-5a67-4f60-8491-57751f3a5830.jpg', 1),
    ('العروض', 'عرض كاديا', 'kadya Offer', 'Six pieces of broast + 2 coleslaw + rice + fries + BBQ sauce + bread', 320, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/224d5085-0d87-4fe2-b80d-5d17eea6fe3d.jpg', 2),
    ('العروض', 'عرض شير بوكس', 'Sharebox offer', '4 single sandwiches of your choice + fries + drink', 440, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/31ab414f-7068-427c-b531-8ccf9f00a355.jpg', 3),
    ('العروض', 'عرض ميجا ميل', 'mega meal offer', 'Family Rizo 2 pieces of chicken + 1  bread', 150, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/c6e174e0-86d8-4c70-9e34-18856227107e.jpg', 4),
    ('العروض', 'عرض ٨ قطع بروست', 'Offer of 8 pieces of Broast', '8 pieces of broast with bread', 360, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/113c118c-1ae9-46a3-b4a5-c505439f6364.jpg', 5),
    ('العروض', 'عرض أكيل', 'Akeel Offer', '1 rizo with 1 zinger with 1 salad', 170, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/c59e0fe0-4e38-41e3-a1e9-f50a970f553b.jpg', 6),
    ('العروض', 'عرض دبل', 'double Offer', '2 zinger or beef sandwiches of your choice', 169, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/1ca11eca-e872-4bf8-a75f-dd8dae22462e.jpg', 7),
    ('العروض', 'عرض الكتيبة', 'The katiba offer', 'Four pieces of broast + rice + tomatoes + breadCalories: 60000 kcal', 385, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/e553f8e4-c2d4-46d7-a996-4e2a06409de4.jpg', 8),
    ('العروض', 'سوبر وصاية', 'Super Guardianship', 'It consists of two pieces of broast + 2 strips  + coleslaw', 150, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/cb4dde29-ffef-4c6b-8d14-86693e8d765e.jpg', 9),
    ('سندويتشات الدجاج', 'ميسي زنجر', 'Missy Zinger', 'Chicken breasts + BBQ sauce + American cheese + chili mayonnaise + lettuce + pickled cucumbers + sesame bread', 130, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/47651d9b-3559-4cc7-a5e6-b8f7613e8905.png', 10),
    ('سندويتشات الدجاج', 'فيليه سوبريم', 'Fillet supreme', 'French bread + 2 pieces of strips + mayonnaise + cappuccino + cheddar sauce', 140, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/d52ac979-70ee-4b94-8494-d6ed059473b0.png', 11),
    ('سندويتشات الدجاج', 'زنجر', 'Zinger', 'Chicken breasts, American cheese, mayonnaise, lettuce, sesame bread', 120, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/3d4bdff6-c299-47ff-889c-a7a9fa9c6c53.png', 12),
    ('سندويتشات الدجاج', 'تويستر', 'Twister', 'Chicken breasts, cheddar sauce mayonnaise, tomatoes, lettuce, tortilla bread', 110, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/57bace0d-6447-4967-ac9e-a677fe97ebec.png', 13),
    ('سندويتشات البرجر', 'برجر لحم', 'Beef burger', 'Bread + 2 slices of onion + slice of cheddar + burger patty + lettuce + mayonnaise', 145, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/9d317f79-f416-4a76-8edf-0801740225c0.jpg', 14),
    ('البيتزا', 'بيتزا ببروني', 'Pepperoni pizza', 'Smoked pepperoni + special tomato sauce with mozzarella cheese', 120, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/4f3ac079-27c0-4be2-9e13-0681cb089f57.png', 15),
    ('البيتزا', 'بيتزا خضار', 'Vegetable pizza', 'Special tomato sauce with mozzarella cheese + cheese slices + olives + green pepper', 105, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/3a335cf6-6ee1-406c-ae7e-560930b115f2.png', 16),
    ('البيتزا', 'بيتزا سماش لحم', 'Smash meat pizza', 'Meat pieces with onions, special tomato and mozzarella cheese', 135, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/5d1a9403-4a62-48dc-a10d-1bff0e483bf3.jpg', 17),
    ('البيتزا', 'بيتزا هوت دوج', 'Hot dog pizza', 'Dough + pizza sauce + hot dog + green pepper + onion + mozzarella + olives', 115, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/1c3f7e16-37af-4679-ab9e-9f3412f2d520.jpg', 18),
    ('البيتزا', 'بيتزا باربكيو', 'BBQ', 'Dough + BBQ sauce + Shawarma + Onion + Sausages + Mozzarella + BBQ sauce', 135, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/8b78f84f-47de-486d-aaa4-d5d2a20ee708.png', 19),
    ('البيتزا', 'بيتزا تشيكن رانش', 'Chicken Ranch Pizza', '', 145, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/7a3e83ac-928b-4563-8cf9-3d62b944c450.jpg', 20),
    ('البيتزا', 'بيتزا دجاج', 'Chicken pizza', 'Dough + pizza sauce + onion + green pepper + shawarma + mozzarella + olives', 125, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/de029b1c-ed04-4959-bea3-61aa30a2d9c1.png', 21),
    ('البيتزا', 'بيتزا ميكس جبن', 'Cheese Mix', 'Dough + pizza sauce + Kiri Mozzarella + American cheese', 130, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/757e6a33-7d1f-49e1-b0f3-590aa75a4d0b.jpg', 22),
    ('البيتزا', 'بيتزا سوبر كرانشي', 'Super Crunchy Pizza', 'Crunchy chicken with mozzarella and spicy sauce', 145, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/e1feee15-cf3b-4555-8c7b-e2de96247ac9.png', 23),
    ('البيتزا', 'بيتزا كرانشي سموك', 'Crunchy Smoke', 'smoked Turkey and mozzarella cheese cutletsCalories: 0 kcal', 140, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/8b960870-a7db-4966-ad2a-2b6fc90e858d.jpeg', 24),
    ('البيتزا', 'بيتزا كيري بسطرمة', 'Kerry Pastrami', 'Kiri cheese with pastrami and mozzarella', 135, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/05729467-a668-4bf4-be98-66e81a4ccb88.jpg', 25),
    ('البيتزا', 'بيتزا سوبر رانش', 'Super Ranch Pizza', 'Chicken sausages + grilled chicken pieces + ranch sauce + pepperCalories: 0 kcal', 170, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/08cc624a-256c-4e77-9d9f-5c0a126bbc18.png', 26),
    ('الوجبات العائلية', 'ستربس ١٥ قطعة', 'Strips 15 pieces', 'Served with family salad + + fries + bread', 580, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/2977bde1-9b3c-42dc-a7d0-85dfff8f1522.png', 27),
    ('الوجبات العائلية', 'وجبة وصاية العائلية', 'Family Guardianship Meal', 'Served with 2 salads + large fries + bread', 425, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/ade81151-130b-4937-8353-2a1bf3907418.png', 28),
    ('الوجبات العائلية', 'عرض ٦ قطع', '6-piece offer', '6 pieces without wings and 2 loaves of breadCalories: 60000 kcal', 270, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/8cff3886-3707-43e6-8944-9e08efdb0bd1.png', 29),
    ('الوجبات الفردية', 'وجبة سناك', 'Snack meal', '2 pieces of chicken with fries, bread and salad', 130, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/bbeca404-581a-4e55-b637-6a9dd5ded144.png', 30),
    ('الوجبات الفردية', 'سوبر دينر', 'Super dinner', '4 pieces of chicken, fries, bread and rice', 270, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/864b3f05-f955-4ac4-8efc-c0bd2d2f65f2.png', 31),
    ('الوجبات الفردية', 'ستربس ٣ قطع', 'Strips 3 pieces', '3 pieces of strips with bread, fries and mushrooms', 130, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/76d4cb22-42d9-4a01-b476-1155fa344c33.png', 32),
    ('الوجبات الفردية', 'ستربس ٥ قطع', 'Strips 5 pieces', '5 pieces of strips, bread, mushrooms and fries', 200, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/ac9ca429-b5bc-4815-9c1f-3551b1d7c950.png', 33),
    ('الوجبات الفردية', 'وجبة أطفال', 'Kids meal', 'strips with fries and bread + a children''s toy', 140, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/415b5e62-250c-4e9c-a77a-f3b0e9d4fdea.png', 34),
    ('الوجبات الفردية', 'ستربس ٧ قطع', 'Strips 7 pieces', 'Seven pieces of strips + fries + coleslaw + bread', 270, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/11e95387-2769-4123-a452-770de6ee5156.png', 35),
    ('الوجبات الفردية', 'سناك بلس', 'Snack plus', '1 rice + 2 pieces of Brost coleslaw + potatoes + bread', 250, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/e1d0e5ed-b1a8-47d2-beb6-eedb1e8ebb29.png', 36),
    ('الوجبات الفردية', 'وجبة دينر', 'Dinner meal', 'Three pieces of broast + fries + bread + coleslaw', 220, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/a07c27b3-f8de-4c9d-ab94-e73341c7ec80.png', 37),
    ('الوجبات الفردية', 'قطعة بروست', 'Broast piece', 'Broast piece + Fries', 90, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/53db49b9-47c4-4d60-9b08-070d2ee22dfc.png', 38),
    ('الأصناف الجانبية', 'أرز', 'rice', '', 50, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/47f9bcc9-084b-4161-897b-3add6b92f693.png', 39),
    ('الأصناف الجانبية', 'ريزو', 'Rizzo', '', 100, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/fa88c40c-24b7-4235-a17f-60316d66969e.png', 40),
    ('الأصناف الجانبية', 'بطاطس', 'potatoes', '', 45, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/a143bc8a-54d3-4b9a-9738-5728b871c786.png', 41),
    ('الأصناف الجانبية', 'هالبينو', 'Jalapeno', '', 15, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/3a574957-6317-40b9-97cb-773fe7a71613.png', 42),
    ('الأصناف الجانبية', 'إضافة كاتشب', 'Add ketchup', '', 5, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/b8b3dcb8-3cb3-4856-86a1-724fcf5c06b0.png', 43),
    ('الأصناف الجانبية', 'قطعة ستربس', 'A piece of strips', '', 70, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/6e4bc65c-9067-4975-9f89-d61c7c8d84b3.jpg', 44),
    ('الأصناف الجانبية', 'ريزو دبل شيدر', 'ريزو دبل شيدر', 'Spiced rice + strips pieces + cheddar sauce + shredded cheddar + barbecue sauce', 110, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/ca44bcdf-0a7b-4608-ac13-8bf06ba93e10.jpg', 45),
    ('الأصناف الجانبية', 'كول سلو', 'Klauslu', '', 30, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/2dfd28c2-1b20-44ff-8439-c228cb24a556.png', 46),
    ('المشروبات', 'مياه معدنية', 'Mineral water', '', 11, 'https://DobitesImages-cda7ebfseuagd8aa.z02.azurefd.net/Upload/Items/5dd3a4fa-b01a-4c1a-b5a4-d6e4f80c733d.png', 47)
  ) as seed(category_name, name, name_en, description, price, image_url, sort);

  create temporary table wesaya_variant_seed on commit drop as
  select * from (values
('ميسي زنجر', 'عادي', 130, 1),
    ('ميسي زنجر', 'دوبل', 185, 2),
    ('زنجر', 'عادي', 120, 1),
    ('زنجر', 'دوبل', 185, 2),
    ('برجر لحم', 'عادي', 145, 1),
    ('برجر لحم', 'دوبل', 180, 2),
    ('بيتزا ببروني', 'صغير', 120, 1),
    ('بيتزا ببروني', 'وسط', 180, 2),
    ('بيتزا ببروني', 'كبير', 220, 3),
    ('بيتزا خضار', 'صغير', 105, 1),
    ('بيتزا خضار', 'وسط', 145, 2),
    ('بيتزا خضار', 'كبير', 185, 3),
    ('بيتزا سماش لحم', 'صغير', 135, 1),
    ('بيتزا سماش لحم', 'وسط', 195, 2),
    ('بيتزا سماش لحم', 'كبير', 270, 3),
    ('بيتزا هوت دوج', 'صغير', 115, 1),
    ('بيتزا هوت دوج', 'وسط', 165, 2),
    ('بيتزا هوت دوج', 'كبير', 205, 3),
    ('بيتزا باربكيو', 'صغير', 135, 1),
    ('بيتزا باربكيو', 'وسط', 195, 2),
    ('بيتزا باربكيو', 'كبير', 235, 3),
    ('بيتزا تشيكن رانش', 'صغير', 145, 1),
    ('بيتزا تشيكن رانش', 'وسط', 195, 2),
    ('بيتزا تشيكن رانش', 'كبير', 235, 3),
    ('بيتزا دجاج', 'صغير', 125, 1),
    ('بيتزا دجاج', 'وسط', 190, 2),
    ('بيتزا دجاج', 'كبير', 230, 3),
    ('بيتزا ميكس جبن', 'صغير', 130, 1),
    ('بيتزا ميكس جبن', 'وسط', 175, 2),
    ('بيتزا ميكس جبن', 'كبير', 225, 3),
    ('بيتزا سوبر كرانشي', 'صغير', 145, 1),
    ('بيتزا سوبر كرانشي', 'وسط', 195, 2),
    ('بيتزا سوبر كرانشي', 'كبير', 240, 3),
    ('بيتزا كرانشي سموك', 'صغير', 140, 1),
    ('بيتزا كرانشي سموك', 'وسط', 195, 2),
    ('بيتزا كرانشي سموك', 'كبير', 240, 3),
    ('بيتزا كيري بسطرمة', 'صغير', 135, 1),
    ('بيتزا كيري بسطرمة', 'وسط', 195, 2),
    ('بيتزا كيري بسطرمة', 'كبير', 230, 3),
    ('بيتزا سوبر رانش', 'صغير', 170, 1),
    ('بيتزا سوبر رانش', 'وسط', 220, 2),
    ('بيتزا سوبر رانش', 'كبير', 280, 3),
    ('وجبة وصاية العائلية', '٦ قطع', 425, 1),
    ('وجبة وصاية العائلية', '٩ قطع', 595, 2),
    ('وجبة وصاية العائلية', '١٢ قطعة', 750, 3),
    ('وجبة وصاية العائلية', '١٥ قطعة', 860, 4),
    ('وجبة وصاية العائلية', '١٨ قطعة', 970, 5)
  ) as seed(item_name, variant_name, price, sort);

  create temporary table wesaya_choice_group_seed on commit drop as
  select * from (values
('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 1, 1, 1),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 1, 1, 2),
    ('عرض كاديا', 'اختر المذاق', 1, 1, 3),
    ('عرض شير بوكس', 'اختر الساندويتش ١', 1, 1, 4),
    ('عرض شير بوكس', 'اختر الساندويتش ٢', 1, 1, 5),
    ('عرض شير بوكس', 'اختر الساندويتش ٣', 1, 1, 6),
    ('عرض شير بوكس', 'اختر الساندويتش ٤', 1, 1, 7),
    ('عرض ميجا ميل', 'اختر المذاق', 1, 1, 8),
    ('عرض ٨ قطع بروست', 'اختر المذاق', 1, 1, 9),
    ('عرض أكيل', 'اختر المذاق', 1, 1, 10),
    ('عرض دبل', 'اختر الساندويتش ١', 1, 1, 11),
    ('عرض دبل', 'اختر الساندويتش ٢', 1, 1, 12),
    ('عرض الكتيبة', 'اختر المذاق', 1, 1, 13),
    ('سوبر وصاية', 'اختر المذاق', 1, 1, 14),
    ('فيليه سوبريم', 'اختر المذاق', 1, 1, 15),
    ('تويستر', 'اختر المذاق', 1, 1, 16),
    ('ستربس ١٥ قطعة', 'اختر الصوص/السلطة', 1, 1, 17),
    ('عرض ٦ قطع', 'اختر المذاق', 1, 1, 18),
    ('وجبة سناك', 'اختر الصوص/السلطة', 1, 1, 19),
    ('وجبة سناك', 'اختر المذاق', 1, 1, 20),
    ('سوبر دينر', 'اختر الصوص/السلطة', 1, 1, 21),
    ('سوبر دينر', 'اختر المذاق', 1, 1, 22),
    ('ستربس ٣ قطع', 'اختر الصوص/السلطة', 1, 1, 23),
    ('ستربس ٣ قطع', 'اختر المذاق', 1, 1, 24),
    ('ستربس ٥ قطع', 'اختر الصوص/السلطة', 1, 1, 25),
    ('ستربس ٥ قطع', 'اختر المذاق', 1, 1, 26),
    ('وجبة أطفال', 'اختر النوع', 1, 1, 27),
    ('ستربس ٧ قطع', 'اختر الصوص/السلطة', 1, 1, 28),
    ('ستربس ٧ قطع', 'اختر المذاق', 1, 1, 29),
    ('سناك بلس', 'اختر الصوص/السلطة', 1, 1, 30),
    ('سناك بلس', 'اختر المذاق', 1, 1, 31),
    ('وجبة دينر', 'اختر الصوص/السلطة', 1, 1, 32),
    ('وجبة دينر', 'اختر المذاق', 1, 1, 33),
    ('ريزو', 'اختر المذاق', 1, 1, 34),
    ('ريزو دبل شيدر', 'اختر المذاق', 1, 1, 35)
  ) as seed(item_name, group_name, min_select, max_select, sort);

  create temporary table wesaya_choice_option_seed on commit drop as
  select * from (values
('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا باربكيو دجاج', 0, 1),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا هوت دوج', 10, 2),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا كيري بسطرمة', 20, 3),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا سموكي زنجر', 20, 4),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا تشيكن رانش', 10, 5),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا ميكس جبن', 0, 6),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا خضار', 0, 7),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا دجاج', 0, 8),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا ببروني', 10, 9),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا سماش لحم', 10, 10),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا كرانشي', 0, 11),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ١', 'بيتزا كرانشي حار', 0, 12),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا باربكيو دجاج', 0, 1),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا هوت دوج', 10, 2),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا كيري بسطرمة', 20, 3),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا سموكي زنجر', 20, 4),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا تشيكن رانش', 10, 5),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا ميكس جبن', 0, 6),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا خضار', 0, 7),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا دجاج', 0, 8),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا ببروني', 10, 9),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا سماش لحم', 10, 10),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا كرانشي', 0, 11),
    ('عرض ٢ بيتزا وسط', 'اختر بيتزا ٢', 'بيتزا كرانشي حار', 0, 12),
    ('عرض كاديا', 'اختر المذاق', 'عادي', 0, 1),
    ('عرض كاديا', 'اختر المذاق', 'حار', 0, 2),
    ('عرض كاديا', 'اختر المذاق', 'مكس', 0, 3),
    ('عرض شير بوكس', 'اختر الساندويتش ١', 'زنجر عادي', 0, 1),
    ('عرض شير بوكس', 'اختر الساندويتش ١', 'زنجر حار', 0, 2),
    ('عرض شير بوكس', 'اختر الساندويتش ١', 'تشيكن برجر عادي', 30, 3),
    ('عرض شير بوكس', 'اختر الساندويتش ١', 'تشيكن برجر حار', 30, 4),
    ('عرض شير بوكس', 'اختر الساندويتش ٢', 'زنجر عادي', 0, 1),
    ('عرض شير بوكس', 'اختر الساندويتش ٢', 'زنجر حار', 0, 2),
    ('عرض شير بوكس', 'اختر الساندويتش ٢', 'تشيكن برجر عادي', 30, 3),
    ('عرض شير بوكس', 'اختر الساندويتش ٢', 'تشيكن برجر حار', 30, 4),
    ('عرض شير بوكس', 'اختر الساندويتش ٣', 'زنجر عادي', 0, 1),
    ('عرض شير بوكس', 'اختر الساندويتش ٣', 'زنجر حار', 0, 2),
    ('عرض شير بوكس', 'اختر الساندويتش ٣', 'تشيكن برجر عادي', 30, 3),
    ('عرض شير بوكس', 'اختر الساندويتش ٣', 'تشيكن برجر حار', 30, 4),
    ('عرض شير بوكس', 'اختر الساندويتش ٤', 'زنجر عادي', 0, 1),
    ('عرض شير بوكس', 'اختر الساندويتش ٤', 'زنجر حار', 0, 2),
    ('عرض شير بوكس', 'اختر الساندويتش ٤', 'تشيكن برجر عادي', 30, 3),
    ('عرض شير بوكس', 'اختر الساندويتش ٤', 'تشيكن برجر حار', 30, 4),
    ('عرض ميجا ميل', 'اختر المذاق', 'حار', 0, 1),
    ('عرض ميجا ميل', 'اختر المذاق', 'عادي', 0, 2),
    ('عرض ميجا ميل', 'اختر المذاق', 'مكس', 0, 3),
    ('عرض ٨ قطع بروست', 'اختر المذاق', 'عادي', 0, 1),
    ('عرض ٨ قطع بروست', 'اختر المذاق', 'حار', 0, 2),
    ('عرض ٨ قطع بروست', 'اختر المذاق', 'مكس', 0, 3),
    ('عرض أكيل', 'اختر المذاق', 'عادي', 0, 1),
    ('عرض أكيل', 'اختر المذاق', 'حار', 0, 2),
    ('عرض أكيل', 'اختر المذاق', 'مكس', 0, 3),
    ('عرض دبل', 'اختر الساندويتش ١', 'زنجر عادي', 0, 1),
    ('عرض دبل', 'اختر الساندويتش ١', 'زنجر حار', 0, 2),
    ('عرض دبل', 'اختر الساندويتش ٢', 'زنجر عادي', 0, 1),
    ('عرض دبل', 'اختر الساندويتش ٢', 'زنجر حار', 0, 2),
    ('عرض الكتيبة', 'اختر المذاق', 'عادي', 0, 1),
    ('عرض الكتيبة', 'اختر المذاق', 'حار', 0, 2),
    ('عرض الكتيبة', 'اختر المذاق', 'مكس', 0, 3),
    ('سوبر وصاية', 'اختر المذاق', 'عادي', 0, 1),
    ('سوبر وصاية', 'اختر المذاق', 'حار', 0, 2),
    ('فيليه سوبريم', 'اختر المذاق', 'عادي', 0, 1),
    ('فيليه سوبريم', 'اختر المذاق', 'حار', 0, 2),
    ('تويستر', 'اختر المذاق', 'عادي', 0, 1),
    ('تويستر', 'اختر المذاق', 'حار', 0, 2),
    ('ستربس ١٥ قطعة', 'اختر الصوص/السلطة', 'ثومية كبيرة', 0, 1),
    ('ستربس ١٥ قطعة', 'اختر الصوص/السلطة', 'عادي', 0, 2),
    ('ستربس ١٥ قطعة', 'اختر الصوص/السلطة', 'حار', 0, 3),
    ('ستربس ١٥ قطعة', 'اختر الصوص/السلطة', 'مكس', 0, 4),
    ('عرض ٦ قطع', 'اختر المذاق', 'عادي', 0, 1),
    ('عرض ٦ قطع', 'اختر المذاق', 'حار', 0, 2),
    ('وجبة سناك', 'اختر الصوص/السلطة', 'ثومية كبيرة', 10, 1),
    ('وجبة سناك', 'اختر الصوص/السلطة', 'ثومية صغيرة', 0, 2),
    ('وجبة سناك', 'اختر الصوص/السلطة', 'كول سلو صغير', 0, 3),
    ('وجبة سناك', 'اختر المذاق', 'عادي', 0, 1),
    ('وجبة سناك', 'اختر المذاق', 'حار', 0, 2),
    ('وجبة سناك', 'اختر المذاق', 'مكس', 0, 3),
    ('سوبر دينر', 'اختر الصوص/السلطة', 'ثومية كبيرة', 10, 1),
    ('سوبر دينر', 'اختر الصوص/السلطة', 'ثومية صغيرة', 0, 2),
    ('سوبر دينر', 'اختر الصوص/السلطة', 'كول سلو صغير', 0, 3),
    ('سوبر دينر', 'اختر المذاق', 'عادي', 0, 1),
    ('سوبر دينر', 'اختر المذاق', 'حار', 0, 2),
    ('سوبر دينر', 'اختر المذاق', 'مكس', 0, 3),
    ('ستربس ٣ قطع', 'اختر الصوص/السلطة', 'ثومية كبيرة', 10, 1),
    ('ستربس ٣ قطع', 'اختر الصوص/السلطة', 'ثومية صغيرة', 0, 2),
    ('ستربس ٣ قطع', 'اختر الصوص/السلطة', 'كول سلو صغير', 0, 3),
    ('ستربس ٣ قطع', 'اختر المذاق', 'عادي', 0, 1),
    ('ستربس ٣ قطع', 'اختر المذاق', 'حار', 0, 2),
    ('ستربس ٣ قطع', 'اختر المذاق', 'مكس', 0, 3),
    ('ستربس ٥ قطع', 'اختر الصوص/السلطة', 'ثومية كبيرة', 10, 1),
    ('ستربس ٥ قطع', 'اختر الصوص/السلطة', 'ثومية صغيرة', 0, 2),
    ('ستربس ٥ قطع', 'اختر الصوص/السلطة', 'كول سلو صغير', 0, 3),
    ('ستربس ٥ قطع', 'اختر المذاق', 'عادي', 0, 1),
    ('ستربس ٥ قطع', 'اختر المذاق', 'حار', 0, 2),
    ('ستربس ٥ قطع', 'اختر المذاق', 'مكس', 0, 3),
    ('وجبة أطفال', 'اختر النوع', 'بونلس', 0, 1),
    ('وجبة أطفال', 'اختر النوع', 'ستربس', 0, 2),
    ('ستربس ٧ قطع', 'اختر الصوص/السلطة', 'ثومية كبيرة', 15, 1),
    ('ستربس ٧ قطع', 'اختر الصوص/السلطة', 'ثومية صغيرة', 0, 2),
    ('ستربس ٧ قطع', 'اختر الصوص/السلطة', 'كول سلو صغير', 0, 3),
    ('ستربس ٧ قطع', 'اختر المذاق', 'عادي', 0, 1),
    ('ستربس ٧ قطع', 'اختر المذاق', 'حار', 0, 2),
    ('ستربس ٧ قطع', 'اختر المذاق', 'مكس', 0, 3),
    ('سناك بلس', 'اختر الصوص/السلطة', 'ثومية كبيرة', 10, 1),
    ('سناك بلس', 'اختر الصوص/السلطة', 'كول سلو كبير', 10, 2),
    ('سناك بلس', 'اختر الصوص/السلطة', 'كول سلو صغير', 0, 3),
    ('سناك بلس', 'اختر المذاق', 'عادي', 0, 1),
    ('سناك بلس', 'اختر المذاق', 'حار', 0, 2),
    ('سناك بلس', 'اختر المذاق', 'مكس', 0, 3),
    ('وجبة دينر', 'اختر الصوص/السلطة', 'كول سلو صغير', 0, 1),
    ('وجبة دينر', 'اختر الصوص/السلطة', 'كول سلو كبير', 15, 2),
    ('وجبة دينر', 'اختر الصوص/السلطة', 'ثومية صغيرة', 0, 3),
    ('وجبة دينر', 'اختر الصوص/السلطة', 'ثومية كبيرة', 15, 4),
    ('وجبة دينر', 'اختر الصوص/السلطة', 'كومبو', 50, 5),
    ('وجبة دينر', 'اختر المذاق', 'عادي', 0, 1),
    ('وجبة دينر', 'اختر المذاق', 'حار', 0, 2),
    ('ريزو', 'اختر المذاق', 'عادي', 0, 1),
    ('ريزو', 'اختر المذاق', 'حار', 0, 2),
    ('ريزو', 'اختر المذاق', 'مكس', 0, 3),
    ('ريزو دبل شيدر', 'اختر المذاق', 'عادي', 0, 1),
    ('ريزو دبل شيدر', 'اختر المذاق', 'حار', 0, 2),
    ('ريزو دبل شيدر', 'اختر المذاق', 'مكس', 0, 3)
  ) as seed(item_name, group_name, label, price_delta, sort);

  create temporary table wesaya_modifier_seed on commit drop as
  select * from (values
('شريحة شيدر', 10, 'إضافات'),
    ('هالبينو', 10, 'إضافات'),
    ('كومبو', 60, 'إضافات'),
    ('كومبو', 50, 'إضافات')
  ) as seed(name, price_impact, category);

  create temporary table wesaya_item_modifier_seed on commit drop as
  select * from (values
('فيليه سوبريم', 'شريحة شيدر', 10),
    ('فيليه سوبريم', 'هالبينو', 10),
    ('فيليه سوبريم', 'كومبو', 60),
    ('تويستر', 'كومبو', 50),
    ('تويستر', 'شريحة شيدر', 10),
    ('تويستر', 'هالبينو', 10)
  ) as seed(item_name, modifier_name, price_impact);

  insert into public.branches (restaurant_id, name, phone, hours, notes, active)
  select r_id, seed.name, '01007636322', '{"text":"24/7"}'::jsonb, 'يعمل ٢٤ ساعة', true
  from (values ('فرع الهرم'), ('فرع الهرم (-1)')) as seed(name)
  where not exists (select 1 from public.branches b where b.restaurant_id = r_id and b.name = seed.name);

  update public.branches set phone = '01007636322', hours = '{"text":"24/7"}'::jsonb, notes = 'يعمل ٢٤ ساعة', active = true
  where restaurant_id = r_id and name in ('فرع الهرم', 'فرع الهرم (-1)');

  insert into public.menu_categories (restaurant_id, name, sort)
  select r_id, seed.name, seed.sort
  from wesaya_category_seed seed
  where not exists (select 1 from public.menu_categories c where c.restaurant_id = r_id and c.name = seed.name);

  update public.menu_categories c set sort = seed.sort
  from wesaya_category_seed seed
  where c.restaurant_id = r_id and c.name = seed.name;

  insert into public.menu_items (restaurant_id, category_id, name, name_en, description, price, image_url, available, image_kind, image_status)
  select r_id, c.id, seed.name, seed.name_en, seed.description, seed.price, seed.image_url, true, 'real', 'approved'
  from wesaya_item_seed seed
  join public.menu_categories c on c.restaurant_id = r_id and c.name = seed.category_name
  where not exists (select 1 from public.menu_items i where i.restaurant_id = r_id and i.name = seed.name);

  update public.menu_items i
  set category_id = c.id, name_en = seed.name_en, description = seed.description, price = seed.price, image_url = seed.image_url, available = true, image_kind = 'real', image_status = 'approved'
  from wesaya_item_seed seed
  join public.menu_categories c on c.restaurant_id = r_id and c.name = seed.category_name
  where i.restaurant_id = r_id and i.name = seed.name;

  insert into public.menu_item_variants (restaurant_id, item_id, name, price, sort, active)
  select r_id, i.id, seed.variant_name, seed.price, seed.sort, true
  from wesaya_variant_seed seed
  join public.menu_items i on i.restaurant_id = r_id and i.name = seed.item_name
  where not exists (select 1 from public.menu_item_variants v where v.restaurant_id = r_id and v.item_id = i.id and v.name = seed.variant_name);

  update public.menu_item_variants v
  set price = seed.price, sort = seed.sort, active = true
  from wesaya_variant_seed seed
  join public.menu_items i on i.restaurant_id = r_id and i.name = seed.item_name
  where v.restaurant_id = r_id and v.item_id = i.id and v.name = seed.variant_name;

  insert into public.menu_item_choice_groups (restaurant_id, item_id, name, min_select, max_select, sort)
  select r_id, i.id, seed.group_name, seed.min_select, seed.max_select, seed.sort
  from wesaya_choice_group_seed seed
  join public.menu_items i on i.restaurant_id = r_id and i.name = seed.item_name
  where not exists (select 1 from public.menu_item_choice_groups g where g.restaurant_id = r_id and g.item_id = i.id and g.name = seed.group_name);

  update public.menu_item_choice_groups g
  set min_select = seed.min_select, max_select = seed.max_select, sort = seed.sort
  from wesaya_choice_group_seed seed
  join public.menu_items i on i.restaurant_id = r_id and i.name = seed.item_name
  where g.restaurant_id = r_id and g.item_id = i.id and g.name = seed.group_name;

  insert into public.menu_item_choice_options (restaurant_id, group_id, label, price_delta, sort, active)
  select r_id, g.id, seed.label, seed.price_delta, seed.sort, true
  from wesaya_choice_option_seed seed
  join public.menu_items i on i.restaurant_id = r_id and i.name = seed.item_name
  join public.menu_item_choice_groups g on g.restaurant_id = r_id and g.item_id = i.id and g.name = seed.group_name
  where not exists (select 1 from public.menu_item_choice_options o where o.restaurant_id = r_id and o.group_id = g.id and o.label = seed.label);

  update public.menu_item_choice_options o
  set price_delta = seed.price_delta, sort = seed.sort, active = true
  from wesaya_choice_option_seed seed
  join public.menu_items i on i.restaurant_id = r_id and i.name = seed.item_name
  join public.menu_item_choice_groups g on g.restaurant_id = r_id and g.item_id = i.id and g.name = seed.group_name
  where o.restaurant_id = r_id and o.group_id = g.id and o.label = seed.label;

  insert into public.modifiers (restaurant_id, name, price_impact, category, active)
  select r_id, seed.name, seed.price_impact, seed.category, true
  from wesaya_modifier_seed seed
  where not exists (select 1 from public.modifiers m where m.restaurant_id = r_id and m.name = seed.name and m.price_impact = seed.price_impact);

  insert into public.menu_item_modifiers (restaurant_id, item_id, modifier_id)
  select r_id, i.id, m.id
  from wesaya_item_modifier_seed seed
  join public.menu_items i on i.restaurant_id = r_id and i.name = seed.item_name
  join public.modifiers m on m.restaurant_id = r_id and m.name = seed.modifier_name and m.price_impact = seed.price_impact
  where not exists (select 1 from public.menu_item_modifiers im where im.restaurant_id = r_id and im.item_id = i.id and im.modifier_id = m.id);
end $$;
