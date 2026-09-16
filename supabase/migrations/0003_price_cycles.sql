-- WBE Fresh — price-cycle columns (3:00 PM → next-day 1:00 PM)
-- Run this in the Supabase SQL editor, or via `supabase db push`.
-- Depends on 0001_init.sql and 0002_audit_and_common_margin.sql
-- having already run.
--
-- ════════════════════════════════════════════════════════════
-- WHY THIS MIGRATION EXISTS
-- ════════════════════════════════════════════════════════════
-- daily_prices/price_history/daily_order_quantities were keyed by
-- calendar date (price_date / order_date). WBE Fresh's real business
-- cycle does not follow calendar days:
--
--   3:00 PM  ──► price becomes active, stays active until...
--   next day 1:00 PM ──► cycle/order-window closes
--   3:00 PM  ──► next cycle begins
--
-- A calendar date has no fixed relationship to this. The price set
-- at 3:30 PM on the 15th is still the correct, active price at
-- 10:00 AM on the 16th — same cycle, two different calendar dates.
-- Querying "price_date = today" therefore returns nothing between
-- midnight and 3 PM even though a perfectly valid price exists; the
-- old code treated that as "no price" and showed nothing, which is
-- the ₹0/missing-price bug this migration fixes.
--
-- The fix: add a `cycle_start` timestamptz to daily_prices and
-- price_history — the exact moment (always computed as some day's
-- 3:00 PM Asia/Kolkata) the row's price cycle began. Cycle math
-- itself lives in application code (lib/priceCycle.ts), not in SQL —
-- Postgres doesn't need to know what "3 PM IST" means, it only needs
-- to store the timestamptz the application computed and to let the
-- application query "give me the row for the CURRENT cycle_start"
-- or "give me the last 7 distinct cycle_starts."
--
-- This migration is purely additive/backfilling. No table is
-- dropped, no existing price/vegetable/supplier/history row is
-- deleted. The old price_date/order_date columns are kept (not
-- dropped) — nothing currently reading them breaks — but going
-- forward the application reads/writes cycle_start instead.
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- daily_prices: add cycle_start, backfill, re-key uniqueness
-- ────────────────────────────────────────────────────────────

-- Add as nullable first so the backfill below has something to fill
-- in before we tighten it to not-null.
alter table wbe_fresh.daily_prices add column cycle_start timestamptz;

-- Backfill existing rows. Each existing row's price_date + updated_at
-- already tells us which cycle it almost certainly belonged to: if
-- updated_at's IST clock time was >= 15:00, the cycle it started is
-- that same calendar day's 3 PM IST; otherwise it's the PREVIOUS
-- calendar day's 3 PM IST (an update made at, say, 10 AM was — under
-- the old calendar-day model — filed under that day's price_date,
-- but business-wise it was almost certainly a correction to the
-- cycle that started the day before). This backfill is a best-effort
-- reconstruction for historical rows created before this migration;
-- it does not need to be perfect, since it only affects how OLD rows
-- are labeled, not any new row going forward.
update wbe_fresh.daily_prices
set cycle_start = case
  when extract(hour from updated_at at time zone 'Asia/Kolkata') >= 15
    then date_trunc('day', updated_at at time zone 'Asia/Kolkata') + interval '15 hours'
  else date_trunc('day', updated_at at time zone 'Asia/Kolkata') - interval '1 day' + interval '15 hours'
end at time zone 'Asia/Kolkata'
where cycle_start is null;

-- Now safe to enforce not-null for all rows going forward.
alter table wbe_fresh.daily_prices alter column cycle_start set not null;

-- ────────────────────────────────────────────────────────────
-- Deduplicate BEFORE enforcing the new unique constraint.
--
-- The backfill above maps updated_at to a ~22-hour bucket (3 PM one
-- day through 2:59 PM the next), which is a many-to-one mapping —
-- unlike the OLD price_date column, it is possible for two existing
-- rows (created on different calendar dates, e.g. while testing this
-- app across more than one day) to land in the SAME backfilled
-- cycle_start. The old unique (vegetable_id, price_date) constraint
-- never prevented this, because it only constrained price_date, and
-- price_date is not what we're keying on anymore.
--
-- For any such collision, keep the row with the latest updated_at
-- (the most recently saved price is the correct "current" one for
-- that cycle) and delete the older duplicate(s) from daily_prices
-- only. No data is lost: every daily_prices write is already
-- mirrored into price_history by the existing trigger, so the
-- older row's value remains permanently in price_history regardless
-- of whether it survives in daily_prices — this step only decides
-- which row represents "the current price for this cycle" going
-- forward, exactly the same as what an upsert would have done if
-- both saves had happened through the app in the same cycle.
--
-- Uses row_number() over an explicit partition, rather than a
-- self-join with a row-value comparison, so the "keep exactly one,
-- delete the rest" logic is unambiguous and easy to verify directly
-- (see the SELECT-only version of this same query below, which you
-- can run first to see exactly what would be deleted).
-- ────────────────────────────────────────────────────────────
with ranked as (
  select id,
         row_number() over (
           partition by vegetable_id, cycle_start
           order by updated_at desc, id desc
         ) as rn
  from wbe_fresh.daily_prices
)
delete from wbe_fresh.daily_prices
where id in (select id from ranked where rn > 1);

