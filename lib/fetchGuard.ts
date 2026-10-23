// Server-side fetches of media URLs that came from stored rows. Those rows can
// be edited by their owner (and, for synced platform data, came from a
// platform), so a URL is never fetched just because it is stored: it must be
// https on a known platform CDN, and every redirect hop is checked again.
// Without this, SOCIA could be made to fetch internal or arbitrary addresses
// and hand back what it got (server-side request forgery).
//
// Server only.

/** Hosts that serve Instagram and Facebook media. */
const PLATFORM_MEDIA_DOMAINS = ["cdninstagram.com", "fbcdn.net"];

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** True for an https URL on Instagram's or Facebook's media CDN. */
export function isPlatformMediaUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    const host = u.hostname.toLowerCase();
    return PLATFORM_MEDIA_DOMAINS.some((d) => onDomain(host, d));
  } catch {
    return false;
  }
}

/**
 * fetch() that follows at most `maxRedirects` redirects and only while every
 * URL passes `allowed`. Returns null when a hop is refused or the request fails.
 */
export async function fetchAllowed(
  url: string,
  allowed: (url: string) => boolean,
  init: RequestInit = {},
  maxRedirects = 3,
  fetchImpl: typeof fetch = fetch,
): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!allowed(current)) return null;
    let res: Response;
    try {
      res = await fetchImpl(current, { ...init, redirect: "manual" });
    } catch {
      return null;
    }
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) return res;
    try {
      current = new URL(loc, current).toString();
    } catch {
      return null;
    }
  }
  return null;
}

const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "fb.watch"];

/** https on instagram.com, facebook.com or fb.watch (or a subdomain), nothing look-alike. */
export function isSocialContentUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && SOCIAL_HOSTS.some((d) => onDomain(host, d));
  } catch {
    return false;
  }
}
