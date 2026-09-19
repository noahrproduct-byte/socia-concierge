import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

// Runs on every request to keep the login session fresh (refreshes expiring
// tokens) and to bounce logged-out visitors away from protected pages.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
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

  // Protect logged-in pages: if not logged in, send to /login.
  const path = request.nextUrl.pathname;
  const protectedPaths = [
    "/dashboard",
    "/onboarding",
    "/analytics",
    "/competitors",
    "/niche",
    "/chat",
    "/tool",
    "/scorer",
    "/studio",
    "/calendar",
    "/reports",
    "/settings",
  ];
  if (!user && protectedPaths.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Remember where they were headed so login can send them back there.
    // /dashboard is the default destination anyway, so it is left off; that
    // keeps first-time users on the onboarding route after a magic link.
    const returnTo = path + request.nextUrl.search;
    if (returnTo !== "/dashboard" && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      url.searchParams.set("next", returnTo);
    }
    return NextResponse.redirect(url);
  }

  // Signed-in visitors have no use for the auth forms. Redirecting here, at
  // the edge, means the form never flashes before the client-side check runs.
  if (user && (path === "/login" || path === "/signup")) {
    const next = request.nextUrl.searchParams.get("next");
    const target = next && /^\/(?![\/\\])/.test(next) ? next : "/dashboard";
    const redirect = NextResponse.redirect(new URL(target, request.url));
    // Carry over any tokens getUser() just refreshed so they are not lost.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
