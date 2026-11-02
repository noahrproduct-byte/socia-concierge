import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_OPTIONS, getSupabaseAnonKey, getSupabaseUrl } from "./env";
import { ALIVE_COOKIE, FORGET_COOKIE, shouldForget } from "@/lib/rememberMe";

// Runs on every request to keep the login session fresh (refreshes expiring
// tokens) and to bounce logged-out visitors away from protected pages.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // If Supabase is unreachable (e.g. env vars not configured on the host),
  // treat the visitor as logged-out instead of 500-ing every route.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  // "Remember me" was off and the browser has closed since: end the session.
  if (user && shouldForget({ forget: request.cookies.get(FORGET_COOKIE)?.value, alive: request.cookies.get(ALIVE_COOKIE)?.value })) {
    await supabase.auth.signOut().catch(() => null);
    user = null;
    response.cookies.set(FORGET_COOKIE, "", { path: "/", maxAge: 0 });
  }

  // Protect logged-in pages: if not logged in, send to /login.
  const path = request.nextUrl.pathname;
  const protectedPaths = [
    "/dashboard",
    "/onboarding",
    "/analytics",
    "/discover",
    "/niche",
    "/chat",
    "/plan",
    "/scorer",
    "/studio",
    "/reports",
    "/settings",
    "/comments",
    "/create",
    "/roundup",
  ];
  if (!user && protectedPaths.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    // Keep any cookie changes made above (a refreshed or ended session).
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
