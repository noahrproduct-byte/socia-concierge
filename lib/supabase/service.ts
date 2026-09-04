import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./env";

// Service-role client. Bypasses Row Level Security, so it is used by exactly
// one thing: the scheduled-post publisher, which has to see every user's due
// posts without a user session. Never import this from a client component or
// from any route a browser can reach without the cron secret.
export function createServiceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createSupabase(getSupabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const serviceConfigured = (): boolean => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
