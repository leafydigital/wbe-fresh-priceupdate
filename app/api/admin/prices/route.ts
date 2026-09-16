import { createClient } from "@/lib/supabase/server";
import { requireRoleApi } from "@/lib/auth";
import { getCommonMargin, finalPrice } from "@/lib/pricing";
import { getCurrentCycle } from "@/lib/priceCycle";
import { writeAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bulkUpsertSchema = z.object({
  updates: z
    .array(
      z.object({
        vegetableId: z.string().uuid(),
        updatedPrice: z.number().nonnegative(),
      })
    )
    .min(1),
});

/**
 * Today's price sheet: every active vegetable, joined with its
 * CURRENT CYCLE's price row — never "today's calendar-date row."
 *
 * For each vegetable this reads the most recent daily_prices row
 * (order by cycle_start desc, limit 1), regardless of which cycle it
 * belongs to. That row is what's shown as the "current" price
 * whether or not today's 3 PM update has happened yet — this is the
 * never-show-zero requirement. Whether today's cycle update is
 * still PENDING is a separate boolean (isUpdatePending) the frontend
 * uses only for the red/green validity styling; it never causes the
 * price itself to be hidden or zeroed.
 */
export async function GET() {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const supabase = createClient();
  const now = new Date();
  const currentCycle = getCurrentCycle(now);

  const { data: vegetables, error: vegError } = await supabase
    .from("vegetables")
    .select("id, name, unit, status")
    .eq("status", "ACTIVE")
    .order("name");
  if (vegError) return NextResponse.json({ error: vegError.message }, { status: 500 });

  // One most-recent row per vegetable. Supabase/PostgREST has no
  // native "latest per group" in a single call, so this fetches
  // every vegetable's full recent rows ordered by cycle_start desc
  // and reduces to the first-seen (= latest) row per vegetable_id in
  // JS. The row count here is bounded (one per vegetable per cycle
  // they've ever had a price for) and this route is admin-only /
  // low-traffic, so this is a reasonable trade against a more
  // complex DISTINCT ON query.
  const { data: allPrices, error: priceError } = await supabase
    .from("daily_prices")
    .select("vegetable_id, updated_price, final_price, cycle_start, updated_at")
    .order("cycle_start", { ascending: false });
  if (priceError) return NextResponse.json({ error: priceError.message }, { status: 500 });

  const latestByVeg = new Map<string, (typeof allPrices)[number]>();
  for (const row of allPrices) {
    if (!latestByVeg.has(row.vegetable_id)) latestByVeg.set(row.vegetable_id, row);
  }

  const margin = await getCommonMargin(supabase);

  const sheet = vegetables.map((v) => {
    const latest = latestByVeg.get(v.id) ?? null;
    const isUpdatePending = !latest || new Date(latest.cycle_start).getTime() < currentCycle.cycleStart.getTime();
    return { vegetable: v, price: latest, isUpdatePending };
  });

  return NextResponse.json({
    cycleStart: currentCycle.cycleStart.toISOString(),
    validUntil: currentCycle.validUntil.toISOString(),
    margin,
    sheet,
  });
}

/**
 * Bulk save: admin edits any number of prices, reviews them, clicks
 * ONE Save button — the frontend sends every vegetable whose New
 * Price input differs from its Current Price in a single request.
 * Unchanged rows are never sent at all (the frontend filters before
 * calling this), but as a second line of defense this route also
 * re-checks old !== new per row before writing/auditing, so even a
 * buggy or tampered client can't force no-op audit noise.
 *
 * Each vegetable writes a NEW daily_prices row for the CURRENT
 * cycle (not an update-in-place of yesterday's row) — this is what
 * makes "current price" and "price history" the same underlying
 * data: every price-cycle change is its own row, cycle_start-keyed,
 * and the trigger mirrors it into price_history automatically.
 *
 * Partial-failure handling: this loops per-vegetable rather than a
 * single multi-row upsert, because each row needs its own
 * old-price lookup and audit entry. If one vegetable's write fails,
 * the response reports exactly which ones succeeded and which
 * failed — it never claims a blanket success when some writes
 * didn't happen (see requirement: "do not silently show success").
 */
export async function POST(req: NextRequest) {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = bulkUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = createClient();
  const now = new Date();
  const currentCycle = getCurrentCycle(now);
  const margin = await getCommonMargin(supabase);

  const results: { vegetableId: string; ok: boolean; error?: string }[] = [];

  for (const update of parsed.data.updates) {
    const { data: existing } = await supabase
      .from("daily_prices")
      .select("updated_price")
      .eq("vegetable_id", update.vegetableId)
      .order("cycle_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    const oldPrice = existing ? Number(existing.updated_price) : null;
    if (oldPrice === update.updatedPrice) {
      results.push({ vegetableId: update.vegetableId, ok: true }); // no-op, nothing to write
      continue;
    }

    const computedFinal = finalPrice(update.updatedPrice, margin);
    const { error } = await supabase.from("daily_prices").upsert(
      {
        vegetable_id: update.vegetableId,
        updated_price: update.updatedPrice,
        final_price: computedFinal,
        cycle_start: currentCycle.cycleStart.toISOString(),
        updated_by: guard.profile.id,
      },
      { onConflict: "vegetable_id,cycle_start" }
    );

    if (error) {
      results.push({ vegetableId: update.vegetableId, ok: false, error: error.message });
      continue;
    }

    await writeAudit({
      entityType: "price",
      entityId: update.vegetableId,
      action: "update",
      fieldName: "updated_price",
      oldValue: oldPrice,
      newValue: update.updatedPrice,
      actorId: guard.profile.id,
      actorRole: guard.profile.role,
    });
    results.push({ vegetableId: update.vegetableId, ok: true });
  }

  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    // Partial or total failure — never report a blanket success.
    return NextResponse.json({ results, error: `${failures.length} of ${results.length} updates failed.` }, { status: 207 });
  }

  return NextResponse.json({ results });
}
