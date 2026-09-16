"use client";

import { useEffect, useMemo, useState } from "react";
import { formatIstDateTime } from "@/lib/priceCycle";
import { formatRupees } from "@/lib/pricing";
import SearchBox from "@/components/SearchBox";
import BulkEditTable, { BulkEditRow } from "@/components/BulkEditTable";

type Item = { id: string; name: string; unit: string; currentPrice: number | null };

export default function SupplierUpdatePricesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [historyFor, setHistoryFor] = useState<Item | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/supplier/dashboard").then((r) => r.json());
    setItems(data.items ?? []);
    setLoading(false);
  }

  async function saveAll(changes: { id: string; value: number }[]) {
    const res = await fetch("/api/supplier/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: changes.map((c) => ({ vegetableId: c.id, updatedPrice: c.value })) }),
    });
    const body = await res.json().catch(() => ({ results: [] }));
    if (res.ok || res.status === 207) {
      setItems((prev) =>
        prev.map((item) => {
          const r = (body.results ?? []).find((x: any) => x.vegetableId === item.id);
          const change = changes.find((c) => c.id === item.id);
          if (r?.ok && change) return { ...item, currentPrice: change.value };
          return item;
        })
      );
      return body.results ?? changes.map((c) => ({ id: c.id, ok: true }));
    }
    throw new Error(body.error ?? "Save failed");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const rows: BulkEditRow[] = filtered.map((item) => ({
    id: item.id,
    label: item.name,
    sublabel: `per ${item.unit}`,
    currentValue: item.currentPrice,
    displayCurrentValue: item.currentPrice != null ? formatRupees(item.currentPrice) : "Not set",
  }));

  if (loading) return <p className="text-sm text-inksoft">Loading&hellip;</p>;

  return (
    <div>
      <SearchBox value={search} onChange={setSearch} />

      <BulkEditTable
        rows={rows}
        onSave={saveAll}
        emptyMessage="No vegetables match your search."
        // SupplierNav's account header (name + logout) is sticky at
        // top-0 on every screen size, not just mobile — unlike the
        // admin layout's fixed header, which only applies below the
        // md breakpoint. 65px is an estimate of that header's
        // rendered height (py-3 padding + two text lines); adjust
        // this value if the header's actual height changes.
        stickyTopClassName="top-[65px]"
        extraColumn={(row) => (
          <button
            onClick={() => {
              const item = items.find((i) => i.id === row.id);
              if (item) setHistoryFor(item);
            }}
            className="w-7 h-7 border border-line rounded-md text-inksoft text-xs"
            aria-label={`View ${row.label} history`}
          >
            H
          </button>
        )}
      />

      {historyFor && <SupplierHistoryModal item={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function SupplierHistoryModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [rows, setRows] = useState<{ cycle_start: string; recorded_at: string; updated_price: number; changed_by_name: string }[] | null>(null);

  if (rows === null) {
    fetch(`/api/admin/prices/${item.id}/history`)
      .then((r) => r.json())
      .then((data) => setRows(data.history ?? []));
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-end justify-center z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-t-2xl w-full max-w-[460px] px-5 pt-4.5 pb-6 max-h-[80vh] overflow-y-auto">
        <div className="w-9 h-1 bg-line rounded-full mx-auto mb-3.5" />
        <div className="flex justify-between items-baseline mb-3">
          <div className="text-[15px] font-bold">
            {item.name} <span className="text-xs text-inksoft font-normal">&middot; your changes since yesterday 3 PM</span>
          </div>
          <button onClick={onClose} className="text-inksoft">
            &times;
          </button>
        </div>
        {rows === null ? (
          <p className="text-sm text-inksoft py-4">Loading&hellip;</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-inksoft py-4">No changes since yesterday 3 PM.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rows.map((r, i) => (
              <div key={i} className="border border-line rounded-lg px-3 py-2.5">
                <div className="text-[11px] text-inksoft mb-1">{formatIstDateTime(new Date(r.recorded_at))}</div>
                <div className="font-mono-tabular font-semibold text-sm mb-1">{formatRupees(r.updated_price)}</div>
                <div className="text-[11.5px] text-inksoft">
                  Changed by: <span className="font-semibold">{r.changed_by_name}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}