import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleApi } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PHONE_REGEX = /^[0-9]{10}$/;

const updateSchema = z.object({
  businessName: z.string().trim().min(1).max(120).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().regex(PHONE_REGEX, "Phone number must be exactly 10 digits.").optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  newPassword: z.string().min(8).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { newPassword, status, ...supplierFields } = parsed.data;

  const supabase = createClient();
  const { data: before, error: fetchError } = await supabase
    .from("suppliers")
    .select("profile_id, business_name, contact_person, phone, status")
    .eq("id", params.id)
    .single();

  if (fetchError || !before) {
    return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  }

  const changes: Record<string, string> = {};
  if (supplierFields.businessName !== undefined && supplierFields.businessName !== before.business_name) {
    changes.business_name = supplierFields.businessName;
  }
  if (supplierFields.contactPerson !== undefined && supplierFields.contactPerson !== before.contact_person) {
    changes.contact_person = supplierFields.contactPerson;
  }
  if (supplierFields.phone !== undefined) {
    const newPhone = supplierFields.phone || null;
    if (newPhone !== before.phone) changes.phone = newPhone as unknown as string;
  }
  if (status !== undefined && status !== before.status) changes.status = status;

  if (Object.keys(changes).length > 0) {
    const { error } = await supabase.from("suppliers").update(changes).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Keep the profile's own status in lockstep so a deactivated
    // supplier is also locked out of login, not just hidden in lists.
    if (changes.status) {
      await supabase.from("profiles").update({ status: changes.status }).eq("id", before.profile_id);
    }

    for (const [field, newValue] of Object.entries(changes)) {
      await writeAudit({
        entityType: "supplier",
        entityId: params.id,
        action: "update",
        fieldName: field,
        oldValue: (before as any)[field],
        newValue,
        actorId: guard.profile.id,
        actorRole: guard.profile.role,
      });
    }
  }

  if (newPassword) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(before.profile_id, { password: newPassword });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit({
      entityType: "supplier",
      entityId: params.id,
      action: "update",
      fieldName: "password",
      oldValue: null, // never store password/auth material — see requirement 2's note
      newValue: null,
      actorId: guard.profile.id,
      actorRole: guard.profile.role,
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * "Delete" a supplier. This is a soft delete (sets status to
 * DISABLED, same as the deactivate toggle) — requirement 11 asks
 * that historical audit/price-history rows attached to this
 * supplier's changes must survive, and audit_logs.changed_by
 * references auth.users directly rather than this suppliers row, so
 * a hard delete of the supplier row wouldn't even break that
 * reference — but the AUTH USER itself is what audit rows point to,
 * and hard-deleting that would either cascade-null changed_by (not
 * possible, the column is not-null) or fail outright. Soft delete
 * avoids ever having to answer that question: the supplier
 * disappears from active lists everywhere (their own login is
 * disabled via the profiles.status lockstep in PATCH above) while
 * every historical record stays exactly as it was.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const supabase = createClient();
  const { data: before, error: fetchError } = await supabase
    .from("suppliers")
    .select("profile_id, business_name, status")
    .eq("id", params.id)
    .single();

  if (fetchError || !before) {
    return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
  }
  if (before.status === "DISABLED") {
    return NextResponse.json({ ok: true }); // already removed — no-op, no audit noise
  }

  const { error } = await supabase.from("suppliers").update({ status: "DISABLED" }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from("profiles").update({ status: "DISABLED" }).eq("id", before.profile_id);

  await writeAudit({
    entityType: "supplier",
    entityId: params.id,
    action: "delete",
    fieldName: "status",
    oldValue: before.status,
    newValue: "DISABLED",
    actorId: guard.profile.id,
    actorRole: guard.profile.role,
  });

  return NextResponse.json({ ok: true });
}
