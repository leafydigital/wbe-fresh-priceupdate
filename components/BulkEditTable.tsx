"use client";

import { useMemo, useState } from "react";

export type BulkEditRow = {
  id: string;
  label: string;
  sublabel?: string;
  currentValue: number | null; // null = never set at all (not the same as 0)
  displayCurrentValue: string; // formatted for display, e.g. "₹23" or "250 KG"
};

/**
 * Shared pattern for "many always-editable inputs, reviewed together,
 * saved with one sticky button." Used by the admin Order Quantity
 * section, admin Updated Price section, and the supplier price
 * table — three places that would otherwise reimplement identical
 * draft-tracking, red/green comparison, and sticky-save logic.
 *
 * Behavior:
 * - Every row's input is always visible and always editable — no
 *   click-to-reveal, no separate Edit button.
 * - Draft values are pure local state until Save is clicked; nothing
 *   is sent to the server per keystroke or per field.
 * - The CURRENT column's value is the one that changes color, not
 *   the New input — this is a deliberate reversal from an earlier
 *   version and is the explicit rule as stated: while the supplier
 *   is typing, they read down the Current column to see at a glance
 *   which rows are still untouched vs. which they've changed.
 *     - New EQUALS current -> Current shown in RED (not yet changed)
 *     - New DIFFERS from current -> Current shown in GREEN (changed,
 *       will be saved)
 *     - Row never had a value and the New field is still empty ->
 *       neutral color, nothing to compare against yet.
 * - The sticky Save bar is disabled and reads "No changes to save"
 *   when no row's draft differs from its current value, and only
 *   ever submits the rows that actually changed.
 * - After a successful save, drafts collapse back to equal current
 *   values (parent passes the new currentValue back down), so every
 *   row's Current column returns to red (nothing pending) automatically.
 *
 * Sticky save bar: sticks to the top of this table's own scroll
 * position (position: sticky, not fixed to the viewport) so it
 * stays visible while scrolling through THIS table's rows. Sticky
 * rather than fixed specifically because a page can have more than
 * one BulkEditTable on it (e.g. admin's Order Quantity section
 * stacked above its Updated Price section) — a viewport-fixed bar
 * would have two instances overlapping each other; container-scoped
 * sticky naturally hands off from one table's bar to the next.
 *
 * `stickyTopClassName` (default "top-0") must be set by the caller
 * to clear whatever fixed/sticky header already occupies the top of
 * that page — two sticky siblings both at top-0 will overlap each
 * other rather than stack, since sticky positioning doesn't know
 * about other sticky elements. See each page's own use of this
 * component for the exact offset it passes.
 */
