-- WBE Fresh — initial schema
-- Run this in the Supabase SQL editor, or via `supabase db push`.
--
-- Everything below lives in its own `wbe_fresh` schema, not `public`.
-- This project's Supabase instance already hosts another app (a CRM)
-- with its own `suppliers`, `products`, `users` etc. in `public` —
-- isolating WBE Fresh into its own schema means zero risk of name
-- collisions or accidental cross-reads between the two apps, now or
-- as either one evolves. `auth.users` (Supabase Auth) is the one
-- thing genuinely shared across the whole project, which is fine —
-- that's project-wide infrastructure, not CRM data.

-- ────────────────────────────────────────────────────────────
-- Schema + extensions
-- ────────────────────────────────────────────────────────────
create schema if not exists wbe_fresh;

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- Enums
-- ────────────────────────────────────────────────────────────
create type wbe_fresh.user_role as enum ('ADMIN', 'SUPPLIER');

-- ────────────────────────────────────────────────────────────
-- profiles
-- Mirrors auth.users (Supabase Auth) with app-specific fields.
-- One row per login-capable user (admin or supplier).
-- ────────────────────────────────────────────────────────────
create table wbe_fresh.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text not null unique,
  role wbe_fresh.user_role not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- suppliers
-- Business profile for a supplier, 1:1 with a profiles row of role SUPPLIER.
-- Kept separate from `profiles` so admin can edit business details
-- (contact person, phone) without touching auth-related fields.
--
-- Named wbe_fresh.suppliers, distinct from the CRM's public.suppliers
-- — same name, different schema, no collision, no relation to each
-- other. If you ever want them related (e.g. a CRM supplier is also
-- a WBE Fresh supplier), that's a deliberate future integration, not
-- something this migration assumes.
-- ────────────────────────────────────────────────────────────
create table wbe_fresh.suppliers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references wbe_fresh.profiles(id) on delete cascade,
  business_name text not null,
  contact_person text,
  phone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- vegetables
