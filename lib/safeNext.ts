// Where to send someone after signing in: only a path on this site. Anything
// else (another origin, "//host", "@host", a backslash trick) falls back, so
// a crafted ?next= can never send a person off sociaos.com.
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  try {
    const base = "https://socia.invalid";
    const u = new URL(raw, base);
    if (u.origin !== base) return fallback;
    const out = `${u.pathname}${u.search}${u.hash}`;
    // "/.//evil.com" normalises to "//evil.com", which a browser reads as another host.
    if (out.startsWith("//") || out.startsWith("/\\")) return fallback;
    return out;
  } catch {
    return fallback;
  }
}
