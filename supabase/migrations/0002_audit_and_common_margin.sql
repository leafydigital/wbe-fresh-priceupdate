-- WBE Fresh — audit logging + global common margin
-- Run this in the Supabase SQL editor, or via `supabase db push`.
-- Depends on 0001_init.sql having already run.

-- ────────────────────────────────────────────────────────────
-- app_settings — single-row-per-key config store.
-- Used for exactly one thing right now: the global common margin.
-- key/value are both text so this table can hold future settings
-- without a schema change; the app parses 'common_margin' as numeric.
-- ────────────────────────────────────────────────────────────
create table wbe_fresh.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into wbe_fresh.app_settings (key, value) values ('common_margin', '0');

create trigger app_settings_updated_at before update on wbe_fresh.app_settings
  for each row execute function wbe_fresh.set_updated_at();

alter table wbe_fresh.app_settings enable row level security;

-- Admin-only, both read and write. Suppliers never see the raw
-- margin value (spec requirement 23) — anywhere a supplier-facing
-- route needs final_price, it's computed server-side with the
-- admin/service client, the same pattern already used for
-- supplier_prices_view's margin secrecy.
create policy app_settings_admin_all on wbe_fresh.app_settings for all
  using (wbe_fresh.is_admin()) with check (wbe_fresh.is_admin());

-- ────────────────────────────────────────────────────────────
-- audit_logs — permanent, insert-only change log.
-- Distinct from price_history: price_history is "what was the
-- public price on day X" (7-day rolling); audit_logs is "who changed
-- what, when, forever." Neither table is derived from the other.
-- ────────────────────────────────────────────────────────────
create table wbe_fresh.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('price', 'order_quantity', 'margin', 'vegetable', 'supplier')),
  entity_id uuid, -- null for entity_type = 'margin' (margin is global, not tied to one row)
  action text not null check (action in ('create', 'update', 'delete')),
  field_name text,
  old_value text,
  new_value text,
  changed_by uuid not null references auth.users(id),
  changed_by_role wbe_fresh.user_role not null,
  changed_at timestamptz not null default now()
);

create index audit_logs_entity_idx on wbe_fresh.audit_logs (entity_type, entity_id);
create index audit_logs_changed_by_idx on wbe_fresh.audit_logs (changed_by);
create index audit_logs_changed_at_idx on wbe_fresh.audit_logs (changed_at desc);

alter table wbe_fresh.audit_logs enable row level security;

-- changed_by references auth.users directly, not wbe_fresh.profiles
-- — so an audit row survives even if the profile row is later
-- deleted (e.g. a supplier hard-deleted from auth entirely).
-- changed_by_role is captured at write time and never updated, so
-- audit rows stay self-contained and don't depend on what profiles
-- says about that user right now.

-- Admin sees everything.
create policy audit_logs_admin_read on wbe_fresh.audit_logs for select
  using (wbe_fresh.is_admin());

-- Suppliers see only their own price-change history — nothing about
-- margin, vegetables, suppliers, or other suppliers' changes.
create policy audit_logs_supplier_read_own_prices on wbe_fresh.audit_logs for select
  using (
    entity_type = 'price'
    and changed_by = auth.uid()
    and exists (select 1 from wbe_fresh.profiles where id = auth.uid() and role = 'SUPPLIER')
  );

-- Insert-only for everyone, always as the caller's own identity.
-- There is deliberately no UPDATE or DELETE policy on this table —
-- audit rows can never be edited or removed by any role, including
-- admin, through the API. (A superuser could still do it directly
-- in the database, but the app has no path to it.)
create policy audit_logs_insert_own on wbe_fresh.audit_logs for insert
  with check (changed_by = auth.uid());

grant select, insert on wbe_fresh.audit_logs to authenticated;
grant select, insert on wbe_fresh.app_settings to authenticated;

-- ────────────────────────────────────────────────────────────
-- Supplier phone: exactly 10 digits, enforced at the database level
-- too (spec requirement 12 — not only frontend/Zod validation).
-- ────────────────────────────────────────────────────────────
alter table wbe_fresh.suppliers
  add constraint suppliers_phone_format check (phone is null or phone ~ '^[0-9]{10}$');

