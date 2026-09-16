import { createClient } from "@/lib/supabase/server";
import { requireRoleApi } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  unit: z.enum(["KG", "Piece", "Box", "Bundle"]),
});

export async function GET() {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("vegetables")
    .select("id, name, unit, status, created_at")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vegetables: data });
}

export async function POST(req: NextRequest) {
  const guard = await requireRoleApi("ADMIN");
  if ("error" in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("vegetables")
    .insert({ name: parsed.data.name, unit: parsed.data.unit })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = error.code === "23505" ? "A vegetable with this name already exists." : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  await writeAudit({
    entityType: "vegetable",
    entityId: data.id,
    action: "create",
    fieldName: null,
    oldValue: null,
    newValue: `${data.name} (${data.unit})`,
    actorId: guard.profile.id,
    actorRole: guard.profile.role,
  });

  return NextResponse.json({ vegetable: data }, { status: 201 });
}
