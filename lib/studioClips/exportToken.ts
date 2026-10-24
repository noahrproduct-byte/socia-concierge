// Proof that a video build was counted. POST /api/studio/builds/:id/export
// counts one "video build" and returns the upload path, signed here; saving
// the draft requires a path with a valid signature, and the refund (DELETE)
// needs the same path, works once, and never after that path was saved. So
// a render can't be saved without being counted, and a counted render can't
// be refunded twice or refunded after it was kept.
//
// Server only.

import { createHmac, timingSafeEqual } from "node:crypto";

/** The key: the service-role key never leaves the server. Dev without one uses a fixed key. */
function key(): string | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (k) return k;
  return process.env.NODE_ENV === "production" ? null : "socia-dev-export-key";
}

const sign = (k: string, viewerId: string, buildId: string, stamp: string) =>
  createHmac("sha256", k).update(`video-build:${viewerId}:${buildId}:${stamp}`).digest("hex").slice(0, 32);

/** `<viewer>/studio/<build>/<stamp>-<signature>.mp4`, or null when the server has no key. */
export function signedExportPath(viewerId: string, buildId: string, now: number = Date.now()): string | null {
  const k = key();
  if (!k) return null;
  const stamp = String(now);
  return `${viewerId}/studio/${buildId}/${stamp}-${sign(k, viewerId, buildId, stamp)}.mp4`;
}

/** True when `path` is one signedExportPath made for this viewer and build. */
export function verifyExportPath(path: string, viewerId: string, buildId: string): boolean {
  const k = key();
  if (!k) return false;
  const m = path.match(/^([^/]+)\/studio\/([^/]+)\/(\d{10,16})-([0-9a-f]{32})\.mp4$/);
  if (!m || m[1] !== viewerId || m[2] !== buildId) return false;
  const expected = Buffer.from(sign(k, viewerId, buildId, m[3]));
  const given = Buffer.from(m[4]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
