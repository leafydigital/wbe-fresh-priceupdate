"use client";

import { useEffect, useMemo, useState } from "react";
import SearchBox from "@/components/SearchBox";

type Supplier = {
  id: string;
  business_name: string;
  contact_person: string | null;
  phone: string | null;
  status: "ACTIVE" | "DISABLED";
  profiles: { username: string };
};

const PHONE_REGEX = /^[0-9]{10}$/;

export default function AdminSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ businessName: "", contactPerson: "", phone: "", username: "", password: "" });
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/suppliers").then((r) => r.json());
    setSuppliers(res.suppliers ?? []);
    setLoading(false);
  }

  async function createSupplier(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.businessName.trim() || !form.username.trim() || form.password.length < 8) {
      setError("Business name, username and a password of at least 8 characters are required.");
      return;
    }
    // Phone is optional, but if given, must be exactly 10 digits —
    // checked here for instant feedback; the API and a database
    // check constraint both enforce this too (requirement 12).
    if (form.phone && !PHONE_REGEX.test(form.phone)) {
      setError("Phone number must be exactly 10 digits.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not create supplier.");
        return;
      }
      setForm({ businessName: "", contactPerson: "", phone: "", username: "", password: "" });
      setAdding(false);
      load();
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(s: Supplier) {
    const newStatus = s.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const res = await fetch(`/api/admin/suppliers/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setSuppliers((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: newStatus } : x)));
    }
  }

  async function deleteSupplier(s: Supplier) {
    const res = await fetch(`/api/admin/suppliers/${s.id}`, { method: "DELETE" });
    if (res.ok) {
      setSuppliers((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "DISABLED" } : x)));
    }
    setConfirmingDelete(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) => s.business_name.toLowerCase().includes(q) || s.profiles?.username?.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  if (loading) return <p className="text-sm text-inksoft">Loading&hellip;</p>;

  return (
    <div>
      <div className="flex justify-between items-end mb-4.5 gap-2.5 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-sm text-inksoft mt-0.5">
            {suppliers.length} suppliers &middot; {suppliers.filter((s) => s.status === "ACTIVE").length} active
          </p>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="h-10 px-3.5 rounded-[9px] bg-brand text-white text-sm font-semibold"
        >
          + Create supplier
        </button>
      </div>

      {adding && (
        <form onSubmit={createSupplier} className="bg-white border border-line rounded-card p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <Field label="Supplier name" value={form.businessName} onChange={(v) => setForm((f) => ({ ...f, businessName: v }))} placeholder="e.g. Anand Traders" />
          <Field label="Contact person" value={form.contactPerson} onChange={(v) => setForm((f) => ({ ...f, contactPerson: v }))} placeholder="e.g. Anand Kumar" />
          <Field
            label="Phone (10 digits)"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v.replace(/[^0-9]/g, "").slice(0, 10) }))}
            placeholder="9876543210"
          />
          <Field label="Username" value={form.username} onChange={(v) => setForm((f) => ({ ...f, username: v }))} placeholder="supplier04" />
          <Field label="Password" value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} placeholder="Set a password" type="password" />
          <div className="flex items-end">
            <button type="submit" disabled={creating} className="h-10 w-full rounded-[9px] bg-brand text-white text-sm font-semibold disabled:opacity-60">
              {creating ? "Creating…" : "Create supplier"}
            </button>
          </div>
          {error && <div className="text-xs text-danger md:col-span-3">{error}</div>}
        </form>
      )}

      <SearchBox value={search} onChange={setSearch} placeholder="Search suppliers..." />

      <div className="bg-white border border-line rounded-card overflow-hidden">
        <table>
          <thead>
            <tr className="bg-brand-pale">
              <th className="text-left text-[11px] font-bold text-brand-dark px-3.5 py-2.5">Supplier</th>
              <th className="text-left text-[11px] font-bold text-brand-dark px-3.5 py-2.5">Username</th>
              <th className="text-left text-[11px] font-bold text-brand-dark px-3.5 py-2.5">Phone</th>
              <th className="text-right text-[11px] font-bold text-brand-dark px-3.5 py-2.5">Status</th>
              <th className="text-right text-[11px] font-bold text-brand-dark px-3.5 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3.5 py-6 text-center text-sm text-inksoft">
                  No suppliers match &ldquo;{search}&rdquo;.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-b-0">
                  <td className="px-3.5 py-2.5">
                    <div className="font-semibold text-[13.5px]">{s.business_name}</div>
                    <div className="text-[11px] text-inksoft">{s.contact_person}</div>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono-tabular text-xs">{s.profiles?.username}</td>
                  <td className="px-3.5 py-2.5 text-sm text-inksoft">{s.phone}</td>
                  <td className="px-3.5 py-2.5 text-right">
                    <button onClick={() => toggleStatus(s)}>
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                          s.status === "ACTIVE" ? "bg-brand-pale text-brand-dark" : "bg-danger-pale text-danger"
                        }`}
                      >
                        {s.status === "ACTIVE" ? "Active" : "Deactivated"}
                      </span>
                    </button>
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    {s.status === "ACTIVE" &&
                      (confirmingDelete === s.id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => deleteSupplier(s)}
                            className="text-[11px] font-semibold text-white bg-danger rounded-md px-2 py-1"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmingDelete(null)}
                            className="text-[11px] font-semibold text-inksoft border border-line rounded-md px-2 py-1"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmingDelete(s.id)}
                          className="text-[11px] font-semibold text-danger border border-danger/30 rounded-md px-2 py-1"
                        >
                          Delete
                        </button>
                      ))}
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-inksoft mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 rounded-[9px] border border-linestrong px-3 text-sm"
      />
    </div>
  );
}
