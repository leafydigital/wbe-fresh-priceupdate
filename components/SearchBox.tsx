"use client";

export default function SearchBox({
  value,
  onChange,
  placeholder = "Search vegetables...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative mb-3.5">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-inksoft text-sm" aria-hidden="true">
        &#128269;
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 rounded-[9px] border border-linestrong pl-9 pr-3 text-sm outline-none focus:border-brand"
      />
    </div>
  );
}
