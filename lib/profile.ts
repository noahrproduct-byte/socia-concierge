import { timedFn } from "@/lib/timing";
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
  /** light | dark | system; null until the user picks one. */
  appearance?: "light" | "dark" | "system" | null;
};

/**
 * A Brand Workspace's own brand fields, when the app should read the brand from
 * the workspace rather than the shared per-user profile. Any Workspace object
 * satisfies this structurally. Pass it only for a NON-default workspace: the
 * default workspace keeps using the profile row, so existing single-workspace
 * accounts are unchanged. Use context.brandWorkspace(ctx) to decide.
 */
export type BrandSource = {
  niche: string | null;
  brand_name: string | null;
  goals: string | null;
  brand_detail?: BrandDetail | null;
};

// Reads the signed-in user's profile row. Returns null if the profile hasn't
// been created yet or the `profiles` table doesn't exist. Callers treat a null
// (or account_connected: false) as "no account connected yet".
//
// When `brandWs` is given (a non-default Brand Workspace), the brand fields
// (niche, brand_name, goals, brand_detail) come from that workspace instead of
// the profile, so a second brand has its own identity. Non-brand fields
// (platforms, account_connected, appearance) stay per-user.
async function getProfileImpl(
  supabase: SupabaseClient,
  userId: string,
  brandWs?: BrandSource | null,
): Promise<Profile | null> {
  const withBrand = (base: Profile | null): Profile | null => {
    if (!brandWs) return base;
    const brand = { niche: brandWs.niche, brand_name: brandWs.brand_name, goals: brandWs.goals, brand_detail: brandWs.brand_detail ?? null };
    return base ? { ...base, ...brand } : { ...brand, platforms: null, account_connected: false };
  };
  try {
    const newest = await supabase
      .from("profiles")
      .select("niche, brand_name, goals, platforms, account_connected, brand_detail, appearance")
      .eq("user_id", userId)
      .maybeSingle();
    if (!newest.error) return withBrand((newest.data as Profile) ?? null);
    // appearance column may not exist yet
    const full = await supabase
      .from("profiles")
      .select("niche, brand_name, goals, platforms, account_connected, brand_detail")
      .eq("user_id", userId)
      .maybeSingle();
    if (!full.error) return withBrand((full.data as Profile) ?? null);
    // brand_detail column may not exist yet — fall back to the legacy columns.
    const base = await supabase
      .from("profiles")
      .select("niche, brand_name, goals, platforms, account_connected")
      .eq("user_id", userId)
      .maybeSingle();
    return withBrand((base.data as Profile) ?? null);
  } catch {
    return null;
  }
}

/** getProfile, logged when slow (lib/timing.ts). */
export const getProfile = timedFn("getProfile", getProfileImpl);
