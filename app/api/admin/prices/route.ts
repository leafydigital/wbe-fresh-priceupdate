import { createClient } from "@/lib/supabase/server";
import { requireRoleApi } from "@/lib/auth";
import { finalPrice } from "@/lib/pricing";
import { getCommonMargin } from "@/lib/pricing.server";
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

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type VegetableRow = {
  id: string;
  name: string;
  unit: string;
  status: string;
};

type DailyPriceRow = {
  vegetable_id: string;
  updated_price: number;
  final_price: number;
  cycle_start: string;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Today's price sheet.
 *
 * Shows every active vegetable with its most recently saved price.
 *
 * The latest price is determined by cycle_start DESC.
 * If today's cycle has not been updated yet, the previous cycle's
 * price remains visible.
 *
 * isUpdatePending is used only for frontend validity styling.
 */
export async function GET() {
  const guard = await requireRoleApi("ADMIN");

  if ("error" in guard) {
    return guard.error;
  }

  const supabase = createClient();
  const now = new Date();
  const currentCycle = getCurrentCycle(now);

  /* ----------------------------- Vegetables ----------------------------- */

  const {
    data: vegetablesData,
    error: vegError,
  } = await supabase
    .from("vegetables")
    .select("id, name, unit, status")
    .eq("status", "ACTIVE")
    .order("name");

  if (vegError) {
    return NextResponse.json(
      {
        error: vegError.message,
      },
      {
        status: 500,
      }
    );
  }

  const vegetables = (vegetablesData ?? []) as VegetableRow[];

  /* ----------------------------- Prices -------------------------------- */

  const {
    data: allPricesData,
    error: priceError,
  } = await supabase
    .from("daily_prices")
    .select(
      "vegetable_id, updated_price, final_price, cycle_start, updated_at"
    )
    .order("cycle_start", {
      ascending: false,
    });

  if (priceError) {
    return NextResponse.json(
      {
        error: priceError.message,
      },
      {
        status: 500,
      }
    );
  }

  const allPrices = (allPricesData ?? []) as DailyPriceRow[];

  /* --------------------- Latest price per vegetable --------------------- */

  const latestByVeg = new Map<string, DailyPriceRow>();

  for (const row of allPrices) {
    if (!latestByVeg.has(row.vegetable_id)) {
      latestByVeg.set(row.vegetable_id, row);
    }
  }

  /* ----------------------------- Margin -------------------------------- */

  const margin = await getCommonMargin();

  /* ----------------------------- Sheet --------------------------------- */

  const sheet = vegetables.map((v) => {
    const latest = latestByVeg.get(v.id) ?? null;

    const isUpdatePending =
      !latest ||
      new Date(latest.cycle_start).getTime() <
        currentCycle.cycleStart.getTime();

    return {
      vegetable: v,
      price: latest,
      isUpdatePending,
    };
  });

  /* ----------------------------- Response ------------------------------- */

  return NextResponse.json({
    cycleStart: currentCycle.cycleStart.toISOString(),
    validUntil: currentCycle.validUntil.toISOString(),
    margin,
    sheet,
  });
}

/* -------------------------------------------------------------------------- */
/* POST                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Bulk save prices.
 *
 * Only changed prices should be sent by the frontend.
 *
 * Each changed vegetable creates/updates the price row for the
 * current price cycle.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRoleApi("ADMIN");

  if ("error" in guard) {
    return guard.error;
  }

  /* ----------------------------- Request -------------------------------- */

  const body = await req.json().catch(() => null);

  const parsed = bulkUpsertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0].message,
      },
      {
        status: 400,
      }
    );
  }

  /* ----------------------------- Setup ---------------------------------- */

  const supabase = createClient();
  const now = new Date();
  const currentCycle = getCurrentCycle(now);
  const margin = await getCommonMargin();

  const results: {
    vegetableId: string;
    ok: boolean;
    error?: string;
  }[] = [];

  /* ----------------------------- Process -------------------------------- */

  for (const update of parsed.data.updates) {
    /* ---------------------- Get existing price ------------------------- */

    const {
      data: existingData,
      error: existingError,
    } = await supabase
      .from("daily_prices")
      .select("updated_price")
      .eq("vegetable_id", update.vegetableId)
      .order("cycle_start", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      results.push({
        vegetableId: update.vegetableId,
        ok: falsed
        error: existingError.message,
      });

      continue;
    }

    /*
     * Explicit type because the current Supabase client is inferring
     * the query result as `never`.
     */
    const existing = existingData as
      | {
          updated_price: number;
        }
      | null;

    const oldPrice =
      existing !== null
        ? Number(existing.updated_price)
        : null;

    /* ----------------------------- No-op -------------------------------- */

    if (oldPrice === update.updatedPrice) {
      results.push({
        vegetableId: update.vegetableId,
        ok: true,
      });

      continue;
    }

    /* --------------------------- Final price ---------------------------- */

    const computedFinal = finalPrice(
      update.updatedPrice,
      margin
    );

    /* ----------------------------- Upsert -------------------------------- */

    const pricePayload = {
      vegetable_id: update.vegetableId,
      updated_price: update.updatedPrice,
      final_price: computedFinal,
      cycle_start: currentCycle.cycleStart.toISOString(),
      updated_by: guard.profile.id,
    };

    /*
     * Cast only the payload to avoid the current Supabase `never[]`
     * inference problem.
     */
    const { error: upsertError } = await supabase
      .from("daily_prices")
      .upsert(
        {
          vegetable_id: update.vegetableId,
          updated_price: update.updatedPrice,
          final_price: computedFinal,
          cycle_start: currentCycle.cycleStart.toISOString(),
          updated_by: guard.profile.id,
        },
        {
          onConflict: "vegetable_id,cycle_start",
        }
      );

    /* --------------------------- Write failure -------------------------- */

    if (upsertError) {
      results.push({
        vegetableId: update.vegetableId,
        ok: false,
        error: upsertError.message,
      });

      continue;
    }

    /* ----------------------------- Audit -------------------------------- */

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

    /* ----------------------------- Success ------------------------------ */

    results.push({
      vegetableId: update.vegetableId,
      ok: true,
    });
  }

  /* -------------------------- Failure handling -------------------------- */

  const failures = results.filter((r) => !r.ok);

  if (failures.length > 0) {
    return NextResponse.json(
      {
        results,
        error: `${failures.length} of ${results.length} updates failed.`,
      },
      {
        status: 207,
      }
    );
  }

  /* ----------------------------- Success -------------------------------- */

  return NextResponse.json({
    results,
  });
}