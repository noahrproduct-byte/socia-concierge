import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./env";

// Service-role client. Bypasses Row Level Security. Used only for work the
// server must do that a user session must not be able to do directly: the
// scheduled-post publisher and cron jobs, plan-aware writes (competitor add,
// plan keep, usage refunds), product events, and Meta deauthorize/deletion.
// Never import this from a client component. Every route that uses it still
// authenticates the caller first and scopes the write to that user.
export function createServiceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createSupabase(getSupabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const serviceConfigured = (): boolean => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
