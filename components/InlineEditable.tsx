"use client";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * A value that becomes an editable textbox on click/tap, and saves
 * on Enter or on blur (clicking/tapping outside) — no Save button,
 * per requirements 1/6/9/16.
 *
 * - Skips calling onSave entirely if the value didn't actually
 *   change (requirement 26 — no audit noise for a no-op edit). That
 *   check happens here, once, so every caller gets it for free
 *   rather than re-implementing the comparison.
 * - Guards against a double-save: pressing Enter blurs the input,
 *   which would otherwise also fire the blur handler and send a
 *   second request. A `committing` ref suppresses the blur-triggered
 *   save when Enter already triggered one (requirement 25's "make
 *   sure tapping outside does not accidentally trigger multiple saves").
 * - Shows a small inline status ("Saving…" / "Saved") rather than a
 *   full-page loading state, per requirement 25.
 *
 * `onSave` should return a Promise; a thrown error (or a rejected
 * promise) reverts the field to its previous value and shows an
 * inline error state briefly.
 */
export default function InlineEditable({
  value,
  displayValue,
  onSave,
  type = "text",
  inputClassName = "",
  displayClassName = "",
  align = "left",
  ariaLabel,
}: {
  value: string;
  displayValue?: string;
  onSave: (newValue: string) => Promise<void>;
  type?: "text" | "number";
  inputClassName?: string;
  displayClassName?: string;
  align?: "left" | "right";
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<Status>("idle");
  const committing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    if (committing.current) return;
    committing.current = true;
    try {
      if (draft === value) {
        // No-op edit — just close, nothing to save.
        setEditing(false);
        return;
      }
      setStatus("saving");
      await onSave(draft);
      setStatus("saved");
      setEditing(false);
      setTimeout(() => setStatus("idle"), 1200);
    } catch {
      setStatus("error");
      setDraft(value); // revert
      setTimeout(() => setStatus("idle"), 1800);
    } finally {
      committing.current = false;
    }
  }

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          onBlur={commit}
          aria-label={ariaLabel}
          className={`h-8 rounded-md border border-brand px-2 text-sm outline-none ${
            align === "right" ? "text-right" : ""
          } ${inputClassName}`}
        />
        {status === "saving" && <span className="text-[10.5px] text-inksoft whitespace-nowrap">Saving&hellip;</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`inline-flex items-center gap-1.5 rounded-md px-1 -mx-1 hover:bg-brand-pale/60 ${
        align === "right" ? "justify-end" : ""
      }`}
      aria-label={ariaLabel ? `Edit ${ariaLabel}` : "Edit value"}
    >
      <span className={displayClassName}>{displayValue ?? value}</span>
      {status === "saved" && <span className="text-[10.5px] text-brand whitespace-nowrap">&#10003; Saved</span>}
      {status === "error" && <span className="text-[10.5px] text-danger whitespace-nowrap">Couldn&rsquo;t save</span>}
    </button>
  );
}
