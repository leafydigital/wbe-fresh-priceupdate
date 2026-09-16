"use client";

import { useMemo, useState } from "react";
import { formatRupees } from "@/lib/pricing";
import SearchBox from "@/components/SearchBox";
import PriceHistoryButton from "@/components/PriceHistoryButton";
import DirectionArrow from "@/components/DirectionArrow";

type Item = { id: string; name: string; unit: string; price: number | null; isUpdatePending: boolean };
type HistoryRow = { date: string; time: string; price: number; direction: "up" | "down" | "same" };

/**
 * price === null happens ONLY for a vegetable that has never had a
 * price saved at all, ever — not for "today's cycle hasn't been
 * updated yet" (that case still has a price, from the previous
 * cycle, and is shown normally). This is the never-zero requirement:
 * there is exactly one legitimate reason to show "Updating soon"
 * instead of a number, and it is not "it's before 3 PM."
 */
export default function PublicPriceList({ items, history }: { items: Item[]; history: Record<string, HistoryRow[]> }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const available = filtered.filter((i) => i.price !== null);
  const neverPriced = filtered.filter((i) => i.price === null);

  if (items.length === 0) {
    return (
      <div className="bg-white border border-line rounded-card px-4 py-6 text-center text-sm text-inksoft">
        No vegetables available.
      </div>
    );
  }

  return (
    <>
      <SearchBox value={search} onChange={setSearch} placeholder="Search vegetables..." />

      {filtered.length === 0 ? (
        <div className="bg-white border border-line rounded-card px-4 py-6 text-center text-sm text-inksoft">
          No vegetables match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        <div className="bg-white border border-line rounded-card overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] px-4 py-2.5 bg-brand-pale">
            <span className="text-[11px] font-bold text-brand-dark">Vegetable</span>
            <span className="text-[11px] font-bold text-brand-dark text-right pr-3.5">Price</span>
            <span className="text-[11px] font-bold text-brand-dark text-right">History</span>
          </div>
          {available.map((item) => {
            const direction = history[item.id]?.[0]?.direction ?? "same";
            return (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2.5 border-b border-line last:border-b-0"
              >
                <div>
                  <div className="font-semibold text-sm">{item.name}</div>
                  <div className="text-[10px] text-inksoft">per {item.unit}</div>
                </div>
                <div className="font-mono-tabular font-bold text-[15px] text-right pr-3.5 whitespace-nowrap">
                  <DirectionArrow direction={direction} />
                  {formatRupees(item.price!)}
                </div>
                <PriceHistoryButton name={item.name} unit={item.unit} rows={history[item.id] ?? []} />
              </div>
            );
          })}
          {neverPriced.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_auto] items-center px-4 py-2.5 border-b border-line last:border-b-0 opacity-60"
            >
              <div>
                <div className="font-semibold text-sm">{item.name}</div>
                <div className="text-[10px] text-inksoft">per {item.unit}</div>
              </div>
              <div className="text-xs text-inksoft italic">Updating soon</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}