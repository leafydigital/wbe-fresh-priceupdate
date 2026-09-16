"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { href: "/supplier/dashboard", label: "Today's demand" },
  { href: "/supplier/update-prices", label: "Update prices" },
];

export default function SupplierNav({ profileName }: { profileName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="sticky top-0 z-20 bg-white border-b border-line px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-bold text-[14.5px] leading-tight">{profileName}</div>
          <div className="text-[11px] text-inksoft">Supplier account</div>
        </div>
        <button onClick={logout} className="text-inksoft text-sm">
          Logout
        </button>
      </div>
      <div className="max-w-[640px] mx-auto px-4 pt-4.5 flex gap-2">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 h-9.5 rounded-[9px] border text-[13px] font-bold flex items-center justify-center ${
                active ? "bg-brand-pale text-brand-dark border-brand" : "bg-white text-inksoft border-line"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