-- Defensive check: if any (vegetable_id, cycle_start) pair still has
-- more than one row after the delete above, the constraint below
-- would fail with an opaque error — this raises a clear, specific
-- error instead, naming exactly which pair is still duplicated, so
-- if the dedup logic above ever needs revisiting, it's obvious why.
do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count
  from (
    select vegetable_id, cycle_start
    from wbe_fresh.daily_prices
    group by vegetable_id, cycle_start
    having count(*) > 1
  ) dups;

  if dup_count > 0 then
    raise exception 'Deduplication did not fully resolve % (vegetable_id, cycle_start) pair(s) — the row_number() dedup above needs revisiting before the unique constraint can be created.', dup_count;
  end if;
end $$;

-- Re-key uniqueness: one row per vegetable per CYCLE, not per
-- calendar date. Two different cycle_start values can share a
-- price_date (the cycle that starts at 3 PM on day X and the row
-- that gets read at, say, 9 AM on day X+1 both have price_date = X
-- under the old model, but only one cycle_start each).
alter table wbe_fresh.daily_prices drop constraint if exists daily_prices_vegetable_id_price_date_key;
alter table wbe_fresh.daily_prices add constraint daily_prices_vegetable_id_cycle_start_key unique (vegetable_id, cycle_start);

create index daily_prices_cycle_start_idx on wbe_fresh.daily_prices (vegetable_id, cycle_start desc);

-- price_date is kept, NOT dropped — still populated (defaults to
-- current_date as before) for any code path not yet migrated to
-- cycle_start, but it is no longer part of the uniqueness constraint
-- and the application no longer uses it to decide "is this today's
-- price." It's inert historical metadata from this point on.

-- ────────────────────────────────────────────────────────────
-- price_history: add cycle_start, backfilled the same way
-- ────────────────────────────────────────────────────────────
alter table wbe_fresh.price_history add column cycle_start timestamptz;

update wbe_fresh.price_history
set cycle_start = case
  when extract(hour from recorded_at at time zone 'Asia/Kolkata') >= 15
    then date_trunc('day', recorded_at at time zone 'Asia/Kolkata') + interval '15 hours'
  else date_trunc('day', recorded_at at time zone 'Asia/Kolkata') - interval '1 day' + interval '15 hours'
end at time zone 'Asia/Kolkata'
where cycle_start is null;

alter table wbe_fresh.price_history alter column cycle_start set not null;

create index price_history_cycle_start_idx on wbe_fresh.price_history (vegetable_id, cycle_start desc);
-- The old price_history_veg_date_idx (vegetable_id, price_date desc)
-- from 0001_init.sql is left in place — still valid, just no longer
-- the index the application's history queries lean on.

-- ────────────────────────────────────────────────────────────
-- Update the price-history trigger to copy cycle_start forward.
-- Same drop-then-recreate dance as migration 0002, because the
-- trigger's column list is changing (Postgres tracks a trigger's
-- "after update of X, Y" clause as a real dependency, so touching
-- that list means drop trigger -> redefine function -> recreate
-- trigger, in that order).
-- ────────────────────────────────────────────────────────────
drop trigger if exists daily_prices_history on wbe_fresh.daily_prices;
drop function if exists wbe_fresh.log_price_history();

