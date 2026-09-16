import { createClient } from "@/lib/supabase/server";
import { requireRoleApi } from "@/lib/auth";
import { getCurrentOrderWindow } from "@/lib/priceCycle";
import { NextResponse } from "next/server";

/**
 * A supplier sees quantities and their own submitted price per
 * vegetable — never margin. Both quantity and price are read as
 * "most recently saved," never filtered to an exact current
 * cutoff/cycle — a vegetable's price/quantity from the previous
 * cycle is still the correct thing to show until a newer one exists
 * (never-zero requirement). `cutoff`/`cyclePending` tell the
 * frontend what it needs to render the "orders close at 1:00 PM"
 * messaging and the red/green validity styling; they never cause a
 * price or quantity to be hidden.
 */
export async function GET() {
  const guard = await requireRoleApi("SUPPLIER");
  if ("error" in guard) return guard.error;

  const supabase = createClient();
  const currentWindow = getCurrentOrderWindow(new Date());

  const { data: vegetables, error: vegError } = await supabase
    .from("vegetables")
    .select("id, name, unit")
    .eq("status", "ACTIVE")
    .order("name");
  if (vegError) return NextResponse.json({ error: vegError.message }, { status: 500 });

  const { data: allQuantities } = await supabase
    .from("daily_order_quantities")
    .select("vegetable_id, quantity, unit, cutoff_at")
    .order("cutoff_at", { ascending: false });

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
    const p = latestPriceByVeg.get(v.id);
    return {
      id: v.id,
      name: v.name,
      unit: v.unit,
      quantity: q?.quantity ?? null,
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
