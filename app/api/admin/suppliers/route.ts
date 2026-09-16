import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleApi } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Exactly 10 digits, nothing else — enforced here AND as a check
// constraint on wbe_fresh.suppliers.phone in migration 0002.
// Requirement 12 is explicit that frontend validation alone isn't
// enough; this is the server-side half of that, and the database
// constraint is the third, un-bypassable layer.
const PHONE_REGEX = /^[0-9]{10}$/;

const createSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().regex(PHONE_REGEX, "Phone number must be exactly 10 digits.").optional().or(z.literal("")),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9_.-]+$/, "Username can only contain lowercase letters, numbers, dots, dashes and underscores."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function GET() {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, business_name, contact_person, phone, status, profile_id, profiles:profile_id(username)")
    .order("business_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const suppliers = (data ?? []).map((s: any) => ({
    ...s,
    profiles: Array.isArray(s.profiles) ? s.profiles[0] : s.profiles,
  }));

  return NextResponse.json({ suppliers });
}

export async function POST(req: NextRequest) {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { businessName, contactPerson, phone, username, password } = parsed.data;

  const admin = createAdminClient();
  const syntheticEmail = `${username}@suppliers.wbefresh.internal`;

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    const isDup = authError?.message?.toLowerCase().includes("already registered");
    return NextResponse.json(
      { error: isDup ? "That username is already taken." : authError?.message ?? "Could not create login." },
      { status: isDup ? 409 : 500 }
    );
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: authUser.user.id,
    name: businessName,
    username,
    role: "SUPPLIER",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { data: supplier, error: supplierError } = await admin
    .from("suppliers")
    .insert({
      profile_id: authUser.user.id,
      business_name: businessName,
      contact_person: contactPerson,
      phone: phone || null,
    })
    .select()
    .single();

  if (supplierError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: supplierError.message }, { status: 500 });
  }

  await writeAudit({
    entityType: "supplier",
    entityId: supplier.id,
    action: "create",
    fieldName: null,
    oldValue: null,
    newValue: businessName,
    actorId: guard.profile.id,
    actorRole: guard.profile.role,
  });

  return NextResponse.json({ supplier }, { status: 201 });
}
