// GET requests that spend (AI, platform quota) or rewrite data must come from
// SOCIA's own pages. Session cookies are SameSite=Lax, so a link or redirect on
// another site still sends them with a top-level GET; every current browser
// marks such a request `Sec-Fetch-Site: cross-site`. Server-to-server callers
// send no Sec-Fetch headers and are unaffected.

import { NextResponse } from "next/server";

export function isCrossSite(req: Request): boolean {
  return req.headers.get("sec-fetch-site") === "cross-site";
}

/** A 403 for a cross-site GET that would change something, or null to go on. */
export function refuseCrossSite(req: Request): NextResponse | null {
  return isCrossSite(req) ? NextResponse.json({ error: "Open this from SOCIA." }, { status: 403 }) : null;
}
