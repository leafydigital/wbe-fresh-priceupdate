import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server-side Supabase instance for use inside Server Components,
 * Route Handlers, and Server Actions. Still uses the anon key and is
 * still bound by RLS — this is not a privilege escalation, just a
 * cookie-aware client for reading the logged-in user's session on
 * the server.
 *
 * db.schema: "wbe_fresh" — see the matching note in
 * lib/supabase/client.ts for why this app targets its own schema
 * instead of `public`. The second generic argument is passed
 * explicitly (createServerClient<Database, "wbe_fresh">) for the
 * same reason documented in lib/supabase/admin.ts — relying on it
 * being inferred was unreliable through this wrapper function.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database, "wbe_fresh">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "wbe_fresh" },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component render — safe to ignore;
            // middleware refreshes the session cookie on navigation.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // See note above.
          }
        },
      },
    }
  );
}