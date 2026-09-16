import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Client-side Supabase instance. Uses the anon key, so it is bound
 * by Row Level Security policies — a supplier session can never
 * read another supplier's rows or admin-only tables, regardless of
 * what the client code asks for.
 *
 * db.schema: "wbe_fresh" — this app's tables live in their own
 * schema, not the default `public`, because this Supabase project
 * also hosts another app (a CRM) whose tables already occupy
 * `public`. Every query through this client is implicitly scoped to
 * wbe_fresh; there is no need to schema-qualify table names in app
 * code as a result. Requires `wbe_fresh` to be added under Project
 * Settings → Data API → "Exposed schemas" in the Supabase dashboard
 * (see the note at the bottom of supabase/migrations/0001_init.sql).
 *
 * The second generic argument is passed explicitly
 * (createBrowserClient<Database, "wbe_fresh">) — see the matching
 * note in lib/supabase/admin.ts for why leaving it implicit was
 * unreliable.
 */
export function createClient() {
  return createBrowserClient<Database, "wbe_fresh">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "wbe_fresh" } }
  );
}