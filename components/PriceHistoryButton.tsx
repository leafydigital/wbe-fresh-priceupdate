"use client";

import { useState } from "react";
import { formatRupees } from "@/lib/pricing";
import DirectionArrow from "@/components/DirectionArrow";

type Row = { date: string; time: string; price: number; direction: "up" | "down" | "same" };

/**
 * Icon button + bottom-sheet modal showing ONE comparison entry: the
 * price from the cycle immediately before whatever is currently
 * displayed (see app/api/public/prices/route.ts for exactly which
 * cycle that is — it is not always literally "yesterday"). Bottom
 * sheet rather than hover, per spec: mobile devices don't support
 * hover reliably, and buyers are mostly on phones.
 *
 * Shows date, time, price, and up/down direction only — this is the
 * public view, so it must never show who changed the price. The
 * admin/supplier equivalent (the history modals inside
 * app/admin/prices/page.tsx and app/supplier/update-prices/page.tsx)
 * are separate components precisely so this one can never
 * accidentally gain an attribution column through a shared edit.
 *
 * Direction/color is a deliberate, explicit business rule — NOT the
 * conventional green-up/red-down:
 *   current price HIGHER than this previous price -> up arrow, RED
 *   current price LOWER than this previous price -> down arrow, GREEN
 * See components/DirectionArrow.tsx — the same component also
 * renders this arrow next to the main price in the price list.
 */
export default function PriceHistoryButton({ name, unit, rows }: { name: string; unit: string; rows: Row[] }) {
  const [open, setOpen] = useState(false);
  const previous = rows[0] ?? null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`View ${name} previous price`}
        className="justify-self-end flex items-center gap-1 text-[11px] text-inksoft border border-line rounded-[7px] px-2 py-1"
      >
        History
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/45 flex items-end justify-center z-50" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-t-2xl w-full max-w-[460px] px-5 pt-4.5 pb-6">
            <div className="w-9 h-1 bg-line rounded-full mx-auto mb-3.5" />
            <div className="flex justify-between items-baseline mb-3">
              <div className="text-[15px] font-bold">
                {name} <span className="text-xs text-inksoft font-normal">&middot; previous price</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-inksoft">
                &times;
              </button>
            </div>
            {!previous ? (
              <p className="text-sm text-inksoft py-4">No previous price yet for this vegetable.</p>
            ) : (
              <div className="flex items-center justify-between py-2">
                <div className="text-[13.5px] text-inksoft">
                  {new Date(previous.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  <span className="text-inksoft/70"> &middot; {previous.time}</span>
                </div>
                <div className="font-mono-tabular text-base font-semibold whitespace-nowrap">
                  <DirectionArrow direction={previous.direction} size="lg" />
                  {formatRupees(previous.price)}
                  <span className="text-[11px] text-inksoft font-normal">/{unit}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}