import { createClient } from "@/lib/supabase/server";
import type { AuditEntityType, AuditAction, UserRole } from "@/lib/supabase/database.types";

type WriteAuditInput = {
  entityType: AuditEntityType;
  entityId?: string | null;
  action: AuditAction;
  fieldName?: string | null;
  oldValue?: string | number | null;
  newValue?: string | number | null;
  actorId: string;
  actorRole: UserRole;
};

/**
 * Writes one row to audit_logs.
 *
 * actorId/actorRole MUST come from an already-verified session
 * (requireRoleApi's returned `profile`), never from request body
 * data — the audit_logs_insert_own RLS policy also enforces
 * `changed_by = auth.uid()` at the database level, so even a route
 * that mistakenly passed a spoofed actorId would have the insert
 * rejected by Postgres. This function is the one place the app
 * writes to audit_logs; every mutating route calls it after a
 * successful write to the entity's own table.
 *
 * Old/new values are stringified for storage (audit_logs.old_value /
 * new_value are text columns, since audited entities span numbers,
 * enums, and free text). Pass the raw values in — this function
 * does the conversion.
 *
 * Callers should skip calling this entirely when old === new (see
 * requirement 26 — no audit noise for a no-op edit). This function
 * does not itself compare old/new, so that check must happen at the
 * call site before deciding whether to call it.
 */
export async function writeAudit(input: WriteAuditInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("audit_logs").insert({
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    action: input.action,
    field_name: input.fieldName ?? null,
    old_value: input.oldValue == null ? null : String(input.oldValue),
    new_value: input.newValue == null ? null : String(input.newValue),
    changed_by: input.actorId,
    changed_by_role: input.actorRole,
  });

  if (error) {
    // Deliberately non-fatal: the underlying data write already
    // succeeded by the time this is called. Losing one audit row to
    // a transient error shouldn't roll back or fail the user's save.
    // Logged server-side for operator visibility.
    console.error("writeAudit failed:", error.message, input);
  }
}
