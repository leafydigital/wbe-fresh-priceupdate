import { createClient } from "@/lib/supabase/server";

export async function getCommonMargin(): Promise<number> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "common_margin")
    .single();

  if (error || !data) {
    return 0;
  }

  const parsed = Number(data.value);

  return Number.isFinite(parsed) ? parsed : 0;
}