import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleApi } from "@/lib/auth";
import { getCommonMargin, finalPrice } from "@/lib/pricing";
import { getCurrentCycle } from "@/lib/priceCycle";
import { writeAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bulkUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        vegetableId: z.string().uuid(),
        updatedPrice: z.number().positive(),
      })
    )
    .min(1),
});

/**
 * Bulk save for the supplier price table — same shape as the admin
 * bulk route, but margin is read via the admin/service client
 * (suppliers have no SELECT on app_settings) and the request schema
 * has no margin field at all, so nothing a supplier sends can set or
 * read margin back. See app/api/admin/prices/route.ts for the shared
 * reasoning on why each vegetable is a separate write+audit rather
 * than one multi-row upsert, and on partial-failure reporting.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRoleApi("SUPPLIER");
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = bulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const currentCycle = getCurrentCycle(now);
  const margin = await getCommonMargin(admin);

  const results: { vegetableId: string; ok: boolean; error?: string }[] = [];

  for (const update of parsed.data.updates) {
    const { data: existing } = await admin
      .from("daily_prices")
      .select("updated_price")
      .eq("vegetable_id", update.vegetableId)
      .order("cycle_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    const oldPrice = existing ? Number(existing.updated_price) : null;
    if (oldPrice === update.updatedPrice) {
      results.push({ vegetableId: update.vegetableId, ok: true });
      continue;
    }

    const computedFinal = finalPrice(update.updatedPrice, margin);
    const { error } = await admin.from("daily_prices").upsert(
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

    // writeAudit uses the request-scoped session client internally
    // (not the admin client above), so changed_by is always the
    // supplier's own auth.uid() — never spoofable, even though the
    // price write itself needed elevated access to read margin.
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
    return NextResponse.json({ results, error: `${failures.length} of ${results.length} updates failed.` }, { status: 207 });
  }

  return NextResponse.json({ results });
}