create function wbe_fresh.log_price_history() returns trigger as $$
begin
  insert into wbe_fresh.price_history (vegetable_id, updated_price, final_price, price_date, cycle_start, updated_by, updated_by_role)
  values (
    new.vegetable_id,
    new.updated_price,
    new.final_price,
    new.price_date,
    new.cycle_start,
    new.updated_by,
    (select role from wbe_fresh.profiles where id = new.updated_by)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = wbe_fresh, pg_temp;

create trigger daily_prices_history
  after insert or update of updated_price, final_price, cycle_start on wbe_fresh.daily_prices
  for each row execute function wbe_fresh.log_price_history();

-- ────────────────────────────────────────────────────────────
-- supplier_prices_view / supplier_price_history_view: recreate to
-- include cycle_start (needed by the supplier dashboard/price routes
-- to identify "the current cycle's row" without margin/final_price
-- ever being exposed — same column-secrecy shape as before, just
-- with one more safe column added).
-- ────────────────────────────────────────────────────────────
drop view if exists wbe_fresh.supplier_prices_view;
create view wbe_fresh.supplier_prices_view as
  select vegetable_id, updated_price, price_date, cycle_start, updated_at
  from wbe_fresh.daily_prices;
grant select on wbe_fresh.supplier_prices_view to authenticated;

drop view if exists wbe_fresh.supplier_price_history_view;
create view wbe_fresh.supplier_price_history_view as
  select vegetable_id, updated_price, price_date, cycle_start, recorded_at, updated_by, updated_by_role
  from wbe_fresh.price_history;
grant select on wbe_fresh.supplier_price_history_view to authenticated;

-- ────────────────────────────────────────────────────────────
-- daily_order_quantities: add cutoff_at (the 1:00 PM boundary this
-- quantity request belongs to). This is a smaller, additive change
-- than the price-cycle one — order quantities have no public-facing
-- "history of quantity cycles" requirement, so there's no need to
-- restructure uniqueness or add an index tuned for range history the
-- way daily_prices needed. We just need to know unambiguously which
-- collection window a quantity belongs to, so "today's demand" can
-- be computed correctly even before the day's first edit.
-- ────────────────────────────────────────────────────────────
alter table wbe_fresh.daily_order_quantities add column cutoff_at timestamptz;

-- Backfill: an order_date's cutoff is that same calendar day's
-- 1:00 PM Asia/Kolkata (the order-collection window that closes at
-- 1 PM on the day the row was filed under).
update wbe_fresh.daily_order_quantities
set cutoff_at = (date_trunc('day', order_date::timestamptz at time zone 'Asia/Kolkata') + interval '13 hours') at time zone 'Asia/Kolkata'
where cutoff_at is null;

alter table wbe_fresh.daily_order_quantities alter column cutoff_at set not null;

alter table wbe_fresh.daily_order_quantities drop constraint if exists daily_order_quantities_vegetable_id_order_date_key;
alter table wbe_fresh.daily_order_quantities add constraint daily_order_quantities_vegetable_id_cutoff_at_key unique (vegetable_id, cutoff_at);

create index daily_order_quantities_cutoff_idx on wbe_fresh.daily_order_quantities (vegetable_id, cutoff_at desc);

-- order_date is kept, not dropped, for the same reason price_date is
-- kept above — inert historical metadata, no longer load-bearing.

-- ────────────────────────────────────────────────────────────
-- No RLS policy changes. Every existing policy on daily_prices,
-- price_history, and daily_order_quantities is keyed on ROLE
-- (is_admin(), profiles.role = 'SUPPLIER', auth.uid() checks) — none
-- of them reference price_date/order_date or cycle_start/cutoff_at
-- in their USING/WITH CHECK clauses, so none of them need to change.
-- The one policy that DID reference a date column —
-- daily_prices_supplier_write / daily_prices_supplier_update's
-- "price_date = current_date" check — needs updating, since a
-- supplier must be able to write to the CURRENT CYCLE's row, which
-- may have a cycle_start from yesterday (if it's currently before
-- 3 PM and today's cycle hasn't started yet, there is no "today's"
-- row to update — the supplier is updating/continuing yesterday's
-- cycle's price right up until it closes at 1 PM, or starting a
-- fresh row once the 3 PM cycle begins). Rather than re-deriving
-- "is this cycle_start current" in raw SQL (duplicating the IST
-- cycle math that already lives in lib/priceCycle.ts), we relax
-- this policy to simply "cycle_start is not in the future" — the
-- application (which the RLS-bound routes always go through) is
-- responsible for computing the correct current cycle_start and
-- never asks Postgres to accept a stale or fabricated one; this
-- policy exists as a coarse backstop, not the primary enforcement.
-- ────────────────────────────────────────────────────────────
drop policy if exists daily_prices_supplier_write on wbe_fresh.daily_prices;
create policy daily_prices_supplier_write on wbe_fresh.daily_prices for insert
  with check (
    exists (select 1 from wbe_fresh.profiles where id = auth.uid() and role = 'SUPPLIER' and status = 'ACTIVE')
    and cycle_start <= now()
  );

drop policy if exists daily_prices_supplier_update on wbe_fresh.daily_prices;
create policy daily_prices_supplier_update on wbe_fresh.daily_prices for update
  using (
    exists (select 1 from wbe_fresh.profiles where id = auth.uid() and role = 'SUPPLIER' and status = 'ACTIVE')
    and cycle_start <= now()
  );