export default function BulkEditTable({
  rows,
  unitSuffix,
  onSave,
  savingLabel = "Saving…",
  emptyMessage = "No vegetables match your search.",
  extraColumn,
  stickyTopClassName = "top-0",
}: {
  rows: BulkEditRow[];
  unitSuffix?: (row: BulkEditRow) => string;
  onSave: (changes: { id: string; value: number }[]) => Promise<{ id: string; ok: boolean; error?: string }[]>;
  savingLabel?: string;
  emptyMessage?: string;
  extraColumn?: (row: BulkEditRow) => React.ReactNode;
  /**
   * Tailwind `top-*` class controlling where the save bar sticks.
   * Defaults to "top-0", which is correct only when nothing else on
   * the page is ALSO sticky/fixed to the viewport top — two
   * `top-0` sticky siblings overlap rather than stack. Pages that
   * already have a sticky/fixed header (the mobile admin top bar,
   * the supplier account header) must pass a class that offsets
   * below that header's height, e.g. "top-[57px]".
   */
  stickyTopClassName?: string;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function draftFor(row: BulkEditRow): string {
    if (row.id in drafts) return drafts[row.id];
    return row.currentValue != null ? String(row.currentValue) : "";
  }

  function setDraft(id: string, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: value }));
    setMessage(null);
  }

  const changedRows = useMemo(() => {
    return rows.filter((row) => {
      const draft = draftFor(row);
      if (draft === "") return false; // never treat a blank field as "clear this value"
      const draftNum = Number(draft);
      if (!Number.isFinite(draftNum)) return false;
      return draftNum !== (row.currentValue ?? null);
    });
  }, [rows, drafts]);

  const invalidRows = useMemo(() => {
    return rows.filter((row) => {
      const draft = draftFor(row);
      if (draft === "") return false;
      const n = Number(draft);
      return !Number.isFinite(n) || n < 0;
    });
  }, [rows, drafts]);

  async function handleSave() {
    if (changedRows.length === 0 || invalidRows.length > 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const changes = changedRows.map((row) => ({ id: row.id, value: Number(draftFor(row)) }));
      const results = await onSave(changes);
      const failures = results.filter((r) => !r.ok);
      if (failures.length > 0) {
        setMessage({
          tone: "error",
          text: `${failures.length} of ${results.length} change${results.length === 1 ? "" : "s"} could not be saved. Please try again.`,
        });
      } else {
        setMessage({ tone: "success", text: `Saved ${results.length} change${results.length === 1 ? "" : "s"}.` });
        // Clear drafts for the rows that succeeded — they'll now
        // read from the parent's updated currentValue instead.
        setDrafts((prev) => {
          const next = { ...prev };
          for (const r of results) if (r.ok) delete next[r.id];
          return next;
        });
      }
    } catch {
      setMessage({ tone: "error", text: "Could not save changes. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Sticky save bar — sticks to the top of THIS table as you scroll past it. */}
      <div className={`sticky ${stickyTopClassName} z-20 bg-white border border-line rounded-card px-4 py-3 flex items-center justify-between gap-3 mb-3 shadow-sm`}>
        <div className="text-xs text-inksoft flex-1 min-w-0">
          {message ? (
            <span className={message.tone === "success" ? "text-brand-dark font-semibold" : "text-danger font-semibold"}>
              {message.text}
            </span>
          ) : invalidRows.length > 0 ? (
            <span className="text-danger font-semibold">Fix invalid values before saving.</span>
          ) : changedRows.length === 0 ? (
            "No changes to save"
          ) : (
            `${changedRows.length} change${changedRows.length === 1 ? "" : "s"} ready to save`
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || changedRows.length === 0 || invalidRows.length > 0}
          className="h-10 px-5 rounded-[9px] bg-brand text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {saving ? savingLabel : "Save"}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-line rounded-card px-4 py-6 text-center text-sm text-inksoft">{emptyMessage}</div>
      ) : (
        <div className="bg-white border border-line rounded-card overflow-hidden overflow-x-auto">
          <table>
            <thead>
              <tr className="bg-brand-pale">
                <th className="text-left text-[11px] font-bold text-brand-dark px-3.5 py-2.5">Vegetable</th>
                <th className="text-right text-[11px] font-bold text-brand-dark px-3.5 py-2.5 whitespace-nowrap">Current</th>
                <th className="text-right text-[11px] font-bold text-brand-dark px-3.5 py-2.5 whitespace-nowrap">New</th>
                {extraColumn && <th className="text-right text-[11px] font-bold text-brand-dark px-3.5 py-2.5">&nbsp;</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = draftFor(row);
                const draftNum = draft === "" ? null : Number(draft);
                const hasChanged = draftNum != null && Number.isFinite(draftNum) && draftNum !== (row.currentValue ?? null);
                const isInvalid = draft !== "" && (!Number.isFinite(draftNum) || (draftNum as number) < 0);
                const isNeutral = row.currentValue == null && draft === "";

                // The Current column is what recolors — RED while
                // untouched (New still equals Current), GREEN once
                // the supplier has typed a different value. This is
                // the explicit business rule; it's a reversal from
                // coloring the New input itself.
                const currentColorClass = isNeutral
                  ? "text-inksoft"
                  : hasChanged
                  ? "text-brand-dark font-bold"
                  : "text-danger font-bold";

                return (
                  <tr key={row.id} className="border-b border-line last:border-b-0">
                    <td className="px-3.5 py-2.5">
                      <div className="font-semibold text-[13.5px]">{row.label}</div>
                      {row.sublabel && <div className="text-[11px] text-inksoft">{row.sublabel}</div>}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <span className={`font-mono-tabular text-[13.5px] ${currentColorClass}`}>{row.displayCurrentValue}</span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <input
                        type="number"
                        value={draft}
                        onChange={(e) => setDraft(row.id, e.target.value)}
                        placeholder={row.currentValue != null ? String(row.currentValue) : "Set value"}
                        className={`w-24 h-9 rounded-md border px-2 text-sm text-right font-mono-tabular font-semibold outline-none ${
                          isInvalid ? "border-danger text-danger bg-danger-pale" : "border-linestrong"
                        }`}
                      />
                      {unitSuffix && !isNeutral && <span className="text-[11px] text-inksoft ml-1">{unitSuffix(row)}</span>}
                    </td>
                    {extraColumn && <td className="px-3.5 py-2.5 text-right">{extraColumn(row)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}