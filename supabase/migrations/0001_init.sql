-- ============================================================================
-- MaitreAI — Sprint 7 — 0001 schema
-- Full multi-tenant Postgres schema mirroring lib/types.ts and the PRD data
-- model. Every domain row is scoped to a restaurant_id. RLS is added in 0002.
-- ============================================================================

create extension if not exists "pgcrypto";

-- updated_at auto-touch ------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ===========================================================================
-- Tenancy
-- ===========================================================================
create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text default '',
  phone text default '',
  email text default '',
  currency text not null default 'ر.س',
  country text not null default 'SA',
  default_language text not null default 'ar',
  dialect text not null default 'gulf',        -- gulf | egyptian | levantine | maghrebi
  timezone text not null default 'Asia/Riyadh',
  business_type text default '',
  ai_tone jsonb not null default '{}'::jsonb,
  brain_score int not null default 0,
  active boolean not null default true,
  -- Amendment 01 (A4): open/closed master switch + pre-orders
  is_open boolean not null default true,
  closed_message text,
  accept_preorders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Amendment 01 (A5): launch roles are exactly manager | operation
  role text not null default 'manager' check (role in ('manager','operation')),
  branch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);
create index if not exists members_user_idx on public.members(user_id);
create index if not exists members_restaurant_idx on public.members(restaurant_id);

-- ===========================================================================
-- Restaurant brain (config)
-- ===========================================================================
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  address text default '',
  lat double precision,
  lng double precision,
  phone text default '',
  hours jsonb not null default '{}'::jsonb,     -- supports split shifts + prayer pauses
  notes text default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists branches_restaurant_idx on public.branches(restaurant_id);

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_categories_restaurant_idx on public.menu_categories(restaurant_id);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null,
  name text not null,
  name_en text,
  description text default '',
  price numeric(10,2) not null default 0,
  image_url text default '',
  available boolean not null default true,
  ingredients text[] not null default '{}',
  allergens text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists menu_items_restaurant_idx on public.menu_items(restaurant_id);
create index if not exists menu_items_category_idx on public.menu_items(category_id);

create table if not exists public.modifiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  price_impact numeric(10,2) not null default 0,
  category text default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists modifiers_restaurant_idx on public.modifiers(restaurant_id);

create table if not exists public.menu_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  modifier_id uuid not null references public.modifiers(id) on delete cascade,
  unique (item_id, modifier_id)
);
create index if not exists menu_item_modifiers_restaurant_idx on public.menu_item_modifiers(restaurant_id);

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  fee numeric(10,2) not null default 0,
  min_order numeric(10,2) not null default 0,
  eta_minutes int,
  polygon jsonb,                                -- optional geojson
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists delivery_zones_restaurant_idx on public.delivery_zones(restaurant_id);

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  key text not null,                            -- refund | cancellation | delivery | ...
  text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, key)
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  question text not null,
  answer text not null default '',
  category text default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists faqs_restaurant_idx on public.faqs(restaurant_id);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  type text not null default 'discount',        -- combo | discount | bogo
  items jsonb not null default '[]'::jsonb,
  bundle_price numeric(10,2),
  discount_pct numeric(5,2),
  starts_at timestamptz,
  ends_at timestamptz,
  days_of_week int[] not null default '{}',
  active boolean not null default true,
  created_from_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists promotions_restaurant_idx on public.promotions(restaurant_id);

-- ===========================================================================
-- CRM + conversations + orders
-- ===========================================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  phone text not null,
  name text default '',
  language text default 'ar',
  tags text[] not null default '{}',
  notes text default '',
  ltv numeric(12,2) not null default 0,
  orders_count int not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);
create index if not exists customers_restaurant_idx on public.customers(restaurant_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null default 'whatsapp',
  status text not null default 'AI نشط',
  owner text not null default 'ai',             -- ai | human
  assigned_member_id uuid references public.members(id) on delete set null,
  last_intent text,
  confidence numeric(5,2),
  escalation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_restaurant_idx on public.conversations(restaurant_id);
create index if not exists conversations_customer_idx on public.conversations(customer_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null default 'inbound',    -- inbound | outbound
  sender text not null default 'customer',      -- customer | ai | human | system
  text text not null default '',
  channel_message_id text unique,               -- idempotency key (nullable)
  status text not null default 'sent',          -- sent | delivered | read | failed
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages(conversation_id);
create index if not exists messages_restaurant_idx on public.messages(restaurant_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_number text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  fulfillment text not null default 'delivery', -- delivery | pickup
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  currency text not null default 'ر.س',
  -- Amendment 01 (A3): kitchen board removed; status is driven by order_status
  -- transitions (preparing/ready/out_for_delivery/delivered) on the Orders page.
  order_status text not null default 'draft',
  payment_status text not null default 'unpaid',
  address text,
  zone_id uuid references public.delivery_zones(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_restaurant_idx on public.orders(restaurant_id);
create index if not exists orders_conversation_idx on public.orders(conversation_id);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  type text not null,
  label text not null default '',
  actor text not null default 'system',         -- ai | human | system
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events(order_id);

create table if not exists public.payment_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'mock',
  amount numeric(10,2) not null default 0,
  currency text not null default 'ر.س',
  status text not null default 'created',
  link text,
  expires_at timestamptz,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_sessions_order_idx on public.payment_sessions(order_id);

-- ===========================================================================
-- AI observability + onboarding
-- ===========================================================================
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  trigger text not null default 'customer',     -- customer | owner | system
  input text,
  tools_used jsonb not null default '[]'::jsonb,
  output text,
  confidence numeric(5,2),
  latency_ms int,
  tokens int,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists agent_runs_restaurant_idx on public.agent_runs(restaurant_id);
create index if not exists agent_runs_conversation_idx on public.agent_runs(conversation_id);

create table if not exists public.onboarding_state (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  step text not null default 'profile',
  completed_steps jsonb not null default '[]'::jsonb,
  menu_ingest_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id)
);

-- ===========================================================================
-- updated_at triggers
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'restaurants','members','branches','menu_categories','menu_items','modifiers',
    'delivery_zones','policies','faqs','promotions','customers','conversations',
    'orders','payment_sessions','onboarding_state'
  ] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on public.%1$s;
       create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;
