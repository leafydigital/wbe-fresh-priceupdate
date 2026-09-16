"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push(body.role === "ADMIN" ? "/admin/dashboard" : "/supplier/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-line rounded-card p-6">
        <Link href="/" className="text-sm text-inksoft mb-4 inline-block">
          &#8592; Back to price list
        </Link>
        <h1 className="text-lg font-bold mb-1">Log in</h1>
        {/* <p className="text-sm text-inksoft mb-5">
          Admin, use your email. Supplier, use the username given to you.
        </p> */}

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1">Username</label>
            <input
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter Username"
              className="w-full h-10 rounded-[9px] border border-linestrong px-3 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Password"
              className="w-full h-10 rounded-[9px] border border-linestrong px-3 text-sm outline-none focus:border-brand"
            />
          </div>
          {error && <div className="text-xs text-danger bg-danger-pale rounded-lg px-3 py-2">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="h-11 mt-1 rounded-[9px] bg-brand text-white text-sm font-semibold disabled:opacity-60"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}