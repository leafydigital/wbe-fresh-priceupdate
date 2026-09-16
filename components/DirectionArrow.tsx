/**
 * Shared up/down price-direction indicator. Used both in the main
 * price column (components/PublicPriceList.tsx) and inside the
 * previous-price comparison in the history sheet
 * (components/PriceHistoryButton.tsx) — extracted here so both
 * places render an identical glyph, size, and color rather than two
 * copies that could drift apart.
 *
 * Explicit business rule, NOT the conventional green-up/red-down:
 *   current price HIGHER than the previous cycle's -> up arrow, RED
 *   current price LOWER than the previous cycle's -> down arrow, GREEN
 *   unchanged -> no arrow (never a misleading indicator)
 *
 * Uses numeric HTML character references (&#9650; / &#9660; — solid
 * triangles, not the thin &#8593;/&#8595; arrow glyphs) because a
 * filled triangle stays legible at small sizes on a phone screen in
 * a way a thin arrow stroke doesn't; named entities like
 * &uarr;/&darr; are avoided entirely — those silently failed to
 * render in JSX text content.
 *
 * Sized deliberately larger than the surrounding text at every tier,
 * not just matching it, so the direction reads as a clear visual
 * signal rather than a small typographic detail — and sized with
 * responsive Tailwind breakpoints so it stays proportionate on both
 * a small phone and a wide desktop layout.
 */
export default function DirectionArrow({
  direction,
  size = "base",
}: {
  direction: "up" | "down" | "same";
  /** "base" for inline use next to the price column; "lg" for the history sheet's bigger comparison row. */
  size?: "base" | "lg";
}) {
  const sizeClass = size === "lg" ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl";

  if (direction === "up")
    return (
      <span
        className={`text-danger ${sizeClass} font-black mr-1.5 leading-none align-middle inline-block`}
        aria-label="Price increased since last update"
      >
        &#9650;
      </span>
    );
  if (direction === "down")
    return (
      <span
        className={`text-brand ${sizeClass} font-black mr-1.5 leading-none align-middle inline-block`}
        aria-label="Price decreased since last update"
      >
        &#9660;
      </span>
    );
  return null;
}