// Is this request SOCIA's scheduled job? The pg_cron jobs send
// "Authorization: Bearer <CRON_SECRET>". Fails closed when the secret is not
// set, tolerates the ways a pasted secret gets mangled (quotes, whitespace,
// "bearer" casing), and compares in constant time. Server only.

import { createHash, timingSafeEqual } from "node:crypto";

const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/^["']|["']$/g, "");

export function isCronRequest(req: Request, secretRaw: string | undefined = process.env.CRON_SECRET): boolean {
  const secret = clean(secretRaw);
  if (!secret) return false;
  const bearer = clean(req.headers.get("authorization")).match(/^bearer\s+(.+)$/i)?.[1];
  if (bearer === undefined) return false;
  // Hash both sides: equal-length buffers, and no early exit on length.
  const a = createHash("sha256").update(clean(bearer)).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
