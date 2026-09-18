# WBE Fresh

Daily fresh vegetable price management app. Admin sets prices and margins,
suppliers report their prices, buyers see a public daily rate card.

## Stack

- **Frontend/backend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database + auth**: Supabase (Postgres + Supabase Auth)
- **Validation**: Zod on every API route

## Project structure

```
app/
  admin/                admin pages — /admin/dashboard, /admin/prices, /admin/vegetables, /admin/suppliers
  supplier/             supplier pages — /supplier/dashboard, /supplier/update-prices
  login/                unified login at /login (admin or supplier)
  page.tsx              public price list — the app's root URL, no auth
  api/
    admin/              admin-only API routes (vegetables, suppliers, prices, quantities, settings/margin, audit)
    supplier/           supplier-only API routes (own dashboard, own price submission)
    public/prices/      the ONLY route the public page reads from — see below
    auth/                login/logout routes
components/             shared client components (nav bars, inline-edit field, search box, history modals)
lib/
  supabase/             browser/server/admin Supabase clients + generated types
  auth.ts               role guards (requireRole, requireRoleApi)
  priceCycle.ts          the 3 PM -> next-day 1 PM business cycle — single source of truth for all date/time logic
  pricing.ts            price formula (updated_price + margin) + formatting helpers
  audit.ts              writeAudit() — the one place the app inserts into audit_logs
supabase/migrations/    SQL schema, RLS policies, triggers
scripts/seed.ts         creates the first admin login + starter vegetables
```

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).

2. **Run the schema migrations, in order.** Open the SQL editor in
   your Supabase project and run each file's contents once, in this
   order:
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_audit_and_common_margin.sql`
   3. `supabase/migrations/0003_price_cycles.sql`

   Or via the CLI:
   ```
   supabase link --project-ref your-project-ref
   supabase db push
   ```
   This creates everything inside its own **`wbe_fresh` schema**, not
   `public` — see "Sharing a Supabase project with other apps" below
   if that's news to you. **After running the migrations, you must
   also** go to **Project Settings → Data API → Exposed schemas** and
   add `wbe_fresh` to the list, then save. Without this step every
   `supabase-js` call from the app fails with an error like *"The
   schema must be one of the following: public, graphql_public"* even
   though the migrations ran successfully and the tables exist.

3. **Copy environment variables.**
   ```
   cp .env.example .env
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API in your Supabase
   dashboard. **Never commit `.env` or expose the service role key
   to the browser.**

4. **Install dependencies.**
   ```
   npm install
   ```

5. **Seed the first admin account and starter vegetables.**
   ```
   npm run seed
   ```
   This creates an admin login (`admin@wbefresh.com` / `ChangeMe123!` by
   default — override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in
   `.env`) and eight starter vegetables. **Change the seeded
   password after your first login** — there's no forced-reset flow yet,
   so this is a manual step.

6. **Run it.**
   ```
   npm run dev
   ```
   - `/` — the public price list (no login needed) — this is the
     page you'd share via WhatsApp, and what a visitor sees at your
     root domain
   - `/login` — single login for both admin and supplier. Enter an
     email to sign in as admin, or a username to sign in as a
     supplier — the same form routes to `/admin/dashboard` or
     `/supplier/dashboard` based on which kind of account matched

## How the pieces fit together

