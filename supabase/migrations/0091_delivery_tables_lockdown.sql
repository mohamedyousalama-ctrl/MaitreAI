-- ============================================================================
-- PREPARE-ONLY — NOT applied to production. Application is a founder ceremony.
-- Locks drivers/deliveries/delivery_locations/delivery_events to member-read-only;
-- writes flow through server-only lib/db/delivery.ts. Mirrors 0041.
-- ============================================================================

-- drivers: preserve the existing tenant qualifier, remove member write access.
alter table public.drivers enable row level security;
drop policy if exists drivers_rw on public.drivers;
drop policy if exists drivers_read on public.drivers;
create policy drivers_read on public.drivers
  for select using (public.is_member_of(restaurant_id));

-- deliveries: preserve the existing tenant qualifier, remove member write access.
alter table public.deliveries enable row level security;
drop policy if exists deliveries_rw on public.deliveries;
drop policy if exists deliveries_read on public.deliveries;
create policy deliveries_read on public.deliveries
  for select using (public.is_member_of(restaurant_id));

-- delivery_locations: preserve the existing parent-delivery qualifier verbatim.
alter table public.delivery_locations enable row level security;
drop policy if exists delivery_locations_rw on public.delivery_locations;
drop policy if exists delivery_locations_read on public.delivery_locations;
create policy delivery_locations_read on public.delivery_locations
  for select using (exists (select 1 from public.deliveries d where d.id = delivery_id and public.is_member_of(d.restaurant_id)));

-- delivery_events: preserve the existing parent-delivery qualifier verbatim.
alter table public.delivery_events enable row level security;
drop policy if exists delivery_events_rw on public.delivery_events;
drop policy if exists delivery_events_read on public.delivery_events;
create policy delivery_events_read on public.delivery_events
  for select using (exists (select 1 from public.deliveries d where d.id = delivery_id and public.is_member_of(d.restaurant_id)));

notify pgrst, 'reload schema';