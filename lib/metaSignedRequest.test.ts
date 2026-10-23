import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignedRequest } from "./metaSignedRequest";

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sign = (payload: object, secret: string) => {
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret).update(p).digest());
  return `${sig}.${p}`;
};

const AT = new Date(1700000000 * 1000 + 3600_000);

describe("Meta signed_request", () => {
  const payload = { algorithm: "HMAC-SHA256", issued_at: 1700000000, user_id: "17841400000000000" };
  it("accepts a request signed with either configured secret and reports which", () => {
    const a = verifySignedRequest(sign(payload, "ig-secret"), ["ig-secret", "fb-secret"], AT);
    const b = verifySignedRequest(sign(payload, "fb-secret"), ["ig-secret", "fb-secret"], AT);
    expect(a.ok && a.via).toBe(0);
    expect(b.ok && b.via).toBe(1);
    expect(a.ok && a.payload.user_id).toBe("17841400000000000");
  });
  it("rejects a bad signature, a malformed token and an unknown algorithm", () => {
    expect(verifySignedRequest(sign(payload, "wrong"), ["ig-secret", "fb-secret"], AT)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySignedRequest("nodot", ["ig-secret"], AT)).toEqual({ ok: false, reason: "malformed" });
    expect(verifySignedRequest(sign({ ...payload, algorithm: "MD5" }, "ig-secret"), ["ig-secret"], AT)).toEqual({ ok: false, reason: "unsupported_algorithm" });
  });
  it("skips missing secrets instead of matching an empty one", () => {
    expect(verifySignedRequest(sign(payload, ""), [undefined, "fb-secret"], AT).ok).toBe(false);
  });
  it("refuses a correctly signed request that is too old, from the future, or has no time", () => {
    const later = new Date((1700000000 + 30 * 24 * 3600) * 1000);
    expect(verifySignedRequest(sign(payload, "ig-secret"), ["ig-secret"], later)).toEqual({ ok: false, reason: "stale" });
    const before = new Date((1700000000 - 2 * 3600) * 1000);
    expect(verifySignedRequest(sign(payload, "ig-secret"), ["ig-secret"], before)).toEqual({ ok: false, reason: "stale" });
    expect(verifySignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "1" }, "ig-secret"), ["ig-secret"], AT)).toEqual({ ok: false, reason: "stale" });
  });
});
