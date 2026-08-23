import type { SupabaseClient } from "@supabase/supabase-js";

// Brand & strategist settings, stored in profiles.brand_detail (jsonb).
// Every field here is injected into the AI prompts when present — these are
// working controls, not decoration.
export type BrandDetail = {
  website?: string;
  location?: string;
  description?: string;
  voice?: string; // Professional | Casual | Bold | Funny | Educational
  avoid?: string; // words/topics the AI must avoid
  strategist?: {
    aggressiveness?: "safe" | "balanced" | "experimental";
    formats?: string[]; // preferred content formats
    frequency?: string; // posting cadence target
    prioritize?: string; // topics to lean into
  };
};

export type Profile = {
  niche: string | null;
  brand_name: string | null;
  goals: string | null;
  platforms: string[] | null;
  account_connected: boolean;
  brand_detail?: BrandDetail | null;
};

// Reads the signed-in user's profile row. Returns null if the profile hasn't
// been created yet or the `profiles` table doesn't exist. Callers treat a null
// (or account_connected: false) as "no account connected yet".
export async function getProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  try {
    const full = await supabase
      .from("profiles")
      .select("niche, brand_name, goals, platforms, account_connected, brand_detail")
      .eq("user_id", userId)
      .maybeSingle();
    if (!full.error) return (full.data as Profile) ?? null;
    // brand_detail column may not exist yet — fall back to the legacy columns.
    const base = await supabase
      .from("profiles")
      .select("niche, brand_name, goals, platforms, account_connected")
      .eq("user_id", userId)
      .maybeSingle();
    return (base.data as Profile) ?? null;
  } catch {
    return null;
  }
}
