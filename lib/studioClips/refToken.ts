// A competitor's Reel, offered as the reference for the person's own version
// ("Make a video like this" on Discover): the link to its file is Instagram's
// CDN URL from official data, signed here for the signed-in viewer, so the
// media proxy (app/api/studio/reference/media) serves exactly the files the
// Discover page offered them and nothing else. Server only.
import { createHmac, timingSafeEqual } from "node:crypto";

function key(): string | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (k) return k;
  return process.env.NODE_ENV === "production" ? null : "socia-dev-export-key";
}
const sign = (k: string, viewerId: string, url: string) => createHmac("sha256", k).update(`ref-media:${viewerId}:${url}`).digest("hex").slice(0, 32);

/** The token the Discover page attaches to a Reel's file link, or null when the server has no key. */
export function signRefUrl(viewerId: string, url: string): string | null {
  const k = key();
  return k ? sign(k, viewerId, url) : null;
}

export function verifyRefUrl(viewerId: string, url: string, token: string): boolean {
  const k = key();
  if (!k || !/^[0-9a-f]{32}$/.test(token)) return false;
  const expected = Buffer.from(sign(k, viewerId, url));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
