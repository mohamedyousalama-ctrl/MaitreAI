-- ============================================================================
-- MaitreAI — Sprint 7 Pass 2 — 0007 server-side "استعادة الافتراضي"
-- reset_restaurant(p_restaurant_id) wipes the tenant's brain config and re-seeds
-- the مطعم الذواقة defaults INTO THE SAME restaurant (keeps the id, membership,
-- conversations and orders). SECURITY DEFINER, but authorizes the caller as a
-- MANAGER of that restaurant before doing anything.
-- ============================================================================

create or replace function public.reset_restaurant(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r_id uuid := p_restaurant_id;
  b_yasmin uuid; b_olaya uuid;
  c_burger uuid; c_sides uuid; c_drinks uuid; c_meals uuid; c_sweets uuid;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid;
  mod_cheese uuid; mod_noonion uuid; mod_spicy uuid; mod_large uuid;
begin
  -- Authorize: caller must be a manager of this restaurant -------------------
  if not exists (
    select 1 from public.members
    where restaurant_id = r_id and user_id = auth.uid() and role = 'manager'
  ) then
    raise exception 'not authorized to reset this restaurant';
  end if;

  -- Wipe brain config (FK-safe order; orders/conversations untouched) --------
  delete from public.menu_item_modifiers where restaurant_id = r_id;
  delete from public.menu_items          where restaurant_id = r_id;
  delete from public.menu_categories     where restaurant_id = r_id;
  delete from public.modifiers           where restaurant_id = r_id;
  delete from public.delivery_zones      where restaurant_id = r_id;
  delete from public.branches            where restaurant_id = r_id;
  delete from public.policies            where restaurant_id = r_id;
  delete from public.faqs                where restaurant_id = r_id;

  -- Reset profile + persona to demo defaults --------------------------------
  update public.restaurants set
    name = 'مطعم الذواقة', phone = '+966 50 123 4567', email = 'info@aldhawaqah.sa',
    currency = 'ر.س', country = 'SA', default_language = 'ar', dialect = 'saudi',
    timezone = 'Asia/Riyadh', business_type = 'مطعم وجبات سريعة', brain_score = 82,
    is_open = true, accept_preorders = false, closed_message = null,
    ai_tone = jsonb_build_object('personality','friendly','responseLength','medium',
      'emojiUsage','minimal','language','ar',
      'greeting','أهلاً بك في مطعم الذواقة 🌟 كيف أقدر أخدمك اليوم؟')
  where id = r_id;

  -- Branches ----------------------------------------------------------------
  insert into public.branches (restaurant_id, name, address, phone, hours, active)
  values (r_id, 'فرع الياسمين', 'حي الياسمين، الرياض', '+966 11 234 5678',
      '{"sun_thu":"12:00-00:00","fri":"13:00-01:00","sat":"12:00-00:00"}'::jsonb, true)
  returning id into b_yasmin;
  insert into public.branches (restaurant_id, name, address, phone, hours, active)
  values (r_id, 'فرع العليا', 'حي العليا، الرياض', '+966 11 345 6789',
      '{"sun_thu":"12:00-00:00","fri":"13:00-01:00","sat":"12:00-00:00"}'::jsonb, true)
  returning id into b_olaya;

  -- Categories --------------------------------------------------------------
  insert into public.menu_categories (restaurant_id, name, sort) values (r_id,'برجر',1) returning id into c_burger;
  insert into public.menu_categories (restaurant_id, name, sort) values (r_id,'مقبلات',2) returning id into c_sides;
  insert into public.menu_categories (restaurant_id, name, sort) values (r_id,'مشروبات',3) returning id into c_drinks;
  insert into public.menu_categories (restaurant_id, name, sort) values (r_id,'وجبات',4) returning id into c_meals;
  insert into public.menu_categories (restaurant_id, name, sort) values (r_id,'حلويات',5) returning id into c_sweets;

  -- Modifiers ---------------------------------------------------------------
  insert into public.modifiers (restaurant_id, name, price_impact, category, active)
    values (r_id,'جبنة إضافية',5,'إضافات',true) returning id into mod_cheese;
  insert into public.modifiers (restaurant_id, name, price_impact, category, active)
    values (r_id,'بدون بصل',0,'تعديلات',true) returning id into mod_noonion;
  insert into public.modifiers (restaurant_id, name, price_impact, category, active)
    values (r_id,'حار',0,'تعديلات',true) returning id into mod_spicy;
  insert into public.modifiers (restaurant_id, name, price_impact, category, active)
    values (r_id,'حجم كبير',3,'خيارات',true) returning id into mod_large;

  -- Menu items --------------------------------------------------------------
  insert into public.menu_items (restaurant_id, category_id, name, price, available, description, ingredients, allergens)
    values (r_id, c_burger, 'برجر كلاسيك', 32, true, 'لحم بقري طازج مع جبنة شيدر وصلصة الذواقة الخاصة',
      array['لحم بقري','جبنة شيدر','خس','طماطم','صلصة خاصة'], array['جلوتين','ألبان']) returning id into m1;
  insert into public.menu_items (restaurant_id, category_id, name, price, available, description, ingredients, allergens)
    values (r_id, c_burger, 'برجر دجاج حار', 30, true, 'صدر دجاج مقرمش بنكهة حارة مع مايونيز الثوم',
      array['دجاج','بهارات حارة','مايونيز ثوم','مخلل'], array['جلوتين','بيض']) returning id into m2;
  insert into public.menu_items (restaurant_id, category_id, name, price, available, description, ingredients, allergens)
    values (r_id, c_sides, 'بطاطس كبيرة', 15, true, 'بطاطس مقلية ذهبية مقرمشة',
      array['بطاطس','زيت','ملح'], array[]::text[]) returning id into m3;
  insert into public.menu_items (restaurant_id, category_id, name, price, available, description, ingredients, allergens)
    values (r_id, c_drinks, 'كولا', 6, true, 'مشروب غازي بارد', array['مشروب غازي'], array[]::text[]) returning id into m4;
  insert into public.menu_items (restaurant_id, category_id, name, price, available, description, ingredients, allergens)
    values (r_id, c_meals, 'وجبة العائلة', 145, true, '4 برجر + 2 بطاطس كبيرة + 4 مشروبات + حلى',
      array['برجر','بطاطس','مشروبات','حلى'], array['جلوتين','ألبان']) returning id into m5;
  insert into public.menu_items (restaurant_id, category_id, name, price, available, description, ingredients, allergens)
    values (r_id, c_sweets, 'كنافة', 25, false, 'كنافة بالجبن مع القطر والفستق',
      array['عجينة كنافة','جبنة','قطر','فستق'], array['جلوتين','ألبان','مكسرات']) returning id into m6;

  insert into public.menu_item_modifiers (restaurant_id, item_id, modifier_id) values
    (r_id, m1, mod_cheese), (r_id, m1, mod_noonion), (r_id, m1, mod_spicy),
    (r_id, m2, mod_spicy), (r_id, m2, mod_cheese),
    (r_id, m3, mod_large), (r_id, m4, mod_large);

  -- Delivery zones ----------------------------------------------------------
  insert into public.delivery_zones (restaurant_id, branch_id, name, fee, min_order, eta_minutes, active) values
    (r_id, b_yasmin, 'الياسمين', 10, 30, 40, true),
    (r_id, b_yasmin, 'النرجس', 12, 30, 45, true),
    (r_id, b_olaya, 'العليا', 10, 30, 35, true);

  -- Policies ----------------------------------------------------------------
  insert into public.policies (restaurant_id, key, text) values
    (r_id, 'refund', 'يمكن استرجاع المبلغ خلال 24 ساعة إذا لم يبدأ تحضير الطلب.'),
    (r_id, 'cancellation', 'يمكن إلغاء الطلب قبل دخوله مرحلة التحضير.'),
    (r_id, 'delivery', 'التوصيل متاح داخل المناطق المحددة فقط، وتختلف الرسوم حسب المنطقة.'),
    (r_id, 'payment', 'نقبل الدفع عند الاستلام والبطاقات وروابط الدفع الإلكتروني.');

  -- FAQs --------------------------------------------------------------------
  insert into public.faqs (restaurant_id, question, answer, active) values
    (r_id, 'وش أوقات العمل؟', 'نعمل يومياً من 12 ظهراً حتى منتصف الليل، والجمعة من 1 ظهراً.', true),
    (r_id, 'هل يوجد توصيل؟', 'نعم، نوصل لحي الياسمين والنرجس والعليا.', true);
end;
$$;

grant execute on function public.reset_restaurant(uuid) to authenticated;
