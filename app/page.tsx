import Link from "next/link";
import LivePublicPrices from "@/components/LivePublicPrices";

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
 * The public price list is the app's root URL, and the ONLY page in
 * the whole app that auto-refreshes on a timer (every 60 seconds,
 * client-side, via components/LivePublicPrices.tsx) — /login,
 * /admin/*, and /supplier/* are ordinary pages with no polling.
 *
 * This file itself stays a Server Component that fetches once for
 * the initial page load (fast first paint, works with JS disabled),
 * then hands that data to LivePublicPrices as a seed; all of the
 * live-refresh behavior lives in that one client component so it's
 * easy to see, at a glance, that this is the only place it happens.
 *
 * Validity is entirely cycle-based (3 PM -> next day 1 PM), never a
 * plain midnight cutoff — see lib/priceCycle.ts. The most recent
 * price is always shown even if today's 3 PM update hasn't happened
 * yet (never-zero requirement).
 */
export default async function Home() {
  const data = await getPrices();

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

        <LivePublicPrices initialData={data} />


      </div>
    </main>
  );
}