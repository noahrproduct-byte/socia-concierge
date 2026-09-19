// Meta "signed_request" verification, shared by the deauthorize and data
// deletion callbacks. Meta POSTs a form field `signed_request` of the form
// `<base64url signature>.<base64url payload>`; the signature is HMAC-SHA256 of
// the payload string with the app secret. Facebook Login and the Instagram
// app inside the same Meta app sign with their own secrets, so a request is
// accepted when it verifies against either one.
//
// Secrets are read from the environment only and never logged.

import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedPayload = {
  algorithm?: string;
  issued_at?: number;
  /** App-scoped Facebook user id, or the Instagram-scoped user id. */
  user_id?: string;
  [k: string]: unknown;
};

const b64url = (s: string): Buffer => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Meta signs a request moments before delivering it. A payload dated
 *  further from now than this (either way, to absorb clock skew) is a replay
 *  of a captured request, not a live callback. In seconds. */
export const SIGNED_REQUEST_MAX_AGE_S = 10 * 60;

/** `nowS` (unix seconds) exists so tests can pin the clock. */
export function verifySignedRequest(
  signed: string,
  secrets: (string | undefined)[],
  nowS: number = Math.floor(Date.now() / 1000),
): { ok: true; payload: SignedPayload; via: number } | { ok: false; reason: string } {
  const [sigPart, payloadPart] = signed.split(".", 2);
  if (!sigPart || !payloadPart) return { ok: false, reason: "malformed" };
  let payload: SignedPayload;
  try {
    payload = JSON.parse(b64url(payloadPart).toString("utf8")) as SignedPayload;
  } catch {
    return { ok: false, reason: "payload_not_json" };
  }
  if ((payload.algorithm ?? "HMAC-SHA256").toUpperCase() !== "HMAC-SHA256") return { ok: false, reason: "unsupported_algorithm" };
  const sig = b64url(sigPart);
  for (let i = 0; i < secrets.length; i++) {
    const secret = secrets[i];
    if (!secret) continue;
    const expected = createHmac("sha256", secret).update(payloadPart).digest();
    if (expected.length === sig.length && timingSafeEqual(expected, sig)) {
      // Signature first, freshness second: a stale token is only "expired"
      // once it is known to be Meta's at all.
      const issued = payload.issued_at;
      if (typeof issued !== "number" || !Number.isFinite(issued)) return { ok: false, reason: "no_issued_at" };
      if (Math.abs(nowS - issued) > SIGNED_REQUEST_MAX_AGE_S) return { ok: false, reason: "expired" };
      return { ok: true, payload, via: i };
    }
  }
  return { ok: false, reason: "bad_signature" };
}

/** The secrets a Meta callback may be signed with, in a stable order. */
export const metaSecrets = () => [process.env.INSTAGRAM_APP_SECRET, process.env.FACEBOOK_APP_SECRET];

/** Read `signed_request` from a form-encoded or JSON body. */
export async function readSignedRequest(req: Request): Promise<string | null> {
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const j = (await req.json()) as { signed_request?: string };
      return typeof j.signed_request === "string" ? j.signed_request : null;
    }
    const text = await req.text();
    const params = new URLSearchParams(text);
    return params.get("signed_request");
  } catch {
    return null;
  }
}