-- ────────────────────────────────────────────────────────────
-- Margin becomes global: drop the per-row margin/final_price columns
-- from daily_prices and price_history.
--
-- The old daily_prices_history trigger (from 0001_init.sql) fires
-- "after update of updated_price, margin" — Postgres tracks that as
-- a real dependency on the margin column, so the column can't be
-- dropped while that trigger still exists. Drop the trigger (and its
-- function, since the function body is about to change anyway)
-- FIRST, before touching any columns, then recreate both afterward.
--
-- final_price can no longer be a Postgres GENERATED column, because
-- generated columns can only reference other columns on the SAME
-- row — they cannot look up app_settings.common_margin in another
-- table. final_price is therefore now an ordinary column that the
-- application computes and writes explicitly (updated_price + the
-- current common margin) every time a price is saved. This is a
-- deliberate trade-off: we lose the database's automatic
-- "can never drift" guarantee for this one column, in exchange for
-- the margin being genuinely global rather than duplicated on every
-- row. If final_price is ever suspected to have drifted (e.g. after
-- a manual DB edit), re-running POST /api/admin/settings/margin with
-- the current margin value recomputes every one of today's rows.
-- ────────────────────────────────────────────────────────────
drop trigger if exists daily_prices_history on wbe_fresh.daily_prices;
drop function if exists wbe_fresh.log_price_history();

alter table wbe_fresh.daily_prices drop column final_price;
alter table wbe_fresh.daily_prices drop column margin;
alter table wbe_fresh.daily_prices add column final_price numeric(10,2) not null default 0;

alter table wbe_fresh.price_history drop column margin;
-- price_history.final_price stays — it's still meaningful, just no
-- longer decomposed into updated_price + margin on that table. Each
-- price_history row already captures point-in-time final_price as
-- it existed at that moment, which is exactly right: if the common
-- margin changes later, historical rows must NOT retroactively change.

-- ────────────────────────────────────────────────────────────
-- Recreate the price-history trigger: no more margin column to read
-- off the daily_prices row. final_price is already computed by the
-- application before the row is written, so the trigger just copies
-- it forward — it does not recompute anything.
-- ────────────────────────────────────────────────────────────
create function wbe_fresh.log_price_history() returns trigger as $$
begin
  insert into wbe_fresh.price_history (vegetable_id, updated_price, final_price, price_date, updated_by, updated_by_role)
  values (
    new.vegetable_id,
    new.updated_price,
    new.final_price,
    new.price_date,
    new.updated_by,
    (select role from wbe_fresh.profiles where id = new.updated_by)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = wbe_fresh, pg_temp;

create trigger daily_prices_history
  after insert or update of updated_price, final_price on wbe_fresh.daily_prices
  for each row execute function wbe_fresh.log_price_history();

-- ────────────────────────────────────────────────────────────
-- supplier_prices_view and supplier_price_history_view: recreate
-- without margin (the column is gone from the base tables, so these
-- views must be dropped and recreated rather than just altered —
-- Postgres does not support ALTER VIEW ... DROP COLUMN).
-- ────────────────────────────────────────────────────────────
drop view if exists wbe_fresh.supplier_prices_view;
create view wbe_fresh.supplier_prices_view as
  select vegetable_id, updated_price, price_date, updated_at
  from wbe_fresh.daily_prices;
grant select on wbe_fresh.supplier_prices_view to authenticated;

drop view if exists wbe_fresh.supplier_price_history_view;
create view wbe_fresh.supplier_price_history_view as
  select vegetable_id, updated_price, price_date, recorded_at, updated_by, updated_by_role
  from wbe_fresh.price_history;
grant select on wbe_fresh.supplier_price_history_view to authenticated;

-- ────────────────────────────────────────────────────────────
-- New grants needed for the two new tables (schema-level grants from
-- 0001_init.sql cover future tables too via ALTER DEFAULT PRIVILEGES,
-- but that only applies to tables created AFTER that statement ran
-- in the same session/role — being explicit here is safer than
-- relying on that carrying across migrations).
-- ────────────────────────────────────────────────────────────
grant usage on schema wbe_fresh to authenticated, anon, service_role;
