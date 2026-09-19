import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { getCurrentCycle } from "@/lib/priceCycle";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

type PriceHistoryRow = Pick<
  Database["wbe_fresh"]["Tables"]["price_history"]["Row"],
  | "updated_price"
  | "final_price"
  | "cycle_start"
  | "recorded_at"
  | "updated_by"
  | "updated_by_role"
>;

type ProfileRow = Pick<
  Database["wbe_fresh"]["Tables"]["profiles"]["Row"],
  "id" | "name"
>;

type SupplierPriceHistoryRow = Pick<
  Database["wbe_fresh"]["Views"]["supplier_price_history_view"]["Row"],
  "updated_price" | "cycle_start" | "recorded_at" | "updated_by" | "updated_by_role"
>;

/**
 * Every change made to one vegetable's price from YESTERDAY'S 3 PM
 * (IST) through now — i.e. the previous full cycle plus everything
 * in the current cycle so far — with attribution (who changed it,
 * and their role).
 *
 * Admin callers get updated_price + final_price + attribution for
 * every change to this vegetable, by anyone.
 *
 * Supplier callers get updated_price + attribution for their OWN
 * changes only — never another supplier's or admin's changes, and
 * never final_price or margin.
 */
export async function GET(
  _req: Request,
  { params }: { params: { vegetableId: string } }
) {
  const profile = await getSessionProfile();

  if (!profile) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401 }
    );
  }

  const supabase = createClient();
  const currentCycle = getCurrentCycle(new Date());

  // Yesterday's 3 PM IST through now.
  // Consecutive cycle starts are exactly 24 hours apart.
  const windowStart = new Date(
    currentCycle.cycleStart.getTime() - 24 * 60 * 60 * 1000
  ).toISOString();

  /*
   * ============================================================
   * ADMIN
   * ============================================================
   */
  if (profile.role === "ADMIN") {
    const { data, error } = await supabase
      .from("price_history")
      .select(
        "updated_price, final_price, cycle_start, recorded_at, updated_by, updated_by_role"
      )
      .eq("vegetable_id", params.vegetableId)
      .gte("recorded_at", windowStart)
      .order("recorded_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const historyRows = (data ?? []) as PriceHistoryRow[];

    const actorIds = [
      ...new Set(
        historyRows
          .map((row) => row.updated_by)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    let profileRows: ProfileRow[] = [];

    if (actorIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", actorIds);

      if (!profileError) {
        profileRows = (profiles ?? []) as ProfileRow[];
      }
    }

    const nameById = new Map(
      profileRows.map((profile) => [
        profile.id,
        profile.name,
      ])
    );

    const history = historyRows.map((row) => ({
      ...row,
      changed_by_name: row.updated_by
        ? nameById.get(row.updated_by) ?? "Deleted user"
        : "Admin",
    }));

    return NextResponse.json({
      history,
      windowStart,
    });
  }

  /*
   * ============================================================
   * SUPPLIER
   * ============================================================
   *
   * The supplier view intentionally does not expose final_price
   * or margin information.
   *
   * The query is also restricted to the currently signed-in
   * supplier's own changes.
   */
  const { data, error } = await supabase
    .from("supplier_price_history_view")
    .select(
      "updated_price, cycle_start, recorded_at, updated_by, updated_by_role"
    )
    .eq("vegetable_id", params.vegetableId)
    .eq("updated_by", profile.id)
    .gte("recorded_at", windowStart)
    .order("recorded_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  const historyRows = (data ?? []) as SupplierPriceHistoryRow[];

  const history = historyRows.map((row) => ({
    ...row,
    changed_by_name: profile.name,
  }));

  return NextResponse.json({
    history,
    windowStart,
  });
}