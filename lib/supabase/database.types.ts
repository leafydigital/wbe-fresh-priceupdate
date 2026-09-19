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

// lib/supabase/database.types.ts

export type UserRole = "ADMIN" | "SUPPLIER";
export type Status = "ACTIVE" | "DISABLED";
export type Unit = "KG" | "Piece" | "Box" | "Bundle";
export type AuditEntityType =
  | "price"
  | "order_quantity"
  | "margin"
  | "vegetable"
  | "supplier";
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
        Insert: {
          id: string;
          name: string;
          username: string;
          role: UserRole;
          status?: Status;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          username?: string;
          role?: UserRole;
          status?: Status;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      suppliers: {
        Row: {
          id: string;
          profile_id: string;
          business_name: string;
          contact_person: string | null;
          phone: string | null;
          status: Status;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          business_name: string;
          contact_person?: string | null;
          phone?: string | null;
          status?: Status;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          business_name?: string;
          contact_person?: string | null;
          phone?: string | null;
          status?: Status;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      vegetables: {
        Row: {
          id: string;
          name: string;
          unit: Unit;
          status: Status;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          unit: Unit;
          status?: Status;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          unit?: Unit;
          status?: Status;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      daily_prices: {
        Row: {
          id: string;
          vegetable_id: string;
          updated_price: number;
          final_price: number;
          price_date: string;
          cycle_start: string;
          updated_at: string;
          updated_by: string | null;
        };

        Insert: {
          id?: string;
          vegetable_id: string;
          updated_price?: number;
          final_price?: number;
          price_date?: string;
          cycle_start: string;
          updated_at?: string;
          updated_by?: string | null;
        };

        Update: {
          id?: string;
          vegetable_id?: string;
          updated_price?: number;
          final_price?: number;
          price_date?: string;
          cycle_start?: string;
          updated_at?: string;
          updated_by?: string | null;
        };

        Relationships: [];
      };

      daily_order_quantities: {
        Row: {
          id: string;
          vegetable_id: string;
          quantity: number;
          unit: string;
          order_date: string;
          cutoff_at: string;
          updated_at: string;
          updated_by: string | null;
        };

        Insert: {
          id?: string;
          vegetable_id: string;
          quantity: number;
          unit: string;
          order_date?: string;
          cutoff_at: string;
          updated_at?: string;
          updated_by?: string | null;
        };

        Update: {
          id?: string;
          vegetable_id?: string;
          quantity?: number;
          unit?: string;
          order_date?: string;
          cutoff_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };

        Relationships: [];
      };

      price_history: {
        Row: {
          id: string;
          vegetable_id: string;
          updated_price: number;
          final_price: number;
          price_date: string;
          cycle_start: string;
          recorded_at: string;
          updated_by: string | null;
          updated_by_role: UserRole | null;
        };

        Insert: {
          id?: string;
          vegetable_id: string;
          updated_price: number;
          final_price: number;
          price_date?: string;
          cycle_start: string;
          recorded_at?: string;
          updated_by?: string | null;
          updated_by_role?: UserRole | null;
        };

        Update: {
          id?: string;
          vegetable_id?: string;
          updated_price?: number;
          final_price?: number;
          price_date?: string;
          cycle_start?: string;
          recorded_at?: string;
          updated_by?: string | null;
          updated_by_role?: UserRole | null;
        };

        Relationships: [];
      };

      app_settings: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
          updated_by: string | null;
        };

        Insert: {
          key: string;
          value: string;
          updated_at?: string;
          updated_by?: string | null;
        };

        Update: {
          key?: string;
          value?: string;
          updated_at?: string;
          updated_by?: string | null;
        };

        Relationships: [];
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
          id?: string;
          entity_type: AuditEntityType;
          entity_id?: string | null;
          action: AuditAction;
          field_name?: string | null;
          old_value?: string | null;
          new_value?: string | null;
          changed_by: string;
          changed_by_role: UserRole;
          changed_at?: string;
        };

        Update: {
          id?: string;
          entity_type?: AuditEntityType;
          entity_id?: string | null;
          action?: AuditAction;
          field_name?: string | null;
          old_value?: string | null;
          new_value?: string | null;
          changed_by?: string;
          changed_by_role?: UserRole;
          changed_at?: string;
        };

        Relationships: [];
      };
    };

    Views: {
      supplier_prices_view: {
        Row: {
          vegetable_id: string;
          updated_price: number;
          price_date: string;
          cycle_start: string;
          updated_at: string;
        };
        Relationships: [];
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
        Relationships: [];
      };
    };

    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      status: Status;
      unit: Unit;
      audit_entity_type: AuditEntityType;
      audit_action: AuditAction;
    };

    CompositeTypes: Record<string, never>;
  };
}