**The price cycle (3 PM → next-day 1 PM), and why it isn't calendar
days.** WBE Fresh's business day does not reset at midnight. A price
saved at 3:30 PM stays the current, correct price until the next
day's 1 PM order-collection cutoff — spanning two calendar dates the
whole time. All of this logic lives in exactly one file,
`lib/priceCycle.ts`: `getCurrentCycle(now)` returns `{ cycleStart,
validUntil }` for whatever instant you pass it, always computed in
Asia/Kolkata wall-clock time via `Intl.DateTimeFormat` (never the
server process's own timezone, which may not be IST at all).
`isCycleUpdatePending()` answers "has the cycle that should be
active right now actually been saved yet" — this is what drives the
red/green validity indicator, and nothing else. No component or API
route computes 3 PM/1 PM boundaries itself; every one of them imports
from this file.

**Never showing ₹0.** `daily_prices`/`price_history` are keyed by
`cycle_start` (a timestamp), not a calendar date, and every read path
— `app/api/public/prices`, `app/api/supplier/dashboard`,
`app/api/admin/prices` — asks for "the most recently saved row for
this vegetable," full stop, never "the row for today." If today's 3
PM update hasn't happened, the most recent row is still yesterday's,
and that is exactly what gets returned and displayed. A price is
only ever `null` for a vegetable that has *literally never* had a
price saved, which the UI shows as "Updating soon" — that is the one
and only legitimate reason that message appears; it is never shown
merely because it's currently before 3 PM.

**Order-collection window.** `daily_order_quantities` has its own
`cutoff_at` column and its own function, `getCurrentOrderWindow()` —
kept separate from the price cycle in code even though the two
happen to share the same 3 PM/1 PM numbers today, so that if WBE
Fresh ever decouples "when orders close" from "when prices update,"
only one function needs to change.

**Price formula.** Margin is a single global value, stored in
`app_settings` (key `common_margin`), not per-vegetable — admin sets
one common margin for everything, editable from `/admin/prices`.
`final_price` is computed by the application (`updated_price +
current common margin`) at the moment a price is saved and stored on
`daily_prices.final_price` — it is **not** a Postgres generated
column, because generated columns can only reference other columns
on the same row, and margin now lives in a different table entirely.
Every write path that touches `daily_prices` goes through
`lib/pricing.ts`'s `getCommonMargin()` + `finalPrice()` so this
computation happens in exactly one place. Changing the common margin
(`POST /api/admin/settings/margin`) recomputes `final_price` for
every row belonging to the *current cycle* immediately; earlier
cycles and `price_history` are never touched, so historical prices
never retroactively change when margin changes later.

**Bulk save.** Admin's Order Quantity section, admin's Updated Price
section, and the supplier price table all use the same shared
component, `components/BulkEditTable.tsx`: every input is always
editable (no click-to-reveal), edits are held as local draft state
only, a row is shown in green once its draft differs from its
current value and in red while it still matches (per the explicit
visual rule), and nothing is sent to the server until the sticky Save
button — which stays reachable while scrolling — is pressed. Only
rows that actually changed are included in the request; the backend
re-checks old-vs-new per row regardless, so a stray or tampered
request still can't create no-op audit rows. Save reports exactly
which rows succeeded and which failed (HTTP 207 on partial failure)
rather than ever claiming a blanket success.

**Audit log vs. price-cycle history — two different tables, two
different purposes.** `price_history` is what the public price
history is built from: the final saved price of each of the last 7
price *cycles* (not calendar days — a vegetable saved twice within
one cycle only appears once, as its latest value for that cycle),
nothing about who set it. `audit_logs` is a separate, permanent,
insert-only table: who changed what, the old value, the new value,
and when — covering prices, order quantities, the common margin,
vegetables, and suppliers. Neither table is derived from the other,
and updating one never touches the other.

`audit_logs.changed_by` is taken *only* from the caller's own
authenticated session — `requireRoleApi`'s returned `profile.id`,
never anything from request body data — see `lib/audit.ts`'s
`writeAudit()`, the single place the app ever inserts into this
table. The `audit_logs_insert_own` RLS policy enforces
`changed_by = auth.uid()` at the database level too, so even a
hypothetical bug that passed the wrong id to `writeAudit()` would
have the insert rejected by Postgres rather than silently recording
the wrong actor. Reads are scoped by role: admin sees every row
(`audit_logs_admin_read`); a supplier can only see their own price
changes (`audit_logs_supplier_read_own_prices` — `entity_type =
'price' and changed_by = auth.uid()`), never margin, vegetable, or
supplier changes, and never another supplier's price history. There
is no `UPDATE`/`DELETE` policy on this table at all — once written,
an audit row cannot be edited or removed through the app, by any
role, including admin.

Every mutating admin/supplier route follows the same shape: read the
existing value, compare to the incoming value, skip the write and
the audit insert entirely if they're equal (no audit noise for a
no-op edit — e.g. clicking a price and pressing Enter without
changing it), otherwise write the main table and then call
`writeAudit()` once per changed field.

