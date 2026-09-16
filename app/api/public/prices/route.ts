import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCycle, isCycleUpdatePending } from "@/lib/priceCycle";
import { NextResponse } from "next/server";

/**
 * Public, unauthenticated endpoint backing the buyer price list.
 *
 * Security: the select() below is a hard allow-list — it never
 * selects updated_price, and there is no per-row margin to
 * accidentally select (margin lives in app_settings, which this
 * route never touches). Only final_price, cycle_start/recorded_at,
 * and vegetable name/unit ever leave this route — never who changed
 * anything.
 *
 * Never-zero: "current price" is always the most recently saved
 * daily_prices row for a vegetable, regardless of which cycle it
 * belongs to. If today's 3 PM update hasn't happened yet, the most
 * recent row is still yesterday's, and that is exactly what gets
 * returned as the current price. `isUpdatePending` tells the
 * frontend whether to show the red "update pending" validity styling
 * — it never causes a price to be hidden, zeroed, or omitted.
 *
 * History: exactly ONE entry per vegetable — the price cycle
 * immediately before whichever one is currently shown as "Price."
 *
 * Type note: this file declares its own explicit HistoryRow
 * interface for the price_history query result instead of relying
 * on `typeof` inference chained off the Supabase client's generated
 * types. That inference chain proved fragile (a schema/type-key
 * mismatch upstream previously cascaded into `never` types here,
 * through several layers of `typeof` re-use) — declaring the shape
 * explicitly, once, keeps this file's correctness independent of
 * whatever Supabase's client happens to infer.
 */

interface HistoryRow {
  vegetable_id: string;
  final_price: number;
  cycle_start: string;
  recorded_at: string;
}

export async function GET() {
  const supabase = createAdminClient();
  const currentCycle = getCurrentCycle(new Date());

  const { data: vegetables, error: vegError } = await supabase
    .from("vegetables")
    .select("id, name, unit")
    .eq("status", "ACTIVE")
    .order("name");
  if (vegError || !vegetables) {
    return NextResponse.json({ error: "Could not load vegetables." }, { status: 500 });
  }

  // Most recent price_history row per (vegetable, cycle) — price_history
  // is used here rather than daily_prices because it's the append-only
  // record of every cycle's final saved value, which is exactly what
  // "current price" and "cycle history" both need.
  const { data: rawHistory, error: historyError } = await supabase
    .from("price_history")
    .select("vegetable_id, final_price, cycle_start, recorded_at")
    .order("cycle_start", { ascending: false })
    .order("recorded_at", { ascending: false });
  if (historyError || !rawHistory) {
    return NextResponse.json({ error: "Could not load prices." }, { status: 500 });
  }

  // Normalize into the explicit HistoryRow shape up front — this is
  // the one place raw Supabase result data is converted, so
  // everything below works with a type this file controls, not one
  // inferred through the client.
  const allHistory: HistoryRow[] = rawHistory.map((r) => ({
    vegetable_id: r.vegetable_id,
    final_price: Number(r.final_price),
    cycle_start: r.cycle_start,
    recorded_at: r.recorded_at,
  }));

  // Reduce to one row per (vegetable, cycle_start) — the latest
  // recorded_at within that cycle, since a vegetable can be
  // re-saved multiple times within one cycle (e.g. admin corrects a
  // supplier's entry) and only the final value for that cycle
  // should represent it in history.
  const seenCycleKey = new Set<string>();
  const perCycle: HistoryRow[] = [];
  for (const row of allHistory) {
    const key = `${row.vegetable_id}:${row.cycle_start}`;
    if (seenCycleKey.has(key)) continue;
    seenCycleKey.add(key);
    perCycle.push(row);
  }

  const byVeg = new Map<string, HistoryRow[]>();
  for (const row of perCycle) {
    const existing = byVeg.get(row.vegetable_id);
    if (existing) {
      existing.push(row);
    } else {
      byVeg.set(row.vegetable_id, [row]);
    }
  }
  // Already ordered cycle_start desc from the query above; each
  // vegetable's array is its own cycles, most recent first.

  const items = vegetables.map((v) => {
    const cycles = byVeg.get(v.id) ?? [];
    const latest: HistoryRow | undefined = cycles[0];
    return {
      id: v.id,
      name: v.name,
      unit: v.unit,
      price: latest ? latest.final_price : null, // null ONLY if this vegetable has literally never had a price saved
      updatedAt: latest ? latest.recorded_at : null,
      cycleStart: latest ? latest.cycle_start : null,
      isUpdatePending: isCycleUpdatePending(latest ? new Date(latest.cycle_start) : null, new Date()),
    };
  });

  // Only ONE history entry per vegetable: the cycle immediately
  // before the one currently shown as "Price" (cycles[0]).
  //
  // Direction convention (explicit business rule — NOT the
  // conventional green-up/red-down):
  //   current price HIGHER than previous -> up arrow, RED
  //   current price LOWER than previous  -> down arrow, GREEN
  //   equal -> no arrow
  const historyByVeg: Record<string, { date: string; time: string; price: number; direction: "up" | "down" | "same" }[]> = {};
  for (const [vegId, cycles] of byVeg.entries()) {
    const current: HistoryRow | undefined = cycles[0];
    const previous: HistoryRow | undefined = cycles[1];

    if (current === undefined || previous === undefined) {
      historyByVeg[vegId] = [];
      continue;
    }

    const direction: "up" | "down" | "same" =
      current.final_price > previous.final_price ? "up" : current.final_price < previous.final_price ? "down" : "same";

    const recorded = new Date(previous.recorded_at);
    historyByVeg[vegId] = [
      {
        date: recorded.toISOString().slice(0, 10),
        time: recorded.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }),
        price: previous.final_price,
        direction,
      },
    ];
  }

  return NextResponse.json({
    cycleStart: currentCycle.cycleStart.toISOString(),
    validUntil: currentCycle.validUntil.toISOString(),
    items,
    history: historyByVeg,
    note: "Customized packing is available at an additional cost. Delivery and transportation charges are extra.",
  });
}