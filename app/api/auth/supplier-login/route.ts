import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

/**
 * Suppliers log in with a plain username (set by admin), not an
 * email. Supabase Auth needs an email-shaped identifier, so we
 * reconstruct the synthetic email used at creation time
 * (see app/api/admin/suppliers/route.ts) and sign in with that.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const supabase = createClient();
  const syntheticEmail = `${parsed.data.username.toLowerCase()}@suppliers.wbefresh.internal`;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .single();

  if (!profile || profile.role !== "SUPPLIER") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "This account is not a supplier account." }, { status: 403 });
  }
  if (profile.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "This supplier account is deactivated. Contact admin." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