**Price history.** Nothing in the app code writes to `price_history`
directly. A Postgres trigger (`daily_prices_history` in the migration)
fires on every insert/update to `daily_prices` and logs a row
automatically. This means history can't be forgotten by a future code
change, and it can't disagree with what was actually saved.

**Keeping margin secret — from buyers, and from suppliers.** This is
the one place Row Level Security isn't enough on its own — RLS
restricts *rows*, not *columns*, so a policy alone can't let a reader
see `final_price` while hiding the margin that went into it. Three
mechanisms handle this, layered by audience:
- **Margin itself** lives in `app_settings.common_margin`, a table
  with exactly one RLS policy: admin-only, full stop (`for all using
  (is_admin())`). No one else — not suppliers, not the public route —
  has any policy granting them access to this table at all.
- **Buyers** (no login) never touch RLS-bound tables at all. The
  root page (`/`) is the only consumer of
  `app/api/public/prices/route.ts`, which uses the service-role
  client (bypasses RLS) but has a hard-coded `select()` that only
  ever asks for `final_price` — never `updated_price`, and margin
  isn't even in the same table to accidentally select.
- **Suppliers** (logged in) go through two Postgres views —
  `supplier_prices_view` and `supplier_price_history_view` — that
  expose `updated_price` but omit `final_price` entirely at the view
  definition itself. Suppliers have *no* `SELECT` policy on the
  `daily_prices`/`price_history` base tables at all, so there's no
  query shape a supplier's own session could send that would return
  it — the column just isn't reachable, rather than being filtered
  out after the fact.

If you extend any of these, keep the allow-lists as they are — don't
widen a `select()` to "just get everything, we'll filter in JS," since
that reintroduces exactly the gap this design avoids. (One route,
`app/api/supplier/prices/route.ts`, does use the service-role client
to read the current common margin and compute `final_price` during a
supplier's price upsert — see that file's comment for why that's
still safe: the request schema has no margin field, so nothing a
supplier sends can set or read it back; only `updated_price` ever
round-trips through their own session.)

**Supplier accounts and the unified login.** Suppliers log in with a
plain username, but Supabase Auth needs an email-shaped identifier,
so account creation (`app/api/admin/suppliers/route.ts`) mints a
synthetic email (`username@suppliers.wbefresh.internal`) behind the
scenes. There is one login form for both admin and supplier
(`/login` → `app/api/auth/login/route.ts`): if what's typed contains
an `@`, it's tried as an admin email directly; otherwise it's treated
as a supplier username and the same synthetic email is reconstructed
before signing in. Either path produces an identical Supabase Auth
session — this is purely about which email `signInWithPassword`
attempts, not a different auth mechanism. The login route reads back
`profiles.role` after a successful sign-in and returns it to the
page, which is how the frontend knows whether to redirect to
`/admin/dashboard` or `/supplier/dashboard`. The synthetic email
itself is invisible to both admin and supplier — neither ever sees or
needs it.

**Role enforcement layers.** Three layers, redundant on purpose:
1. Next.js middleware refreshes the auth cookie on every request.
2. `requireRole()` / `requireRoleApi()` in `lib/auth.ts` check the
   `profiles.role` column before rendering a page or handling an API call.
3. Postgres RLS policies are the last line of defense — even a bug in
   (1) or (2) can't let a supplier's database credentials read another
   supplier's row or an admin-only table.

## Sharing a Supabase project with other apps

If this Supabase project also hosts another app (this one was set up
alongside an existing CRM in the same project, to stay within a
free-tier project limit), every WBE Fresh table, view, and function
lives inside a dedicated **`wbe_fresh` Postgres schema** — never
`public`. This means:
- Table names here (`suppliers`, `profiles`, etc.) can freely reuse
  names the other app already has in `public` — they're different
  tables in different schemas, with no relationship to one another.
