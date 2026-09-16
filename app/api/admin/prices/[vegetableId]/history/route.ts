import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/priceCycle";
import { NextResponse } from "next/server";

/**
 * Every change made to one vegetable's price from YESTERDAY'S 3 PM
 * (IST) through now — i.e. the previous full cycle plus everything
 * in the current cycle so far — with attribution (who changed it,
 * and their role).
 *
 * This is the internal admin/supplier "who changed what and when"
 * view. It intentionally spans TWO cycles' worth of window (not
 * just the current one) so that right after a new cycle starts,
 * this view doesn't go blank the moment the clock passes 3 PM —
 * yesterday's saves stay visible alongside today's until a full 24
 * hours have passed. Every individual save within that window shows
 * up, not deduplicated to one row per cycle (unlike the public
 * page's cycle-over-cycle comparison, which only cares about each
 * cycle's FINAL value). If a supplier corrected their own entry
 * three times in one afternoon, all three appear here with their own
 * timestamps.
 *
 * Admin callers get updated_price + final_price + attribution for
 * every change to this vegetable, by anyone. Supplier callers get
 * updated_price + attribution for their OWN changes only — never
 * another supplier's or admin's changes, and never final_price or
 * margin. This route is not used by the public buyer page, which has
 * its own route (app/api/public/prices) returning only date/time/price.
 */
export async function GET(_req: Request, { params }: { params: { vegetableId: string } }) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = createClient();
  const currentCycle = getCurrentCycle(new Date());
  // Consecutive cycle starts are always exactly 24 hours apart (each
  // is "some day's 3 PM IST"), so yesterday's cycle start is simply
  // 24 hours before the current one — no separate cycle computation
  // needed for "yesterday."
  const windowStart = new Date(currentCycle.cycleStart.getTime() - 24 * 60 * 60 * 1000).toISOString();

  if (profile.role === "ADMIN") {
    const { data, error } = await supabase
      .from("price_history")
      .select("updated_price, final_price, cycle_start, recorded_at, updated_by, updated_by_role")
      .eq("vegetable_id", params.vegetableId)
      .gte("recorded_at", windowStart)
      .order("recorded_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const actorIds = [...new Set((data ?? []).map((r) => r.updated_by).filter(Boolean))] as string[];
    const { data: profiles } = actorIds.length
      ? await supabase.from("profiles").select("id, name").in("id", actorIds)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

    const history = (data ?? []).map((r) => ({
      ...r,
      changed_by_name: r.updated_by ? nameById.get(r.updated_by) ?? "Deleted user" : "Admin",
    }));

    return NextResponse.json({ history, windowStart });
  }

  // SUPPLIER: own price changes only, no final_price/margin, via the
  // view that structurally omits those columns.
  const { data, error } = await supabase
    .from("supplier_price_history_view")
    .select("updated_price, cycle_start, recorded_at, updated_by, updated_by_role")
    .eq("vegetable_id", params.vegetableId)
    .eq("updated_by", profile.id)
    .gte("recorded_at", windowStart)
    .order("recorded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const history = (data ?? []).map((r) => ({ ...r, changed_by_name: profile.name }));
  return NextResponse.json({ history, windowStart });
}