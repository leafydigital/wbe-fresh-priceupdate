"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRupees } from "@/lib/pricing";
import { formatIstTime } from "@/lib/priceCycle";
import SearchBox from "@/components/SearchBox";

type Item = { id: string; name: string; unit: string; quantity: number | null; currentPrice: number | null };

export default function SupplierDashboardPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [totalQuantity, setTotalQuantity] = useState(0);
  const [orderCutoff, setOrderCutoff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/supplier/dashboard")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setTotalQuantity(data.totalQuantity ?? 0);
        setOrderCutoff(data.orderCutoff ?? null);
        setLoading(false);
      });
  }, []);

  /**
   * Highest demand first — but a KG figure and a Bundle figure
   * aren't comparable magnitudes, so this groups by unit first (each
   * group internally sorted descending by quantity) rather than
   * producing one flat list that would imply "500 KG onions need
   * more attention than 50 Bundle beans," which isn't a claim this
   * data can actually support.
   */
  const groupedSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;

    const byUnit = new Map<string, Item[]>();
    for (const item of filtered) {
      (byUnit.get(item.unit) ?? byUnit.set(item.unit, []).get(item.unit)!).push(item);
    }
    for (const group of byUnit.values()) {
      group.sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0));
    }
    return [...byUnit.entries()].sort(([, a], [, b]) => (b[0]?.quantity ?? 0) - (a[0]?.quantity ?? 0));
  }, [items, search]);

  if (loading) return <p className="text-sm text-inksoft">Loading&hellip;</p>;

  return (
    <div>
      {/* <div className="bg-brand-dark rounded-2xl px-5 py-4.5 text-white mb-3">
        <div className="text-[12.5px] opacity-85 mb-1">Today&rsquo;s total required quantity</div>
        <div className="font-mono-tabular text-[30px] font-bold">{totalQuantity.toLocaleString("en-IN")} KG</div>
        <div className="text-xs opacity-75 mt-1.5">Across all vegetables &middot; plan your stock accordingly</div>
      </div> */}

      {orderCutoff && (
        <div className="bg-amber-pale border border-amber/30 rounded-card px-4 py-2.5 mb-4.5 flex items-center gap-2">
          <span className="text-amber font-semibold text-xs">Orders close at {formatIstTime(new Date(orderCutoff))}</span>
        </div>
      )}

      <SearchBox value={search} onChange={setSearch} />

      <div className="text-sm font-bold mb-2.5">Quantity needed by vegetable, highest first</div>
      {groupedSorted.length === 0 ? (
        <div className="bg-white border border-line rounded-card px-4 py-6 text-center text-sm text-inksoft">
          No vegetables match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        groupedSorted.map(([unit, group]) => (
          <div key={unit} className="mb-3">
            <div className="text-[11px] font-semibold text-inksoft mb-1.5 uppercase tracking-wide">{unit}</div>
            <div className="bg-white border border-line rounded-card overflow-hidden">
              {group.map((item) => (
                <div key={item.id} className="flex justify-between items-center px-4 py-3 border-b border-line last:border-b-0">
                  <div>
                    <div className="font-semibold text-sm">{item.name}</div>
                    <div className="text-[11.5px] text-inksoft">
                      Your current price: {item.currentPrice != null ? formatRupees(item.currentPrice) : "not set yet"}
                    </div>
                  </div>
                  <div className="font-mono-tabular font-bold text-[15px]">
                    {item.quantity != null ? `${item.quantity} ${item.unit}` : "\u2014"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
