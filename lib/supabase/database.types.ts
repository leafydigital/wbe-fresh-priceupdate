// Hand-written to match supabase/migrations/0001_init.sql,
// 0002_audit_and_common_margin.sql, and 0003_price_cycles.sql.
//
// IMPORTANT: the top-level key of this Database interface MUST match
// whatever `db.schema` value the Supabase client is constructed
// with. Every client in this app (lib/supabase/client.ts, server.ts,
// admin.ts) passes `db: { schema: "wbe_fresh" }` — NOT the default
// "public" — because this project's tables live in a dedicated
// schema (see the note at the bottom of
// supabase/migrations/0001_init.sql for why). This file previously
// had `public` as the top-level key while the clients configured
// `wbe_fresh` at runtime; that mismatch meant supabase-js's generic
// type resolution could never actually find any table (it was
// looking up Database["wbe_fresh"]["Tables"][...], which didn't
// exist), silently falling back to `SelectQueryError<...>` unions
// with every field typed `any` on every .select() call, project-wide.
// The top-level key below must stay "wbe_fresh" for that reason —
// don't "fix" it back to "public" to match Supabase's usual
// convention; that convention assumes the default schema.
//
// If you have the Supabase CLI, regenerate with:
//   supabase gen types typescript --local --schema wbe_fresh > lib/supabase/database.types.ts
// and then rename the CLI's "wbe_fresh" key here if it names it
// something else (older/newer CLI versions have varied on this).

export type UserRole = "ADMIN" | "SUPPLIER";
export type Status = "ACTIVE" | "DISABLED";
export type Unit = "KG" | "Piece" | "Box" | "Bundle";
export type AuditEntityType = "price" | "order_quantity" | "margin" | "vegetable" | "supplier";
export type AuditAction = "create" | "update" | "delete";

export interface Database {
  wbe_fresh: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          username: string;
          role: UserRole;
          status: Status;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["wbe_fresh"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          name: string;
          username: string;
          role: UserRole;
        };
        Update: Partial<Database["wbe_fresh"]["Tables"]["profiles"]["Row"]>;
      };
      suppliers: {
        Row: {
          id: string;
          profile_id: string;
          business_name: string;
          contact_person: string | null;
          phone: string | null; // db-enforced ^[0-9]{10}$ or null, see migration 0002
          status: Status;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["wbe_fresh"]["Tables"]["suppliers"]["Row"]> & {
          profile_id: string;
          business_name: string;
        };
        Update: Partial<Database["wbe_fresh"]["Tables"]["suppliers"]["Row"]>;
      };
      vegetables: {
        Row: {
          id: string;
          name: string;
          unit: Unit;
          status: Status; // DISABLED doubles as "removed/archived" — see requirement 10
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["wbe_fresh"]["Tables"]["vegetables"]["Row"]> & {
          name: string;
          unit: Unit;
        };
        Update: Partial<Database["wbe_fresh"]["Tables"]["vegetables"]["Row"]>;
      };
      daily_prices: {
        Row: {
          id: string;
          vegetable_id: string;
          updated_price: number;
          // margin removed in migration 0002 — margin is global now,
          // stored in app_settings, not per price row.
          final_price: number; // application-computed, not DB-generated — see migration 0002 comment
          price_date: string; // inert since migration 0003 — kept for backward compat, no longer load-bearing
          cycle_start: string; // the 3 PM IST instant this row's price cycle began — see migration 0003 / lib/priceCycle.ts
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          vegetable_id: string;
          updated_price?: number;
          final_price?: number;
          price_date?: string;
          cycle_start: string;
          updated_by?: string | null;
        };
        Update: Partial<Database["wbe_fresh"]["Tables"]["daily_prices"]["Insert"]>;
      };
      daily_order_quantities: {
        Row: {
          id: string;
          vegetable_id: string;
          quantity: number;
          unit: string;
          order_date: string; // inert since migration 0003 — kept for backward compat
          cutoff_at: string; // the 1 PM IST instant this order-collection window closes — see migration 0003
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          vegetable_id: string;
          quantity: number;
          unit: string;
          order_date?: string;
          cutoff_at: string;
          updated_by?: string | null;
        };
        Update: Partial<Database["wbe_fresh"]["Tables"]["daily_order_quantities"]["Insert"]>;
      };
      price_history: {
        Row: {
          id: string;
          vegetable_id: string;
          updated_price: number;
          // margin removed in migration 0002
          final_price: number;
          price_date: string; // inert since migration 0003
          cycle_start: string; // see migration 0003
          recorded_at: string;
          updated_by: string | null;
          updated_by_role: UserRole | null;
        };
        // This table is genuinely insert-only via the
        // daily_prices_history trigger — enforced by Postgres RLS
        // (no INSERT/UPDATE policy for the app's roles), not by this
        // type. A real shape is used here anyway (rather than
        // `never`) purely to stay consistent/safe with supabase-js's
        // generic resolution; the app never actually calls
        // .insert()/.update() on this table.
        Insert: {
          vegetable_id: string;
          updated_price: number;
          final_price: number;
          price_date?: string;
          cycle_start: string;
          updated_by?: string | null;
          updated_by_role?: UserRole | null;
        };
        Update: Partial<Database["wbe_fresh"]["Tables"]["price_history"]["Insert"]>;
      };
      app_settings: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: { key: string; value: string; updated_by?: string | null };
        Update: Partial<Database["wbe_fresh"]["Tables"]["app_settings"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          entity_type: AuditEntityType;
          entity_id: string | null;
          action: AuditAction;
          field_name: string | null;
          old_value: string | null;
          new_value: string | null;
          changed_by: string;
          changed_by_role: UserRole;
          changed_at: string;
        };
        Insert: {
          entity_type: AuditEntityType;
          entity_id?: string | null;
          action: AuditAction;
          field_name?: string | null;
          old_value?: string | null;
          new_value?: string | null;
          changed_by: string;
          changed_by_role: UserRole;
        };
        // Real shape here too, same reasoning as price_history above
        // — this table is insert-only via Postgres RLS, not via this
        // TypeScript type.
        Update: Partial<Database["wbe_fresh"]["Tables"]["audit_logs"]["Insert"]>;
      };
    };
    Views: {
      // Supplier-safe read surfaces — omit margin (now global/hidden
      // in app_settings) and, historically, final_price breakdowns.
      supplier_prices_view: {
        Row: {
          vegetable_id: string;
          updated_price: number;
          price_date: string;
          cycle_start: string;
          updated_at: string;
        };
      };
      supplier_price_history_view: {
        Row: {
          vegetable_id: string;
          updated_price: number;
          price_date: string;
          cycle_start: string;
          recorded_at: string;
          updated_by: string | null;
          updated_by_role: UserRole | null;
        };
      };
    };
  };
}