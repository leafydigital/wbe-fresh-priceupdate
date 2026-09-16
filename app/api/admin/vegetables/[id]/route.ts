import { createClient } from "@/lib/supabase/server";
import { requireRoleApi } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  unit: z.enum(["KG", "Piece", "Box", "Bundle"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

/**
 * Handles both the inline name/unit edits and the Active/Removed
 * toggle. "Removed" in the UI is DISABLED under the hood — requirement
 * 10 asks for soft-delete/archive behaviour so historical
 * price/audit rows referencing this vegetable stay intact, and the
 * existing ACTIVE/DISABLED status column already provides exactly
 * that; a DISABLED vegetable simply stops appearing in active lists
 * (admin's price sheet, supplier's dashboard, the public page) while
 * everything that references its id (daily_prices, price_history,
 * audit_logs) remains untouched and queryable.
 *
 * Each changed field gets its own audit row, since a single PATCH
 * could in principle change name AND unit AND status together, and
 * requirement 2 asks for field-level history ("field changed, old
 * value, new value").
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const supabase = createClient();

  const { data: before, error: fetchError } = await supabase
    .from("vegetables")
    .select("name, unit, status")
    .eq("id", params.id)
    .single();
  if (fetchError || !before) {
    return NextResponse.json({ error: "Vegetable not found." }, { status: 404 });
  }

  // Drop no-op fields before writing, so an unchanged value never
  // triggers a write or an audit row (requirement 26).
  const changes: Record<string, string> = {};
  if (parsed.data.name !== undefined && parsed.data.name !== before.name) changes.name = parsed.data.name;
  if (parsed.data.unit !== undefined && parsed.data.unit !== before.unit) changes.unit = parsed.data.unit;
  if (parsed.data.status !== undefined && parsed.data.status !== before.status) changes.status = parsed.data.status;

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ vegetable: before });
  }

  const { data, error } = await supabase
    .from("vegetables")
    .update(changes)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const [field, newValue] of Object.entries(changes)) {
    await writeAudit({
      entityType: "vegetable",
      entityId: params.id,
      action: "update",
      fieldName: field,
      oldValue: (before as any)[field],
      newValue,
      actorId: guard.profile.id,
      actorRole: guard.profile.role,
    });
  }

  return NextResponse.json({ vegetable: data });
}
