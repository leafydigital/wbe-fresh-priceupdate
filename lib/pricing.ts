/**
 * Price formula and formatting helpers. All price-CYCLE logic
 * (what's the current cycle, is a save pending, the 1 PM/3 PM
 * boundaries) lives in lib/priceCycle.ts, not here — this file is
 * intentionally left with only the arithmetic/formatting that has
 * nothing to do with WBE Fresh's business calendar.
 *
 * This module is imported from both Server and Client Components
 * (formatRupees/finalPrice/etc. are pure and used in the browser),
 * so it must never import next/headers or any other server-only
 * module at the top level — getCommonMargin() below accepts a
 * duck-typed client parameter instead of importing the real
 * Supabase client type, specifically to keep this file safe to
 * bundle for the client.
 */

export function finalPrice(updatedPrice: number, margin: number): number {
  return round2(updatedPrice + margin);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatRupees(n: number): string {
  return "\u20B9" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * Reads the current common margin from app_settings using the
 * caller-supplied Supabase client. This function itself has no
 * next/headers dependency (see module note above) — it's the
 * caller's responsibility to only actually invoke it from server
 * code, since a real Supabase client capable of querying
 * app_settings only exists server-side in this app.
 *
 * Callers needing this from a supplier-facing route must pass an
 * admin/service client (suppliers have no SELECT policy on
 * app_settings — see migration 0002), exactly like the existing
 * margin-secrecy pattern in app/api/supplier/prices/route.ts.
 * Callers in admin-facing routes can pass the regular request-scoped
 * client, since admins do have SELECT there.
 */
// type MinimalSupabaseClient = {
//   from: (table: string) => {
//     select: (columns: string) => {
//       eq: (column: string, value: string) => {
//         single: () => Promise<{ data: { value: string } | null; error: unknown }>;
//       };
//     };
//   };
// };

// export async function getCommonMargin(supabase: MinimalSupabaseClient): Promise<number> {
//   const { data, error } = await supabase
//     .from("app_settings")
//     .select("value")
//     .eq("key", "common_margin")
//     .single();

//   if (error || !data) return 0;
//   const parsed = Number(data.value);
//   return Number.isFinite(parsed) ? parsed : 0;
// }
