import { requireRole } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("ADMIN"); // redirects to /login if not an active admin

  return (
    <div className="flex min-h-screen">
      <AdminNav profileName={profile.name} />
      <div className="flex-1 pt-[57px] md:pt-0 pb-[70px] md:pb-0 px-4 md:px-8 py-5 w-full md:max-w-[980px]">
        {children}
      </div>
    </div>
  );
}
