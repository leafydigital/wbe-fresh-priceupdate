"use client";

import { useEffect, useRef, useState } from "react";
import { formatIstDateTime } from "@/lib/priceCycle";
import { formatRupees } from "@/lib/pricing";
import SearchBox from "@/components/SearchBox";
import PriceHistoryButton from "@/components/PriceHistoryButton";
import DirectionArrow from "@/components/DirectionArrow";

type Item = { id: string; name: string; unit: string; price: number | null; updatedAt: string | null; isUpdatePending: boolean };
type HistoryRow = { date: string; time: string; price: number; direction: "up" | "down" | "same" };
type PublicPricesResponse = {
  cycleStart: string;
  validUntil: string;
  items: Item[];
  history: Record<string, HistoryRow[]>;
  note: string;
};

const REFRESH_MS = 30_000; // 1 minute — public price list only, see note below

/**
 * Owns the live data for the public price page — the "Price
 * updated" / "Valid till" banner AND the price table together,
 * since both depend on the same fetch and must refresh in sync.
 *
 * This is the ONLY page in the app that self-refreshes on an
 * interval. Every other page (admin, supplier, login) is a normal
 * request/response page with no polling — this component is never
 * imported or reused outside app/page.tsx for that reason.
 *
 * `initialData` is what the server already fetched and rendered for
 * the first paint (so the page isn't blank while this component
 * mounts); after that, this component takes over and refetches
 * /api/public/prices every 60 seconds, replacing state in place —
 * no full page reload, no navigation, no lost scroll position or
 * open History sheet.
 */
export default function LivePublicPrices({ initialData }: { initialData: PublicPricesResponse }) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function refresh() {
      try {
        const res = await fetch("/api/public/prices", { cache: "no-store" });
        if (!res.ok) return; // keep showing the last good data on a transient failure
        const fresh: PublicPricesResponse = await res.json();
        setData(fresh);
      } catch {
        // Network hiccup — keep showing the last good data rather
        // than clearing the page or showing an error for a routine
        // background refresh.
      }
    }

    intervalRef.current = setInterval(refresh, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const mostRecentUpdate = data.items
    .map((i) => i.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const anyPending = data.items.some((i) => i.isUpdatePending);

  const filtered = search.trim()
    ? data.items.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()))
    : data.items;
  const available = filtered.filter((i) => i.price !== null);
  const neverPriced = filtered.filter((i) => i.price === null);

  return (
    <>
      <div className="px-5 pb-3.5">
        <div className="bg-white border border-line rounded-card px-4 py-3 flex justify-between items-center gap-3">
          <div>
            <div className="text-[11px] text-inksoft">Price updated</div>
            <div className="text-sm font-bold">
              {mostRecentUpdate ? formatIstDateTime(new Date(mostRecentUpdate)) : "Not yet priced"}
            </div>
          </div>
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
              anyPending ? "bg-danger-pale text-danger" : "bg-amber-pale text-amber"
            }`}
          >
            Valid till {formatIstDateTime(new Date(data.validUntil))}
          </div>
        </div>
      </div>

      <div className="px-5">
        <SearchBox value={search} onChange={setSearch} placeholder="Search vegetables..." />

        {data.items.length === 0 ? (
          <div className="bg-white border border-line rounded-card px-4 py-6 text-center text-sm text-inksoft">
            No vegetables available.
          </div>
        ) : filtered.length === 0 ? (
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
              const direction = data.history[item.id]?.[0]?.direction ?? "same";
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
                  <PriceHistoryButton name={item.name} unit={item.unit} rows={data.history[item.id] ?? []} />
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
      </div>

      <div className="px-5 pt-4">
        <div className="text-[11.5px] text-inksoft leading-relaxed border-t border-line pt-3.5">
          <strong className="font-semibold text-inksoft">Note:</strong> {data.note}
        </div>
      </div>
    </>
  );
}