import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

// The Supabase client for use on the server (server components, route
// handlers, server actions). It reads/writes the login session via cookies.
// Memoised per request render (React cache), so the layout and the page share
// one client instead of each building their own; outside a render (route
// handlers) every call still returns a fresh client.
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component (can't set cookies there).
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
});

/** The signed-in person and the request's client, checked with Supabase once
 *  per render however many components ask. */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});
