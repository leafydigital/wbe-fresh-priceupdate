"use client";

import { useEffect, useMemo, useState } from "react";
import InlineEditable from "@/components/InlineEditable";
import SearchBox from "@/components/SearchBox";

type Vegetable = { id: string; name: string; unit: string; status: "ACTIVE" | "DISABLED" };
const UNITS = ["KG", "Piece", "Box", "Bundle"];

export default function AdminVegetablesPage() {
  const [vegetables, setVegetables] = useState<Vegetable[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("KG");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/vegetables").then((r) => r.json());
    setVegetables(res.vegetables ?? []);
    setLoading(false);
  }

  async function addVegetable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return;
    const res = await fetch("/api/admin/vegetables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), unit }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Could not add vegetable.");
      return;
    }
    setVegetables((prev) => [...prev, body.vegetable].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
    setUnit("KG");
    setAdding(false);
  }

  async function saveName(v: Vegetable, newName: string) {
    if (!newName.trim()) throw new Error("Name can't be empty");
    const res = await fetch(`/api/admin/vegetables/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!res.ok) throw new Error("Save failed");
    setVegetables((prev) => prev.map((x) => (x.id === v.id ? { ...x, name: newName.trim() } : x)));
  }

  async function saveUnit(v: Vegetable, newUnit: string) {
    if (!UNITS.includes(newUnit)) throw new Error("Invalid unit");
    const res = await fetch(`/api/admin/vegetables/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unit: newUnit }),
    });
    if (!res.ok) throw new Error("Save failed");
    setVegetables((prev) => prev.map((x) => (x.id === v.id ? { ...x, unit: newUnit } : x)));
  }

  async function toggleStatus(v: Vegetable) {
    const newStatus = v.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const res = await fetch(`/api/admin/vegetables/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setVegetables((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: newStatus } : x)));
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vegetables;
    return vegetables.filter((v) => v.name.toLowerCase().includes(q));
  }, [vegetables, search]);

  if (loading) return <p className="text-sm text-inksoft">Loading&hellip;</p>;

  return (
    <div>
      <div className="flex justify-between items-end mb-4.5 gap-2.5 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Vegetables</h1>
          <p className="text-sm text-inksoft mt-0.5">
            {vegetables.length} items &middot; {vegetables.filter((v) => v.status === "ACTIVE").length} active
          </p>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="h-10 px-3.5 rounded-[9px] bg-brand text-white text-sm font-semibold"
        >
          + Add vegetable
        </button>
      </div>

      {adding && (
        <form onSubmit={addVegetable} className="bg-white border border-line rounded-card p-4 mb-4 flex gap-2.5 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-inksoft mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Beetroot"
              className="w-full h-10 rounded-[9px] border border-linestrong px-3 text-sm"
            />
          </div>
          <div className="w-[120px]">
            <label className="block text-xs font-semibold text-inksoft mb-1">Unit</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full h-10 rounded-[9px] border border-linestrong px-3 text-sm">
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="h-10 px-4 rounded-[9px] bg-brand text-white text-sm font-semibold">
            Add
          </button>
          {error && <div className="text-xs text-danger w-full">{error}</div>}
        </form>
      )}

      <SearchBox value={search} onChange={setSearch} />

      <div className="bg-white border border-line rounded-card overflow-hidden">
        <table>
          <thead>
            <tr className="bg-brand-pale">
              <th className="text-left text-[11px] font-bold text-brand-dark px-3.5 py-2.5">Vegetable</th>
              <th className="text-left text-[11px] font-bold text-brand-dark px-3.5 py-2.5">Unit</th>
              <th className="text-right text-[11px] font-bold text-brand-dark px-3.5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3.5 py-6 text-center text-sm text-inksoft">
                  No vegetables match &ldquo;{search}&rdquo;.
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr key={v.id} className="border-b border-line last:border-b-0">
                  <td className="px-3.5 py-2.5">
                    <InlineEditable
                      value={v.name}
                      onSave={(val) => saveName(v, val)}
                      ariaLabel={`${v.name} name`}
                      displayClassName="font-semibold text-[13.5px]"
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <InlineUnitSelect value={v.unit} onSave={(val) => saveUnit(v, val)} />
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    <button onClick={() => toggleStatus(v)}>
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                          v.status === "ACTIVE" ? "bg-brand-pale text-brand-dark" : "bg-danger-pale text-danger"
                        }`}
                      >
                        {v.status === "ACTIVE" ? "Active" : "Removed"}
                      </span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Unit is a small fixed set, so this is a click-to-reveal <select>
 * rather than InlineEditable's free-text input — same click/save/
 * blur shape (choosing an option in a <select> fires onChange
 * immediately, which acts as "Enter"), but it can never contain an
 * invalid unit the way a free-text field could.
 */
function InlineUnitSelect({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-sm text-inksoft rounded-md px-1 -mx-1 hover:bg-brand-pale/60">
        {value}
      </button>
    );
  }

  return (
    <select
      autoFocus
      value={value}
      disabled={saving}
      onChange={async (e) => {
        setSaving(true);
        try {
          await onSave(e.target.value);
        } finally {
          setSaving(false);
          setEditing(false);
        }
      }}
      onBlur={() => setEditing(false)}
      className="h-8 rounded-md border border-brand px-2 text-sm"
    >
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );
}
