/**
 * Seeds a first admin login and a starter set of vegetables.
 * Run with: npm run seed
 *
 * Requires .env to have NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY set (the service role key is required
 * here because creating the admin's auth user needs the admin API —
 * this script is meant to be run once, locally, by a developer).
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "wbe_fresh" }, // see lib/supabase/client.ts for why
});

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@wbefresh.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

const STARTER_VEGETABLES: { name: string; unit: "KG" | "Piece" | "Box" | "Bundle" }[] = [
  { name: "Tomato", unit: "KG" },
  { name: "Onion", unit: "KG" },
  { name: "Potato", unit: "KG" },
  { name: "Carrot", unit: "KG" },
  { name: "Cabbage", unit: "KG" },
  { name: "Cauliflower", unit: "Piece" },
  { name: "Cucumber", unit: "KG" },
  { name: "Beans", unit: "Bundle" },
];

async function main() {
  console.log(`Creating admin login: ${ADMIN_EMAIL}`);
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.toLowerCase().includes("already registered")) {
      console.log("Admin user already exists — skipping auth creation.");
    } else {
      throw authError;
    }
  } else if (authUser.user) {
    const { error: profileError } = await admin.from("profiles").insert({
      id: authUser.user.id,
      name: "Admin",
      username: "admin",
      role: "ADMIN",
    });
    if (profileError) throw profileError;
    console.log(`Admin created. Log in at /login with ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    console.log("Change this password after first login.");
  }

  console.log("Seeding starter vegetables…");
  for (const v of STARTER_VEGETABLES) {
    const { error } = await admin.from("vegetables").upsert(v, { onConflict: "name" });
    if (error) console.warn(`Could not seed ${v.name}:`, error.message);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
