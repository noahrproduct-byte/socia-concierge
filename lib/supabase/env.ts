// Read + sanitize the public Supabase credentials.
//
// Values pasted into a hosting dashboard often pick up a stray leading/trailing
// space or newline. An unparseable URL makes @supabase/ssr throw
// ("Invalid supabaseUrl") while the page is prerendered, which fails the ENTIRE
// build. So we trim the values, validate the URL, and fall back to a harmless
// placeholder if it still isn't a real http(s) URL — a bad value can never take
// down the build again, and a merely whitespace-padded value is auto-repaired.

export function getSupabaseUrl(): string {
  const v = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:") return v;
  } catch {
    // not a valid URL — fall through to placeholder
  }
  return "https://placeholder.supabase.co";
}

export function getSupabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim() || "placeholder-anon-key";
}
