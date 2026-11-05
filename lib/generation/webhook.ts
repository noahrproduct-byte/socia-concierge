// Standard Webhooks (https://www.standardwebhooks.com) signature check, the
// scheme Higgsfield signs its deliveries with: HMAC-SHA256 over
// "<webhook-id>.<webhook-timestamp>.<raw body>" with the secret after the
// "whsec_" prefix, base64; the header carries "v1,<sig>" entries (several
// while a secret is being rotated). Timestamps older than five minutes are
// refused. Pure.
import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_TOLERANCE_SEC = 5 * 60;

export function verifyStandardWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "no secret" };
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "missing headers" };
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(now / 1000 - ts) > WEBHOOK_TOLERANCE_SEC) return { ok: false, reason: "stale timestamp" };
  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return { ok: false, reason: "bad secret" };
  }
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest();
  for (const part of headers.signature.split(/\s+/)) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    let given: Buffer;
    try { given = Buffer.from(sig, "base64"); } catch { continue; }
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "no matching signature" };
}

/** Sign a body the way the provider does (for tests and local checks). */
export function signStandardWebhook(secret: string, id: string, timestamp: string, rawBody: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64")}`;
}
