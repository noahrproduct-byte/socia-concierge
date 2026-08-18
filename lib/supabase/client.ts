import { createBrowserClient } from "@supabase/ssr";

// The Supabase client for use in the browser (client components).
// Reads the public URL + key, which are safe to expose.
//
// The fallbacks matter: NEXT_PUBLIC_* values are inlined at BUILD time. If they
// are missing during a build (e.g. env vars not set on the host), we still want
// the build to succeed rather than crash while prerendering a page — otherwise a
// single missing variable takes down every deploy. At runtime, when the vars are
// present, the real values are used; when they're absent, calls simply fail
// instead of throwing at build.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
  return createBrowserClient(url, key);
}
