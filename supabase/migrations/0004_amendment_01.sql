-- ============================================================================
-- MaitreAI — Sprint 7 — 0004 Amendment 01 upgrade (idempotent, in-place)
-- For a database that already ran the PRE-amendment 0001-0003. Brings it to the
-- amended schema: roles = manager|operation (A5), restaurants open/closed +
-- pre-orders (A4), and removes orders.kitchen_status (A3). Safe to run more than
-- once. On a truly fresh DB you can instead just run the amended 0001-0003.
-- After this, RE-RUN 0002_rls.sql and 0003_seed.sql (both idempotent) to refresh
-- the role-gated policies and the manager-seeding function.
-- ============================================================================

-- A4: restaurants open/closed master switch + pre-orders -------------------
alter table public.restaurants add column if not exists is_open boolean not null default true;
alter table public.restaurants add column if not exists closed_message text;
alter table public.restaurants add column if not exists accept_preorders boolean not null default false;

-- A3: kitchen board removed → status flows through order_status -------------
alter table public.orders drop column if exists kitchen_status;

-- A5: roles become exactly manager | operation -----------------------------
-- Map any legacy roles, then constrain.
update public.members set role = 'manager'   where role in ('owner', 'manager');
update public.members set role = 'operation' where role = 'staff';
update public.members set role = 'manager'   where role not in ('manager', 'operation');

alter table public.members alter column role set default 'manager';

alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('manager','operation'));
