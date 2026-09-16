import { requireRole } from "@/lib/auth";
import SupplierNav from "@/components/SupplierNav";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("SUPPLIER"); // redirects to /login if not an active supplier

  return (
    <div className="min-h-screen">
      <SupplierNav profileName={profile.name} />
      <div className="max-w-[640px] mx-auto px-4 py-4.5 pb-24">{children}</div>
    </div>
  );
}
