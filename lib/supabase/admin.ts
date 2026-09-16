import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses Row Level Security entirely.
 *
 * ONLY import this inside:
 *  - app/api/public/prices/route.ts    (to select final_price only,
 *    never updated_price/margin — the column-level secrecy RLS can't do)
 *  - app/api/admin/suppliers/route.ts,
 *    app/api/admin/suppliers/[id]/route.ts (to create/update Supabase
 *    Auth users for suppliers, which requires the admin API)
 *  - app/api/supplier/prices/route.ts  (to read/preserve the existing
 *    margin on upsert — suppliers have no SELECT policy on
 *    daily_prices at all; margin secrecy from them is enforced by
 *    supplier_prices_view's column list, not by this bypass, and the
 *    request schema there has no margin field for a supplier to set)
 *
 * Never import this into a Server Component, a Client Component, or
 * any route that echoes request data back without an explicit
 * allow-list of columns. SUPABASE_SERVICE_ROLE_KEY must never be
 * exposed to the browser — it has no NEXT_PUBLIC_ prefix for that reason.
 *
 * db.schema: "wbe_fresh" — see the matching note in
 * lib/supabase/client.ts. The service role bypasses RLS regardless
 * of schema, so this setting only affects which schema unqualified
 * table names in .from() resolve against — it is not itself a
 * privilege boundary.
 *
 * The second generic argument, "wbe_fresh", is passed explicitly
 * (createSupabaseClient<Database, "wbe_fresh">) rather than relying
 * on it being inferred from the Database type's only key. Leaving it
 * implicit worked inconsistently in practice — wrapping the call in
 * this function seemed to prevent the generic default from resolving
 * correctly in some cases, silently falling back to an untyped
 * client and surfacing as SelectQueryError/`never` types on every
 * .select() call anywhere this client is used. Passing it explicitly
 * removes that ambiguity.
 */
export function createAdminClient() {
  return createSupabaseClient<Database, "wbe_fresh">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "wbe_fresh" } }
  );
}