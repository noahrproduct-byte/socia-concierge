import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where Google logins, magic links, email confirmations, and password-reset
// links land. It exchanges the one-time code for a real session, then sends
// the user on to the dashboard (or wherever `next` says).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send them back to login with a flag.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
