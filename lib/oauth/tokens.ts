// Random tokens, their stored hashes, and PKCE. Server only (node:crypto).
import { createHash, randomBytes } from "node:crypto";

/** A new opaque token: the prefix plus 32 random bytes, base64url. */
export const newToken = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/** What SOCIA stores instead of a token: its SHA-256, hex. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** RFC 7636 code_verifier: 43 to 128 characters from the unreserved set. */
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
/** An S256 challenge is base64url of a SHA-256: 43 characters. */
export const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

export const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** The verifier matches the challenge the client committed to (S256 only). */
export function verifyPkce(verifier: string | null | undefined, challenge: string): boolean {
  if (!verifier || !VERIFIER_RE.test(verifier) || !CHALLENGE_RE.test(challenge)) return false;
  return s256(verifier) === challenge;
}
