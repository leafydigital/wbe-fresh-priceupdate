"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/prices", label: "Prices & orders" },
  { href: "/admin/vegetables", label: "Vegetables" },
  { href: "/admin/suppliers", label: "Suppliers" },
];

export default function AdminNav({ profileName }: { profileName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex md:flex-col w-[220px] border-r border-line px-3.5 py-5 sticky top-0 h-screen shrink-0">
        <div className="flex items-center gap-2 px-2 pb-5">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold text-sm">
            W
          </div>
          <span className="font-bold text-[15.5px]">WBE Fresh</span>
        </div>
        <div className="flex flex-col gap-0.5 flex-1">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] ${
                  active ? "bg-brand-pale text-brand-dark font-bold" : "text-inksoft font-medium"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
        <div className="border-t border-line pt-3 mt-3">
          <div className="text-xs text-inksoft px-2.5 pb-2">{profileName}</div>
          <button onClick={logout} className="px-2.5 py-2 rounded-lg text-[13.5px] text-inksoft text-left w-full">
            Logout
          </button>
        </div>
      </nav>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 bg-white border-b border-line px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand flex items-center justify-center text-white font-bold text-xs">
            W
          </div>
          <span className="font-bold text-sm">WBE Fresh</span>
        </div>
        <button onClick={logout} className="text-inksoft text-sm">
          Logout
        </button>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-line flex">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] ${
                active ? "text-brand font-bold" : "text-inksoft font-medium"
              }`}
            >
              {t.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>
    </>
  );
}
