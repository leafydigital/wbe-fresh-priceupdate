"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRupees, finalPrice } from "@/lib/pricing";
import { formatIstDateTime } from "@/lib/priceCycle";
import SearchBox from "@/components/SearchBox";
import BulkEditTable, { BulkEditRow } from "@/components/BulkEditTable";

type Vegetable = { id: string; name: string; unit: string; status: string };
type PriceRow = { updated_price: number; final_price: number; updated_at: string | null; cycle_start: string };
type QtyRow = { quantity: number; unit: string };

export default function AdminPricesPage() {
  const [vegetables, setVegetables] = useState<Vegetable[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceRow>>({});
  const [quantities, setQuantities] = useState<Record<string, QtyRow>>({});
  const [margin, setMargin] = useState(0);
  const [marginDraft, setMarginDraft] = useState("0");
  const [editingMargin, setEditingMargin] = useState(false);
  const [cycleStart, setCycleStart] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string; unit: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const priceRes = await fetch("/api/admin/prices").then((r) => r.json());
    setVegetables(priceRes.sheet.map((s: any) => s.vegetable));
    setMargin(priceRes.margin ?? 0);
    setMarginDraft(String(priceRes.margin ?? 0));
    setCycleStart(priceRes.cycleStart ?? null);
    setValidUntil(priceRes.validUntil ?? null);

    const priceMap: Record<string, PriceRow> = {};
    for (const row of priceRes.sheet) {
      if (row.price) priceMap[row.vegetable.id] = row.price;
    }
    setPrices(priceMap);

    const qtyRes = await fetch("/api/admin/quantities").then((r) => r.json());
    const qtyMap: Record<string, QtyRow> = {};
    for (const q of qtyRes.quantities) qtyMap[q.vegetable_id] = q;
    setQuantities(qtyMap);

    setLoading(false);
  }

  async function saveQuantities(changes: { id: string; value: number }[]) {
    const res = await fetch("/api/admin/quantities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: changes.map((c) => ({
          vegetableId: c.id,
          quantity: c.value,
          unit: vegetables.find((v) => v.id === c.id)?.unit ?? "KG",
        })),
      }),
    });
    const body = await res.json().catch(() => ({ results: [] }));
    if (res.ok || res.status === 207) {
      setQuantities((prev) => {
        const next = { ...prev };
        for (const r of body.results ?? []) {
          if (r.ok) {
            const change = changes.find((c) => c.id === r.vegetableId);
            const unit = vegetables.find((v) => v.id === r.vegetableId)?.unit ?? "KG";
            if (change) next[r.vegetableId] = { quantity: change.value, unit };
          }
        }
        return next;
      });
      return body.results ?? changes.map((c) => ({ id: c.id, ok: true }));
    }
    throw new Error(body.error ?? "Save failed");
  }

  async function savePrices(changes: { id: string; value: number }[]) {
    const res = await fetch("/api/admin/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: changes.map((c) => ({ vegetableId: c.id, updatedPrice: c.value })) }),
    });
    const body = await res.json().catch(() => ({ results: [] }));
    if (res.ok || res.status === 207) {
      setPrices((prev) => {
        const next = { ...prev };
        for (const r of body.results ?? []) {
          if (r.ok) {
            const change = changes.find((c) => c.id === r.vegetableId);
            if (change) {
              next[r.vegetableId] = {
                updated_price: change.value,
                final_price: finalPrice(change.value, margin),
                updated_at: new Date().toISOString(),
                cycle_start: cycleStart ?? new Date().toISOString(),
              };
            }
          }
        }
        return next;
      });
      return body.results ?? changes.map((c) => ({ id: c.id, ok: true }));
    }
    throw new Error(body.error ?? "Save failed");
  }

  async function saveMargin() {
    const newMargin = Number(marginDraft);
    if (!Number.isFinite(newMargin) || newMargin < 0) return;
    if (newMargin === margin) {
      setEditingMargin(false);
      return;
    }
    const res = await fetch("/api/admin/settings/margin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ margin: newMargin }),
    });
    if (res.ok) {
      setMargin(newMargin);
      setPrices((prev) => {
        const next: Record<string, PriceRow> = {};
        for (const [id, p] of Object.entries(prev)) next[id] = { ...p, final_price: finalPrice(p.updated_price, newMargin) };
        return next;
      });
    } else {
      setMarginDraft(String(margin));
    }
    setEditingMargin(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vegetables;
    return vegetables.filter((v) => v.name.toLowerCase().includes(q));
  }, [vegetables, search]);

  const quantityRows: BulkEditRow[] = filtered.map((v) => {
    const q = quantities[v.id];
    return {
      id: v.id,
      label: v.name,
      sublabel: `per ${v.unit}`,
      currentValue: q?.quantity ?? null,
      displayCurrentValue: q ? `${q.quantity} ${v.unit}` : "Not set",
    };
  });

  const priceRows: BulkEditRow[] = filtered.map((v) => {
    const p = prices[v.id];
    return {
      id: v.id,
      label: v.name,
      sublabel: p ? `Final: ${formatRupees(finalPrice(p.updated_price, margin))}` : "No price saved yet",
      currentValue: p?.updated_price ?? null,
      displayCurrentValue: p ? formatRupees(p.updated_price) : "Not set",
    };
  });

  if (loading) return <p className="text-sm text-inksoft">Loading&hellip;</p>;

  return (
    <div>
      <div className="mb-4.5">
        <h1 className="text-xl font-bold tracking-tight">Prices &amp; today&rsquo;s orders</h1>
        {cycleStart && validUntil && (
          <p className="text-sm text-inksoft mt-0.5">
            Current cycle started {formatIstDateTime(new Date(cycleStart))} &middot; valid until {formatIstDateTime(new Date(validUntil))}
          </p>
        )}
      </div>

      <div className="bg-brand-pale border border-line rounded-card px-4 py-3.5 mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-brand-dark">Common margin</div>
          <div className="text-[11px] text-inksoft">Applied to every vegetable&rsquo;s final price</div>
        </div>
        {editingMargin ? (
          <input
            autoFocus
            type="number"
            value={marginDraft}
            onChange={(e) => setMarginDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveMargin()}
            onBlur={saveMargin}
            className="w-20 h-9 rounded-md border border-brand px-2 text-sm text-right font-mono-tabular font-bold"
          />
        ) : (
          <button onClick={() => setEditingMargin(true)} className="font-mono-tabular font-bold text-lg text-brand-dark">
            {formatRupees(margin)}
          </button>
        )}
      </div>

      <SearchBox value={search} onChange={setSearch} />

      <div className="mb-8">
        <h2 className="text-[15px] font-bold mb-2.5">Today&rsquo;s order quantity</h2>
        <BulkEditTable
          rows={quantityRows}
          unitSuffix={(row) => vegetables.find((v) => v.id === row.id)?.unit ?? ""}
          onSave={saveQuantities}
          emptyMessage="No vegetables match your search."
          stickyTopClassName="top-[57px] md:top-0"
        />
      </div>

      <div>
        <h2 className="text-[15px] font-bold mb-2.5">Updated price</h2>
        <BulkEditTable
          rows={priceRows}
          onSave={savePrices}
          emptyMessage="No vegetables match your search."
          stickyTopClassName="top-[57px] md:top-0"
          extraColumn={(row) => (
            <button
              onClick={() => {
                if (historyFor?.id === row.id) return;
                const v = vegetables.find((x) => x.id === row.id);
                if (v) setHistoryFor({ id: v.id, name: v.name, unit: v.unit });
              }}
              disabled={historyFor?.id === row.id}
              className="w-7 h-7 border border-line rounded-md text-inksoft text-xs disabled:opacity-50"
              aria-label={`View ${row.label} history`}
            >
              H
            </button>
          )}
        />
      </div>

      {historyFor && <AdminPriceHistoryModal target={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

type AdminHistoryRow = {
  cycle_start: string;
  recorded_at: string;
  updated_price: number;
  final_price: number;
  changed_by_name: string;
  updated_by_role: string | null;
};

function AdminPriceHistoryModal({
  target,
  onClose,
}: {
  target: { id: string; name: string; unit: string };
  onClose: () => void;
}) {
  const [rows, setRows] = useState<AdminHistoryRow[] | null>(null);

  useEffect(() => {
    setRows(null);
    const controller = new AbortController();
    fetch(`/api/admin/prices/${target.id}/history`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setRows(data.history ?? []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch history:", err);
        }
      });
    return () => { controller.abort(); };
  }, [target.id]);

  return (
    <div className="fixed inset-0 bg-black/45 flex items-end justify-center z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-t-2xl w-full max-w-[460px] px-5 pt-4.5 pb-6 max-h-[80vh] overflow-y-auto">
        <div className="w-9 h-1 bg-line rounded-full mx-auto mb-3.5" />
        <div className="flex justify-between items-baseline mb-3">
          <div className="text-[15px] font-bold">
            {target.name} <span className="text-xs text-inksoft font-normal">&middot; changes since yesterday 3 PM</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-inksoft">
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
                <div className="font-mono-tabular font-semibold text-sm mb-1">
                  {formatRupees(r.updated_price)} <span className="text-inksoft font-normal">updated</span>
                  {" \u2192 "}
                  {formatRupees(r.final_price)} <span className="text-inksoft font-normal">final</span>
                </div>
                <div className="text-[11.5px] text-inksoft">
                  Changed by: <span className="font-semibold">{r.changed_by_name}</span>
                  {r.updated_by_role && ` (${r.updated_by_role === "ADMIN" ? "Admin" : "Supplier"})`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}