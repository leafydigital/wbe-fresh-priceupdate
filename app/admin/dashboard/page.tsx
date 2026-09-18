import { createClient } from "@/lib/supabase/server";
import { getCommonMargin, formatRupees } from "@/lib/pricing";
import { getCurrentCycle, formatIstDateTime } from "@/lib/priceCycle";
import PriceSheetPreview from "@/components/PriceSheetPreview";
import Link from "next/link";

/**
 * Simplified per spec: exactly two cards (Active Suppliers, Total
 * Vegetables). Order-quantity and price-updated-count cards from the
 * earlier design are removed — that information still lives on
 * /admin/prices, which is what this dashboard links to.
 */
export default async function AdminDashboardPage() {
  const supabase = createClient();
  const currentCycle = getCurrentCycle(new Date());

  const [{ data: vegetables }, { data: allPrices }, { data: suppliers }] = await Promise.all([
    supabase.from("vegetables").select("id, name, unit, status").eq("status", "ACTIVE").order("name"),
    supabase.from("daily_prices").select("vegetable_id, updated_price, final_price, cycle_start").order("cycle_start", { ascending: false }),
    supabase.from("suppliers").select("id, status"),
  ]);

  const veg = vegetables ?? [];
  const margin = await getCommonMargin(supabase);
  const activeSuppliers = (suppliers ?? []).filter((s) => s.status === "ACTIVE").length;

  const latestByVeg = new Map<string, (typeof allPrices)[number]>();
  for (const row of allPrices ?? []) {
    if (!latestByVeg.has(row.vegetable_id)) latestByVeg.set(row.vegetable_id, row);
  }
  const sheet = veg.map((v) => ({ vegetable: v, price: latestByVeg.get(v.id) ?? null }));

  const cards = [
    { label: "Active Suppliers", value: activeSuppliers },
    { label: "Total Vegetables", value: veg.length },
  ];

  return (
    <div>
      <div className="mb-4.5">
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-inksoft mt-0.5">
          Current cycle: {formatIstDateTime(currentCycle.cycleStart)} &middot; valid until {formatIstDateTime(currentCycle.validUntil)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-5 max-w-md">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-line rounded-card px-4 py-3.5">
            <div className="font-mono-tabular text-[28px] font-bold">{c.value}</div>
            <div className="text-xs text-inksoft font-semibold mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center mb-2.5">
        <div className="text-[15px] font-bold">
          Live price sheet <span className="text-xs text-inksoft font-normal">&middot; common margin {formatRupees(margin)}</span>
        </div>
        <Link href="/admin/prices" className="inline-flex items-center px-4 py-2 bg-brand text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-sm">
          Manage &#8594;
        </Link>
      </div>
      <PriceSheetPreview sheet={sheet} />
    </div>
  );
}