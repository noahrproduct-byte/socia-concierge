import { createBrowserClient } from "@supabase/ssr";

// The Supabase client for use in the browser (client components).
// Reads the public URL + key, which are safe to expose.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
