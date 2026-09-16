import { formatRupees } from "@/lib/pricing";

type SheetRow = {
  vegetable: { id: string; name: string; unit: string; status: string };
  price: { updated_price: number; final_price: number; cycle_start?: string } | null;
};

/**
 * Read-only glance at the current price sheet, shown on the
 * dashboard. No Status column — removed per spec ("remove
 * unnecessary Status column from the dashboard display"; the
 * database status field itself is untouched and still drives
 * soft-delete on /admin/vegetables). No editing here either — the
 * editable version lives entirely on /admin/prices.
 */
export default function PriceSheetPreview({ sheet }: { sheet: SheetRow[] }) {
  return (
    <div className="bg-white border border-line rounded-card overflow-hidden overflow-x-auto">
      <table>
        <thead>
          <tr className="bg-brand-pale">
            <Th>Vegetable</Th>
            <Th align="right">Updated price</Th>
            <Th align="right">Final price</Th>
          </tr>
        </thead>
        <tbody>
          {sheet.map(({ vegetable: v, price: p }) => (
            <tr key={v.id} className="border-b border-line last:border-b-0">
              <Td>
                <div className="font-semibold text-[13.5px]">{v.name}</div>
                <div className="text-[11px] text-inksoft">per {v.unit}</div>
              </Td>
              <Td align="right">
                <span className="font-mono-tabular font-semibold text-[13.5px]">
                  {p ? formatRupees(p.updated_price) : "\u2014"}
                </span>
              </Td>
              <Td align="right">
                <span className="font-mono-tabular font-bold text-brand-dark text-sm">
                  {p ? formatRupees(p.final_price) : "\u2014"}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`text-[11px] font-bold text-brand-dark px-3.5 py-2.5 whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <td className={`px-3.5 py-2.5 align-middle ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}
