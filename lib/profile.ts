import type { SupabaseClient } from "@supabase/supabase-js";

export type Profile = {
  niche: string | null;
  brand_name: string | null;
  goals: string | null;
  platforms: string[] | null;
  account_connected: boolean;
};

// Reads the signed-in user's profile row. Returns null if the profile hasn't
// been created yet or the `profiles` table doesn't exist. Callers treat a null
// (or account_connected: false) as "no account connected yet".
export async function getProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("niche, brand_name, goals, platforms, account_connected")
      .eq("user_id", userId)
      .maybeSingle();
    return (data as Profile) ?? null;
  } catch {
    return null;
  }
}
