import { formatUpdatedAt, isPriceExpired, formatRupees } from "@/lib/pricing";
import PriceHistoryButton from "@/components/PriceHistoryButton";

export const revalidate = 0; // always fetch fresh — this is a live price list

type PublicPricesResponse = {
  updatedAt: string | null;
  priceDate: string;
  items: { id: string; name: string; unit: string; price: number | null; updatedAt: string | null }[];
  history: Record<string, { date: string; price: number }[]>;
  note: string;
};

async function getPrices(): Promise<PublicPricesResponse> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/public/prices`, { cache: "no-store" });
  return res.json();
}

export default async function PublicPricesPage() {
  const data = await getPrices();
  const expired = isPriceExpired(data.priceDate);
  const available = data.items.filter((i) => i.price !== null);
  const pending = data.items.filter((i) => i.price === null);

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
                {data.updatedAt ? formatUpdatedAt(data.updatedAt) : "Not yet today"}
              </div>
            </div>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                expired ? "bg-danger-pale text-danger" : "bg-amber-pale text-amber"
              }`}
            >
              {expired ? "Price list expired" : "Valid till midnight"}
            </div>
          </div>
        </div>

        {expired || available.length === 0 ? (
          <div className="px-5">
            <div className="bg-white border border-line rounded-card px-4 py-6 text-center text-sm text-inksoft">
              {expired
                ? "Today's price list has expired. New prices will be updated shortly."
                : "Today's prices are currently being updated. Please check again shortly."}
            </div>
          </div>
        ) : (
          <div className="px-5">
            <div className="bg-white border border-line rounded-card overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] px-4 py-2.5 bg-brand-pale">
                <span className="text-[11px] font-bold text-brand-dark">Vegetable</span>
                <span className="text-[11px] font-bold text-brand-dark text-right pr-3.5">Price</span>
                <span className="text-[11px] font-bold text-brand-dark text-right">7-day</span>
              </div>
              {available.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2.5 border-b border-line last:border-b-0"
                >
                  <div>
                    <div className="font-semibold text-sm">{item.name}</div>
                    <div className="text-[10px] text-inksoft">per {item.unit}</div>
                  </div>
                  <div className="font-mono-tabular font-bold text-[15px] text-right pr-3.5">
                    {formatRupees(item.price!)}
                  </div>
                  <PriceHistoryButton
                    name={item.name}
                    unit={item.unit}
                    rows={data.history[item.id] ?? []}
                  />
                </div>
              ))}
              {pending.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto] items-center px-4 py-2.5 border-b border-line last:border-b-0 opacity-60"
                >
                  <div>
                    <div className="font-semibold text-sm">{item.name}</div>
                    <div className="text-[10px] text-inksoft">per {item.unit}</div>
                  </div>
                  <div className="text-xs text-inksoft italic">Updating soon</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 pt-4">
          <div className="text-[11.5px] text-inksoft leading-relaxed border-t border-line pt-3.5">
            <strong className="font-semibold text-inksoft">Note:</strong> {data.note}
          </div>
        </div>
      </div>
    </main>
  );
}
