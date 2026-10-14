import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** sociaos.com is the canonical origin (and the OAuth issuer); www redirects to it. */
const WWW_HOST = "www.sociaos.com";
const CANONICAL_ORIGIN = "https://sociaos.com";

/**
 * Paths that never use the sign-in session: the MCP endpoint and the OAuth
 * server's machine endpoints answer bearer tokens and form posts from AI
 * apps, so they skip the session refresh (one less network call each).
 */
const SESSIONLESS = ["/mcp", "/.well-known/", "/oauth/token", "/oauth/register", "/oauth/revoke"];

export async function middleware(request: NextRequest) {
  if (request.headers.get("host")?.toLowerCase() === WWW_HOST) {
    const url = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, CANONICAL_ORIGIN);
    return NextResponse.redirect(url, 308);
  }
  const path = request.nextUrl.pathname;
  if (SESSIONLESS.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`))) return NextResponse.next();
  return await updateSession(request);
}

export const config = {
  // Run on all routes except static files and images.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
