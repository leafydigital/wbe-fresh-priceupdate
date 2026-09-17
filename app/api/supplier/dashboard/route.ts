import { createClient } from "@/lib/supabase/server";
import { requireRoleApi } from "@/lib/auth";
import { getCurrentOrderWindow, isSameIstDate } from "@/lib/priceCycle";
import { NextResponse } from "next/server";

/**
 * A supplier sees quantities and their own submitted price per
 * vegetable — never margin.
 *
 * Price: read as "most recently saved," never filtered to an exact
 * current cycle — a vegetable's price from the previous cycle is
 * still the correct thing to show until a newer one exists
 * (never-zero requirement).
 *
 * Quantity: shown ONLY if it was last updated TODAY (checked by
 * calendar date in IST, via isSameIstDate) — admin re-enters order
 * quantities fresh each morning, so a quantity last touched on an
 * earlier calendar day is stale and should NOT be shown, even if it
 * technically still belongs to the current 3PM/1PM cycle window.
 * This is a plain calendar-day rule, deliberately simpler than and
 * separate from the price-cycle concept: admin's own daily habit
 * (update once each morning) is what determines "today," not the 3
 * PM business-cycle boundary.
 *
 * We fetch each vegetable's single most recent daily_order_quantities
 * row (regardless of cutoff_at) and then check whether THAT row's
 * updated_at falls on today's IST date — rather than filtering by
 * cutoff_at directly, since cutoff_at is a cycle boundary, not a
 * calendar date, and the two can disagree depending on what time of
 * day admin actually made the update.
 */
export async function GET() {
  const guard = await requireRoleApi("SUPPLIER");
  if ("error" in guard) return guard.error;

  const supabase = createClient();
  const currentWindow = getCurrentOrderWindow(new Date());
  const now = new Date();

  const { data: vegetables, error: vegError } = await supabase
    .from("vegetables")
    .select("id, name, unit")
    .eq("status", "ACTIVE")
    .order("name");
  if (vegError) return NextResponse.json({ error: vegError.message }, { status: 500 });

  const { data: allQuantities } = await supabase
    .from("daily_order_quantities")
    .select("vegetable_id, quantity, unit, updated_at")
    .order("updated_at", { ascending: false });

  const { data: allPrices } = await supabase
    .from("supplier_prices_view")
    .select("vegetable_id, updated_price, cycle_start, updated_at")
    .order("cycle_start", { ascending: false });

  const latestQtyByVeg = new Map<string, (typeof allQuantities)[number]>();
  for (const row of allQuantities ?? []) {
    if (!latestQtyByVeg.has(row.vegetable_id)) latestQtyByVeg.set(row.vegetable_id, row);
  }
  const latestPriceByVeg = new Map<string, (typeof allPrices)[number]>();
  for (const row of allPrices ?? []) {
    if (!latestPriceByVeg.has(row.vegetable_id)) latestPriceByVeg.set(row.vegetable_id, row);
  }

  const items = vegetables.map((v) => {
    const q = latestQtyByVeg.get(v.id);
    const qUpdatedToday = q ? isSameIstDate(new Date(q.updated_at), now) : false;
    const p = latestPriceByVeg.get(v.id);
    return {
      id: v.id,
      name: v.name,
      unit: v.unit,
      quantity: qUpdatedToday ? q!.quantity : null,
      currentPrice: p?.updated_price ?? null,
      updatedAt: p?.updated_at ?? null,
    };
  });

  const totalQuantity = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);

  return NextResponse.json({
    totalQuantity,
    items,
    orderCutoff: currentWindow.cutoff.toISOString(),
  });
}