- `lib/supabase/client.ts`, `server.ts`, and `admin.ts` all pass
  `db: { schema: "wbe_fresh" }` when constructing their Supabase
  client, so every `.from("suppliers")` call in the app code already
  means `wbe_fresh.suppliers` — you never need to schema-qualify
  table names yourself in application code.
- The one thing genuinely shared across both apps is `auth.users`
  (Supabase Auth is project-wide) — this is intentional and fine;
  it's project infrastructure, not either app's data.
- Don't forget the **Exposed schemas** dashboard step from Setup step
  2 above — it's easy to run the migration, skip that step, and then
  be confused why every query 404s.
- If you add a new file that talks to Supabase directly (rather than
  importing from `lib/supabase/*`), it must set the same
  `db: { schema: "wbe_fresh" }` option itself — `scripts/seed.ts` is
  an example of exactly this, since it creates its own client rather
  than reusing the shared helpers.

## What's still manual / not built

Matching the brief's MVP scope (no CRM, payments, or notifications), a
few things are intentionally left as manual admin steps for this first
version:
- **Sharing supplier credentials** — admin creates the account and
  relays the username/password to the supplier directly (WhatsApp,
  phone call, etc.); there's no automated invite email.
- **Forced password change** — the seeded admin password and any
  supplier password admin sets should be changed by the account holder,
  but there's no forced-reset-on-first-login flow yet.

A few design choices worth knowing about if you extend this:
- **Timezone.** `lib/priceCycle.ts` is deliberately timezone-safe
  regardless of what timezone the server process itself runs in: it
  reads wall-clock time via `Intl.DateTimeFormat` with
  `timeZone: "Asia/Kolkata"` explicitly, and converts IST wall-clock
  times back to UTC instants with a fixed +5:30 offset (India has no
  DST, so this is always correct). If WBE Fresh ever needs a
  different business timezone, the `TIMEZONE` constant at the top of
  that file is the only thing to change.
- **"Delete" is soft-delete everywhere.** Removing a vegetable or a
  supplier sets `status = DISABLED` rather than actually deleting the
  row — this is what keeps `daily_prices`, `price_history`, and
  `audit_logs` rows that reference that vegetable/supplier queryable
  forever, even after it's "removed" from every active list (admin's
  price sheet, the supplier dashboard, the public page). There is no
  hard-delete path for either in the current UI.
- **`final_price` on `daily_prices` is not database-generated**, as
  of the common-margin migration — see "How the pieces fit together"
  above. If you ever suspect it's drifted from `updated_price +
  common_margin` (e.g. after a manual database edit), the safe fix is
  to re-run `POST /api/admin/settings/margin` with the current margin
  value — it recomputes every row belonging to the current price
  cycle unconditionally.
- **Supplier phone is optional but, if present, must be exactly 10
  digits** — enforced in the create/edit forms, in the Zod schema on
  the API routes, and as a Postgres `check` constraint on
  `suppliers.phone`. All three exist on purpose; removing any one of
  them still leaves the other two, but removing all three would mean
  a malformed number could reach the database.
- **A supplier's internal price history is scoped to their own
  edits only** (`app/api/admin/prices/[vegetableId]/history/route.ts`,
  the SUPPLIER branch) — a supplier sees the last 7 cycles they
  themselves updated, but not admin's or another supplier's changes
  to that same vegetable. This preserves the app's original
  behavior; the public page (which everyone, including suppliers,
  can also just visit) already shows the actual final price for
  every cycle regardless of who set it, so a supplier isn't blind to
  what the current price is — this scoping only affects the
  attributed "who changed what" history view, not the price itself.

## Deploying

This is a standard Next.js app — deploys cleanly to Vercel. Set the same
environment variables from `.env` in your hosting provider's
dashboard, and set `NEXT_PUBLIC_SITE_URL` to your real domain (used by
the public prices page to call its own API route server-side).