-- ────────────────────────────────────────────────────────────
create table wbe_fresh.vegetables (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null check (unit in ('KG', 'Piece', 'Box', 'Bundle')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- daily_prices
-- One row per (vegetable, price_date) — the "current" row for today.
-- final_price is generated, never stored independently, so it can
-- never drift from updated_price + margin.
-- ────────────────────────────────────────────────────────────
create table wbe_fresh.daily_prices (
  id uuid primary key default gen_random_uuid(),
  vegetable_id uuid not null references wbe_fresh.vegetables(id) on delete cascade,
  updated_price numeric(10,2) not null default 0,
  margin numeric(10,2) not null default 0,
  final_price numeric(10,2) generated always as (updated_price + margin) stored,
  price_date date not null default current_date,
  updated_at timestamptz not null default now(),
  updated_by uuid references wbe_fresh.profiles(id),
  unique (vegetable_id, price_date)
);

-- ────────────────────────────────────────────────────────────
-- daily_order_quantities
-- One row per (vegetable, order_date) — quantity admin needs today.
-- ────────────────────────────────────────────────────────────
create table wbe_fresh.daily_order_quantities (
  id uuid primary key default gen_random_uuid(),
  vegetable_id uuid not null references wbe_fresh.vegetables(id) on delete cascade,
  quantity numeric(10,2) not null default 0,
  unit text not null,
  order_date date not null default current_date,
  updated_at timestamptz not null default now(),
  updated_by uuid references wbe_fresh.profiles(id),
  unique (vegetable_id, order_date)
);

-- ────────────────────────────────────────────────────────────
-- price_history
-- Append-only log. Every save to daily_prices inserts a row here
-- via trigger, so history is never hand-maintained by app code and
-- can't drift from what was actually saved.
-- ────────────────────────────────────────────────────────────
create table wbe_fresh.price_history (
  id uuid primary key default gen_random_uuid(),
  vegetable_id uuid not null references wbe_fresh.vegetables(id) on delete cascade,
  updated_price numeric(10,2) not null,
  margin numeric(10,2) not null,
  final_price numeric(10,2) not null,
  price_date date not null,
  recorded_at timestamptz not null default now(),
  updated_by uuid references wbe_fresh.profiles(id),
  updated_by_role wbe_fresh.user_role
);

create index price_history_veg_date_idx on wbe_fresh.price_history (vegetable_id, price_date desc);

-- ────────────────────────────────────────────────────────────
-- Trigger: mirror every daily_prices insert/update into price_history
-- ────────────────────────────────────────────────────────────
create or replace function wbe_fresh.log_price_history() returns trigger as $$
declare
  actor_role wbe_fresh.user_role;
begin
  select role into actor_role from wbe_fresh.profiles where id = new.updated_by;
  insert into wbe_fresh.price_history (vegetable_id, updated_price, margin, final_price, price_date, updated_by, updated_by_role)
  values (new.vegetable_id, new.updated_price, new.margin, new.final_price, new.price_date, new.updated_by, actor_role);
  return new;
end;
$$ language plpgsql security definer set search_path = wbe_fresh, pg_temp;

create trigger daily_prices_history
  after insert or update of updated_price, margin on wbe_fresh.daily_prices
  for each row execute function wbe_fresh.log_price_history();

-- ────────────────────────────────────────────────────────────
-- updated_at maintenance
-- ────────────────────────────────────────────────────────────
create or replace function wbe_fresh.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = wbe_fresh, pg_temp;

create trigger profiles_updated_at before update on wbe_fresh.profiles for each row execute function wbe_fresh.set_updated_at();
create trigger suppliers_updated_at before update on wbe_fresh.suppliers for each row execute function wbe_fresh.set_updated_at();
create trigger vegetables_updated_at before update on wbe_fresh.vegetables for each row execute function wbe_fresh.set_updated_at();
create trigger daily_prices_updated_at before update on wbe_fresh.daily_prices for each row execute function wbe_fresh.set_updated_at();
create trigger quantities_updated_at before update on wbe_fresh.daily_order_quantities for each row execute function wbe_fresh.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────
alter table wbe_fresh.profiles enable row level security;
alter table wbe_fresh.suppliers enable row level security;
alter table wbe_fresh.vegetables enable row level security;
alter table wbe_fresh.daily_prices enable row level security;
alter table wbe_fresh.daily_order_quantities enable row level security;
alter table wbe_fresh.price_history enable row level security;

-- Helper: is the current auth user an admin?
create or replace function wbe_fresh.is_admin() returns boolean as $$
  select exists (
    select 1 from wbe_fresh.profiles where id = auth.uid() and role = 'ADMIN' and status = 'ACTIVE'
  );
$$ language sql security definer stable set search_path = wbe_fresh, pg_temp;

-- profiles: admins see everyone; suppliers see only themselves
create policy profiles_select on wbe_fresh.profiles for select
  using (wbe_fresh.is_admin() or id = auth.uid());
create policy profiles_admin_write on wbe_fresh.profiles for all
  using (wbe_fresh.is_admin()) with check (wbe_fresh.is_admin());

-- suppliers: admins manage all; a supplier can read (not write) their own row
create policy suppliers_admin_all on wbe_fresh.suppliers for all
  using (wbe_fresh.is_admin()) with check (wbe_fresh.is_admin());
create policy suppliers_self_read on wbe_fresh.suppliers for select
  using (profile_id = auth.uid());

-- vegetables: admins manage; readable by anyone, including anon.
-- Unlike daily_prices, nothing on this table (name/unit/status) is
-- sensitive, so a plain anon-readable policy is fine here — no
-- column-level trick needed. (The public /prices page still goes
-- through app/api/public/prices rather than querying this table
-- directly, purely so all public-page data comes from one place;
-- it isn't compensating for anything this policy leaks.)
create policy vegetables_admin_write on wbe_fresh.vegetables for all
  using (wbe_fresh.is_admin()) with check (wbe_fresh.is_admin());
create policy vegetables_read on wbe_fresh.vegetables for select
  using (true);

-- daily_prices: admins full access; suppliers can insert/update
-- today's row only (their own price contribution is merged by admin);
-- price_date must be today for supplier writes.
create policy daily_prices_admin_all on wbe_fresh.daily_prices for all
  using (wbe_fresh.is_admin()) with check (wbe_fresh.is_admin());
create policy daily_prices_supplier_write on wbe_fresh.daily_prices for insert
  with check (
    exists (select 1 from wbe_fresh.profiles where id = auth.uid() and role = 'SUPPLIER' and status = 'ACTIVE')
    and price_date = current_date
  );
create policy daily_prices_supplier_update on wbe_fresh.daily_prices for update
  using (
    exists (select 1 from wbe_fresh.profiles where id = auth.uid() and role = 'SUPPLIER' and status = 'ACTIVE')
    and price_date = current_date
  );

-- SELECT on the base table is admin-only. RLS is row-level, not
-- column-level, so a "read" policy that let suppliers select rows
-- would let them select margin too — there's no policy clause that
-- hides one column while showing another on the same row. Suppliers
-- read prices through the supplier_prices_view below instead, which
-- omits margin and final_price at the view definition, not at query
-- time. (The app's /api/supplier/prices upsert route still needs to
-- read `margin` on the existing row before an update, but it does
-- that with the admin/service-role client server-side — see that
-- route's comments — never with the supplier's own anon-key session.)
create policy daily_prices_read_admin on wbe_fresh.daily_prices for select
  using (wbe_fresh.is_admin());

-- Supplier-safe read surface: updated_price only, never margin or
-- final_price. security_invoker=off (the default for views) means
-- this view runs with the view owner's privileges, so it can read
-- daily_prices even though the supplier's own role has no SELECT
-- policy on that table — the column list below is what actually
-- keeps margin out, not RLS.
create view wbe_fresh.supplier_prices_view as
  select vegetable_id, updated_price, price_date, updated_at
  from wbe_fresh.daily_prices;

grant select on wbe_fresh.supplier_prices_view to authenticated;

-- daily_order_quantities: admin-only read/write from the client;
-- suppliers read via the API route (needs qty but not to edit it)
create policy quantities_admin_all on wbe_fresh.daily_order_quantities for all
  using (wbe_fresh.is_admin()) with check (wbe_fresh.is_admin());
create policy quantities_supplier_read on wbe_fresh.daily_order_quantities for select
  using (exists (select 1 from wbe_fresh.profiles where id = auth.uid() and role = 'SUPPLIER'));

-- price_history: same column-secrecy problem as daily_prices — admin
-- can read everything (including margin); suppliers get a view that
-- omits margin/final_price. Writes only ever happen via the
-- daily_prices_history trigger (security definer), never directly.
create policy price_history_read_admin on wbe_fresh.price_history for select
  using (wbe_fresh.is_admin());

create view wbe_fresh.supplier_price_history_view as
  select vegetable_id, updated_price, price_date, recorded_at, updated_by, updated_by_role
  from wbe_fresh.price_history;

grant select on wbe_fresh.supplier_price_history_view to authenticated;

-- ────────────────────────────────────────────────────────────
-- Expose the schema to Supabase's PostgREST API layer
-- ────────────────────────────────────────────────────────────
-- By default, Supabase's data API (what supabase-js talks to) only
-- serves the `public` schema. A custom schema needs explicit grants
-- AND to be added to Data API settings before the app can reach it.
--
-- After running this migration, go to:
--   Supabase dashboard → Project Settings → Data API
--   → "Exposed schemas" → add `wbe_fresh` → Save
--
-- Without that step, every supabase-js call from the app will fail
-- with something like "The schema must be one of the following:
-- public, graphql_public" even though the tables exist and these
-- grants are correct.
grant usage on schema wbe_fresh to authenticated, anon, service_role;
grant all on all tables in schema wbe_fresh to authenticated, anon, service_role;
grant all on all sequences in schema wbe_fresh to authenticated, anon, service_role;
grant execute on all functions in schema wbe_fresh to authenticated, anon, service_role;

alter default privileges in schema wbe_fresh grant all on tables to authenticated, anon, service_role;
alter default privileges in schema wbe_fresh grant all on sequences to authenticated, anon, service_role;
alter default privileges in schema wbe_fresh grant execute on functions to authenticated, anon, service_role;

-- Note: these grants set the ceiling; RLS policies above are what
-- actually restrict what each role can do within that ceiling. This
-- is the same "grant broadly, let RLS narrow it" pattern Supabase
-- uses for the public schema by default.
