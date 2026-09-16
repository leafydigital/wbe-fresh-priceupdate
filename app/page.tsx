import Link from "next/link";
import { formatIstDateTime } from "@/lib/priceCycle";
import PublicPriceList from "@/components/PublicPriceList";

export const revalidate = 0; // always fetch fresh — this is a live price list

type PublicPricesResponse = {
  cycleStart: string;
  validUntil: string;
  items: { id: string; name: string; unit: string; price: number | null; updatedAt: string | null; isUpdatePending: boolean }[];
  history: Record<string, { date: string; time: string; price: number; direction: "up" | "down" | "same" }[]>;
  note: string;
};

async function getPrices(): Promise<PublicPricesResponse> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/public/prices`, { cache: "no-store" });
  return res.json();
}

/**
 * The public price list is the app's root URL. Validity is entirely
 * cycle-based now (3 PM -> next day 1 PM), never a plain midnight
 * cutoff — see lib/priceCycle.ts. The most recent price is always
 * shown even if today's 3 PM update hasn't happened yet (never-zero
 * requirement); `anyPending` only controls the validity indicator's
 * color, never whether a price is shown.
 */
export default async function Home() {
  const data = await getPrices();
  const mostRecentUpdate = data.items
    .map((i) => i.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const anyPending = data.items.some((i) => i.isUpdatePending);

  return (
    <main className="min-h-screen">
      <div className="max-w-[480px] mx-auto pb-10">
        <div className="text-center pt-7 pb-4 px-5">
          <div className="w-12 h-12 rounded-xl bg-brand flex items-center justify-center text-white font-bold text-lg mx-auto mb-2.5">
            W
          </div>
          <div className="text-xl font-bold tracking-tight">WBE Fresh</div>
          <div className="text-xs text-inksoft mt-0.5">Fresh fruits &amp; vegetables, wholesale</div>
        </div>

        <div className="px-5 pb-3.5">
          <div className="bg-white border border-line rounded-card px-4 py-3 flex justify-between items-center gap-3">
            <div>
              <div className="text-[11px] text-inksoft">Price updated</div>
              <div className="text-sm font-bold">
                {mostRecentUpdate ? formatIstDateTime(new Date(mostRecentUpdate)) : "Not yet priced"}
              </div>
            </div>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-bold whitespace-nowrap ${
                anyPending
                  ? "bg-red-100 text-red-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              Valid till {formatIstDateTime(new Date(data.validUntil))}
            </div>
          </div>
        </div>

        <div className="px-5">
          <PublicPriceList items={data.items} history={data.history} />
        </div>

        <div className="px-5 pt-4">
          <div className="text-[11.5px] text-inksoft leading-relaxed border-t border-line pt-3.5">
            <strong className="font-semibold text-inksoft">Note:</strong> {data.note}
          </div>
        </div>

        {/* <div className="text-center pt-6">
          <Link href="/login" className="text-[11.5px] text-inksoft underline">
            Admin / Supplier login
          </Link>
        </div> */}
      </div>
    </main>
  );
}
