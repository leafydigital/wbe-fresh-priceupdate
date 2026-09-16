import { createClient } from "@/lib/supabase/server";
import { requireRoleApi } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/priceCycle";
import { writeAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  margin: z.number().nonnegative(),
});

/** Current common margin. Admin-only — suppliers never read this directly. */
export async function GET() {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", "common_margin")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ margin: Number(data.value), updatedAt: data.updated_at });
}

/**
 * Updates the single global margin value. Recomputes final_price on
 * every daily_prices row belonging to the CURRENT price cycle only —
 * earlier cycles' rows (and price_history) are never touched,
 * matching the requirement that historical prices must not
 * retroactively change when margin changes later.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = createClient();

  const { data: existing, error: readError } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "common_margin")
    .single();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const oldMargin = Number(existing.value);
  const newMargin = parsed.data.margin;

  // No-op edit: skip the write and the audit row entirely (requirement 26).
  if (oldMargin === newMargin) {
    return NextResponse.json({ margin: oldMargin });
  }

  const { error: updateError } = await supabase
    .from("app_settings")
    .update({ value: String(newMargin), updated_by: guard.profile.id })
    .eq("key", "common_margin");
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Recompute final_price for every price row belonging to the
  // CURRENT cycle, so the change takes effect immediately across the
  // whole sheet, without touching price_history (each history row
  // already froze its own final_price at the time it was recorded)
  // or any earlier cycle's daily_prices row.
  const currentCycle = getCurrentCycle(new Date());
  const { data: currentCycleRows, error: rowsError } = await supabase
    .from("daily_prices")
    .select("id, updated_price")
    .eq("cycle_start", currentCycle.cycleStart.toISOString());

  if (!rowsError && currentCycleRows) {
    await Promise.all(
      currentCycleRows.map((row) =>
        supabase
          .from("daily_prices")
          .update({ final_price: Number(row.updated_price) + newMargin })
          .eq("id", row.id)
      )
    );
  }

  await writeAudit({
    entityType: "margin",
    entityId: null,
    action: "update",
    fieldName: "common_margin",
    oldValue: oldMargin,
    newValue: newMargin,
    actorId: guard.profile.id,
    actorRole: guard.profile.role,
  });

  return NextResponse.json({ margin: newMargin });
}
