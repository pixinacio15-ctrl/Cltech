
-- CLTECH Aurora Transfer Manager
create table if not exists public.aurora_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  path text,
  title text,
  user_id uuid references public.profiles(id) on delete set null,
  data jsonb not null default '{}',
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_order_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null,
  title text,
  status text not null default 'open',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_account_products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  section text not null,
  price_cents integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_account_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_code text not null,
  product_slug text not null,
  account_ref text,
  delivery_status text not null default 'pending',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_maintenance_visits (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  phone text not null,
  city text not null default 'São Paulo',
  district text,
  address text,
  visit_date date,
  period text,
  problem text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_support_messages (
  id uuid primary key default gen_random_uuid(),
  order_code text,
  group_name text,
  answer text,
  message text,
  source text not null default 'guided',
  created_at timestamptz not null default now()
);

create table if not exists public.aurora_admin_approvals (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  area text not null,
  change text not null,
  admin_name text,
  owner_note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

insert into public.aurora_account_products(slug,title,section,price_cents) values
('blox-fruits-level-max','Conta Blox Fruits Level Max','Contas Blox Fruits',2990),
('blox-fruits-raca-v4','Conta com Raça V4','Contas Blox Fruits',4990),
('blox-fruits-godhuman-cdk','Conta Godhuman + CDK','Contas Blox Fruits',6990),
('blox-fruits-fruta-mitica','Conta com Fruta Mítica','Contas Blox Fruits',8990),
('conta-premium-personalizada','Conta Premium Personalizada','Contas Premium',12990)
on conflict (slug) do update set title=excluded.title, section=excluded.section, price_cents=excluded.price_cents, active=true;

alter table public.aurora_events enable row level security;
alter table public.aurora_order_codes enable row level security;
alter table public.aurora_account_products enable row level security;
alter table public.aurora_account_deliveries enable row level security;
alter table public.aurora_maintenance_visits enable row level security;
alter table public.aurora_support_messages enable row level security;
alter table public.aurora_admin_approvals enable row level security;

drop policy if exists "aurora products public" on public.aurora_account_products;
create policy "aurora products public" on public.aurora_account_products for select using (active=true or public.is_staff());

drop policy if exists "aurora staff all events" on public.aurora_events;
create policy "aurora staff all events" on public.aurora_events for select using (public.is_staff());

drop policy if exists "aurora staff all codes" on public.aurora_order_codes;
create policy "aurora staff all codes" on public.aurora_order_codes for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "aurora staff deliveries" on public.aurora_account_deliveries;
create policy "aurora staff deliveries" on public.aurora_account_deliveries for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "aurora staff visits" on public.aurora_maintenance_visits;
create policy "aurora staff visits" on public.aurora_maintenance_visits for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "aurora staff support" on public.aurora_support_messages;
create policy "aurora staff support" on public.aurora_support_messages for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "aurora owner approvals" on public.aurora_admin_approvals;
create policy "aurora owner approvals" on public.aurora_admin_approvals for all using (public.is_staff()) with check (public.is_staff());
