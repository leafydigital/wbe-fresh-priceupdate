import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/database.types";

export type SessionProfile = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  status: "ACTIVE" | "DISABLED";
};

/**
 * Reads the current session and its profile row. Returns null if
 * there is no logged-in user or the profile is missing/disabled.
 * Use this in Server Components and Route Handlers — never trust a
 * role claimed by the client.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, username, role, status")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.status === "DISABLED") return null;
  return profile;
}

/**
 * Server Component guard: redirects to the unified login page if
 * the session is missing or doesn't match the required role. Call
 * this at the top of every protected page/layout.
 */
export async function requireRole(role: UserRole): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== role) {
    redirect("/login");
  }
  return profile;
}

/**
 * Route Handler guard: same check, but returns a 401/403 Response
 * instead of redirecting (redirects don't make sense for API routes).
 */
export async function requireRoleApi(
  role: UserRole
): Promise<{ profile: SessionProfile } | { error: Response }> {
  const profile = await getSessionProfile();
  if (!profile) {
    return { error: Response.json({ error: "Not signed in." }, { status: 401 }) };
  }
  if (profile.role !== role) {
    return { error: Response.json({ error: "Not authorized for this resource." }, { status: 403 }) };
  }
  return { profile };
}
