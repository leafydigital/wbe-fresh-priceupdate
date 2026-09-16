import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase session cookie fresh on every request so
// Server Components see an up-to-date auth state. This does not
// enforce authorization itself — that happens in lib/auth.ts via
// requireRole/requireRoleApi, and ultimately in Postgres RLS.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // No db.schema option here (unlike lib/supabase/*.ts) because
      // this client only ever calls supabase.auth.getUser() below —
      // Auth is schema-independent, so there's no table query for a
      // schema setting to affect.
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    /*
     * Skip static assets and the public price API (no session needed).
     */
    "/((?!_next/static|_next/image|favicon.ico|api/public).*)",
  ],
};
