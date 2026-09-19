import { createClient } from "@/lib/supabase/server";
import { requireRoleApi } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

type AuditLogRow = Pick<
  Database["wbe_fresh"]["Tables"]["audit_logs"]["Row"],
  | "id"
  | "entity_type"
  | "entity_id"
  | "action"
  | "field_name"
  | "old_value"
  | "new_value"
  | "changed_by"
  | "changed_by_role"
  | "changed_at"
>;

type ProfileRow = Pick<
  Database["wbe_fresh"]["Tables"]["profiles"]["Row"],
  "id" | "name"
>;
/**
 * Admin-only audit log reader. Query params:
 *   entityType — one of price | order_quantity | margin | vegetable | supplier
 *   entityId   — restrict to one row (e.g. one vegetable's id)
 *   limit      — defaults to 50, capped at 200
 *
 * Joins profiles to resolve changed_by into a display name, since
 * audit_logs itself only stores the uuid (changed_by references
 * auth.users, not profiles, so it survives profile deletion — but
 * that means we need a left join here, not an inner one, in case
 * the profile is gone).
 */
export async function GET(req: NextRequest) {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const supabase = createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, entity_type, entity_id, action, field_name, old_value, new_value, changed_by, changed_by_role, changed_at")
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);

  // const { data: rows, error } = await query;
  // if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // const actorIds = [...new Set(rows.map((r) => r.changed_by))];
  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  const auditRows = (rows ?? []) as AuditLogRow[];

  const actorIds = [...new Set(auditRows.map((r) => r.changed_by))];
  // const { data: profiles } = await supabase.from("profiles").select("id, name").in("id", actorIds);
  // const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", actorIds);

  const profileRows = (profiles ?? []) as ProfileRow[];

  const nameById = new Map(
    profileRows.map((p) => [p.id, p.name])
  );

  // const entries = rows.map((r) => ({
  //   ...r,
  //   changed_by_name: nameById.get(r.changed_by) ?? "Deleted user",
  // }));

  const entries = auditRows.map((r) => ({
    ...r,
    changed_by_name: nameById.get(r.changed_by) ?? "Deleted user",
  }));
  return NextResponse.json({ entries });
}
