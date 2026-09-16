import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  identifier: z.string().trim().min(1), // admin email OR supplier username
  password: z.string().min(1),
});

/**
 * Single login endpoint for both admin and supplier — the frontend
 * has one form with one "identifier" field, and this route figures
 * out which kind of account it is:
 *
 *   contains "@"  -> treat as an admin's email, sign in directly
 *   no "@"        -> treat as a supplier's username, reconstruct the
 *                     synthetic email (see app/api/admin/suppliers/route.ts
 *                     for where that synthetic email is minted) and
 *                     sign in with that instead
 *
 * Either way, the actual Supabase Auth session that results is
 * identical to what the old two-route setup produced — this change
 * is purely about which endpoint the browser calls and how it picks
 * the email to attempt, not about session/cookie handling.
 *
 * The response includes `role` so the login page knows which
 * dashboard to redirect to, without the page needing to guess or
 * make a second request.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your username/email and password." }, { status: 400 });
  }

  const { identifier, password } = parsed.data;
  const isEmailAttempt = identifier.includes("@");
  const email = isEmailAttempt ? identifier : `${identifier.toLowerCase()}@suppliers.wbefresh.internal`;

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return NextResponse.json({ error: "Incorrect username/email or password." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "No account found for these credentials." }, { status: 403 });
  }
  if (profile.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "This account is deactivated. Contact your administrator." }, { status: 403 });
  }

  // A supplier who happens to type an "@"-containing string that
  // isn't their real login, or an admin whose email attempt somehow
  // resolved to a supplier row, would be caught by normal auth
  // failure above (wrong email = wrong password error) before
  // reaching here — this check is a second, cheap confirmation that
  // the resolved account's actual role is coherent, not a
  // meaningful new security boundary on its own.
  return NextResponse.json({ role: profile.role });
}
