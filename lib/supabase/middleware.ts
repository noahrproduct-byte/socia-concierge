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
    "/comments",
    "/create",
    "/roundup",
  ];
  if (!user && protectedPaths.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
