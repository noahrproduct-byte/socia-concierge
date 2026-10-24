// Read + sanitize the PUBLIC Supabase credentials (URL + anon/publishable key).
//
// These two values are public by design — Next inlines NEXT_PUBLIC_* into the
// browser bundle, so they ship to every visitor regardless. Because they're not
// secrets, we hardcode the real project values as a last-resort fallback so the
// app keeps working even if the env var gets deleted or mangled in the hosting
// dashboard (a stray space, quotes, a missing "N", etc.). If the env var IS set
// to a valid value, that always takes precedence.
//
// The actual secrets (ANTHROPIC_API_KEY, INSTAGRAM_APP_SECRET) are NEVER
// hardcoded — they stay env-only.

const FALLBACK_URL = "https://cjwdzlxnnvairxnvvzkm.supabase.co";
const FALLBACK_ANON_KEY = "sb_publishable_1cHY5CYlO0HKSn-O0he67A_qXiwUvdu";

function clean(v: string | undefined): string {
  // trim whitespace/newlines and strip surrounding quotes from a pasted value
  return (v || "").trim().replace(/^["']+|["']+$/g, "").trim();
}

export function getSupabaseUrl(): string {
  const v = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // 1) use it if it's already a valid http(s) URL
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:") return v;
  } catch {
    // not directly valid — try to recover a URL from inside the value below
  }
  // 2) recover a supabase URL embedded in a messy value (extra text, newlines…)
  const m = v.match(/https?:\/\/[a-z0-9-]+\.supabase\.[a-z.]+/i);
  if (m) return m[0];
  // 3) last resort: the known public project URL
  return FALLBACK_URL;
}

export function getSupabaseAnonKey(): string {
  const v = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  // Supabase publishable keys look like sb_publishable_... ; accept any non-empty
  // cleaned value, else fall back to the known public key.
  return v || FALLBACK_ANON_KEY;
}

/**
 * Options for the sign-in session cookies. Secure in production so they never
 * travel over plain http. They stay readable by the page's own script because
 * the browser Supabase client needs them (Supabase's design); the content
 * security policy is what limits scripts on the page.
 */
export const SESSION_COOKIE_OPTIONS = { secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
