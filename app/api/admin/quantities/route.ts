import { createClient } from "@/lib/supabase/server";
import { requireRoleApi } from "@/lib/auth";
import { getCurrentOrderWindow } from "@/lib/priceCycle";
import { writeAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bulkUpsertSchema = z.object({
  updates: z
    .array(
      z.object({
        vegetableId: z.string().uuid(),
        quantity: z.number().nonnegative(),
        unit: z.enum(["KG", "Piece", "Box", "Bundle"]),
      })
    )
    .min(1),
});

/**
 * Today's order-quantity sheet, keyed by the CURRENT order window
 * (cutoff_at), not calendar date — same never-show-zero reasoning as
 * daily_prices: the most recently saved quantity for a vegetable is
 * shown regardless of whether the current window's own quantity has
 * been set yet.
 */
export async function GET() {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const supabase = createClient();
  const currentWindow = getCurrentOrderWindow(new Date());

  const { data: allQuantities, error } = await supabase
    .from("daily_order_quantities")
    .select("vegetable_id, quantity, unit, cutoff_at")
    .order("cutoff_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const latestByVeg = new Map<string, (typeof allQuantities)[number]>();
  for (const row of allQuantities) {
    if (!latestByVeg.has(row.vegetable_id)) latestByVeg.set(row.vegetable_id, row);
  }

  return NextResponse.json({
    cutoff: currentWindow.cutoff.toISOString(),
    quantities: [...latestByVeg.values()],
  });
}

/**
 * Bulk save for the Order Quantity section's sticky Save button. See
 * app/api/admin/prices/route.ts for the shared reasoning on
 * per-row writes, no-op skipping, and partial-failure reporting.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = bulkUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = createClient();
  const currentWindow = getCurrentOrderWindow(new Date());

  const results: { vegetableId: string; ok: boolean; error?: string }[] = [];

  for (const update of parsed.data.updates) {
    const { data: existing } = await supabase
      .from("daily_order_quantities")
      .select("quantity")
      .eq("vegetable_id", update.vegetableId)
      .order("cutoff_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const oldQty = existing ? Number(existing.quantity) : null;
    if (oldQty === update.quantity) {
      results.push({ vegetableId: update.vegetableId, ok: true });
      continue;
    }

    const { error } = await supabase.from("daily_order_quantities").upsert(
      {
        vegetable_id: update.vegetableId,
        quantity: update.quantity,
        unit: update.unit,
        cutoff_at: currentWindow.cutoff.toISOString(),
        updated_by: guard.profile.id,
      },
      { onConflict: "vegetable_id,cutoff_at" }
    );

    if (error) {
      results.push({ vegetableId: update.vegetableId, ok: false, error: error.message });
      continue;
    }

    await writeAudit({
      entityType: "order_quantity",
      entityId: update.vegetableId,
      action: "update",
      fieldName: "quantity",
      oldValue: oldQty,
      newValue: update.quantity,
      actorId: guard.profile.id,
      actorRole: guard.profile.role,
    });
    results.push({ vegetableId: update.vegetableId, ok: true });
  }

  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    return NextResponse.json({ results, error: `${failures.length} of ${results.length} updates failed.` }, { status: 207 });
  }

  return NextResponse.json({ results });
}
