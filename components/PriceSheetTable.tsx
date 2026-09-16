"use client";

import { useState } from "react";
import { formatRupees } from "@/lib/pricing";

type SheetRow = {
  vegetable: { id: string; name: string; unit: string; status: string };
  price: { updated_price: number; margin: number; final_price: number; updated_at: string } | null;
};

export default function PriceSheetTable({ sheet, compact }: { sheet: SheetRow[]; compact?: boolean }) {
  const [historyFor, setHistoryFor] = useState<{ vegId: string; name: string; unit: string; field: "updated" | "margin" } | null>(null);

  return (
    <>
      <div className="bg-white border border-line rounded-card overflow-hidden overflow-x-auto">
        <table>
          <thead>
            <tr className="bg-brand-pale">
              <Th>Vegetable</Th>
              <Th align="right">Updated price</Th>
              <Th align="right">Margin</Th>
              <Th align="right">Final price</Th>
              {!compact && <Th align="right">Status</Th>}
            </tr>
          </thead>
          <tbody>
            {sheet.map(({ vegetable: v, price: p }) => {
              const has = !!p;
              return (
                <tr key={v.id} className="border-b border-line last:border-b-0">
                  <Td>
                    <div className="font-semibold text-[13.5px]">{v.name}</div>
                    <div className="text-[11px] text-inksoft">per {v.unit}</div>
                  </Td>
                  <Td align="right">
                    {has ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => setHistoryFor({ vegId: v.id, name: v.name, unit: v.unit, field: "updated" })}
                          aria-label="View price history"
                          className="w-6 h-6 border border-line rounded-md text-inksoft text-xs"
                        >
                          H
                        </button>
                        <span className="font-mono-tabular font-semibold text-[13.5px]">{formatRupees(p!.updated_price)}</span>
                      </div>
                    ) : (
                      <span className="text-inksoft text-xs">&mdash;</span>
                    )}
                  </Td>
                  <Td align="right">
                    {has ? (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => setHistoryFor({ vegId: v.id, name: v.name, unit: v.unit, field: "margin" })}
                          aria-label="View margin history"
                          className="w-6 h-6 border border-line rounded-md text-inksoft text-xs"
                        >
                          H
                        </button>
                        <span className="font-mono-tabular text-[13.5px] text-inksoft">{formatRupees(p!.margin)}</span>
                      </div>
                    ) : (
                      <span className="text-inksoft text-xs">&mdash;</span>
                    )}
                  </Td>
                  <Td align="right">
                    {has ? (
                      <span className="font-mono-tabular font-bold text-brand-dark text-[14px]">{formatRupees(p!.final_price)}</span>
                    ) : (
                      <span className="text-inksoft text-xs">Pending</span>
                    )}
                  </Td>
                  {!compact && (
                    <Td align="right">
                      {has ? <Badge tone="green">Updated</Badge> : <Badge tone="amber">Awaiting price</Badge>}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {historyFor && <HistoryModal target={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`text-[11px] font-bold text-brand-dark px-3.5 py-2.5 whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <td className={`px-3.5 py-2.5 align-middle ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}
function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" }) {
  return (
    <span
      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
        tone === "green" ? "bg-brand-pale text-brand-dark" : "bg-amber-pale text-amber"
      }`}
    >
      {children}
    </span>
  );
}

function HistoryModal({
  target,
  onClose,
}: {
  target: { vegId: string; name: string; unit: string; field: "updated" | "margin" };
  onClose: () => void;
}) {
  const [rows, setRows] = useState<{ price_date: string; updated_price: number; margin: number }[] | null>(null);

  if (rows === null) {
    fetch(`/api/admin/prices/${target.vegId}/history`)
      .then((r) => r.json())
      .then((data) => setRows(data.history ?? []));
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-end justify-center z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-t-2xl w-full max-w-[460px] px-5 pt-4.5 pb-6">
        <div className="w-9 h-1 bg-line rounded-full mx-auto mb-3.5" />
        <div className="flex justify-between items-baseline mb-3">
          <div className="text-[15px] font-bold">
            {target.name} <span className="text-xs text-inksoft font-normal">&middot; {target.field === "margin" ? "margin" : "updated price"}, last 7 days</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-inksoft">
            &times;
          </button>
        </div>
        {rows === null ? (
          <p className="text-sm text-inksoft py-4">Loading&hellip;</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-inksoft py-4">No history yet.</p>
        ) : (
          <table>
            <tbody>
              {rows.map((r) => {
                const val = target.field === "margin" ? r.margin : r.updated_price;
                return (
                  <tr key={r.price_date} className="border-b border-line">
                    <td className="py-2 text-[13.5px] text-inksoft">
                      {new Date(r.price_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </td>
                    <td className="font-mono-tabular py-2 pl-3 text-sm font-semibold text-right">{formatRupees(val)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
