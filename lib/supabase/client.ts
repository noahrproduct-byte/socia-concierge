import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

// The Supabase client for use in the browser (client components).
// Credentials are read + sanitized in ./env so a stray space or malformed URL
// can't crash the build while prerendering.
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
