import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where Google logins, magic links, email confirmations, and password-reset
// links land. It exchanges the one-time code for a real session, then sends
// the user on to the dashboard (or wherever `next` says).
//
// Every failure goes back to /login?error=<code>, and the login page turns
// that code into a plain sentence. Codes: otp_expired (link used or timed
// out), access_denied (OAuth consent cancelled), exchange_failed (Supabase
// rejected the code), no_code (nothing to exchange).
type FailureCode = "otp_expired" | "access_denied" | "exchange_failed" | "no_code";

// Only same-site paths are honored as a destination. Absolute URLs,
// protocol-relative "//host" and backslash variants fall back to the dashboard.
function safeNext(raw: string | null): string | null {
  return raw && /^\/(?![\/\\])/.test(raw) ? raw : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const fail = (reason: FailureCode) =>
    NextResponse.redirect(`${origin}/login?error=${reason}`);

  // Supabase reports link problems (expired or already-used magic link,
  // cancelled Google consent) as query params instead of a code.
  const providerError = searchParams.get("error");
  if (providerError) {
    const errorCode = searchParams.get("error_code") ?? "";
    const description = (searchParams.get("error_description") ?? "").toLowerCase();
    if (errorCode === "otp_expired" || description.includes("expired")) return fail("otp_expired");
    if (providerError === "access_denied") return fail("access_denied");
    return fail("exchange_failed");
  }

  if (!code) return fail("no_code");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("exchange_failed");

  // First-time users (no niche set yet) go through onboarding, unless the
  // link already points somewhere specific (e.g. password reset).
  if (!next) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("niche")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.niche) return NextResponse.redirect(`${origin}/onboarding`);
    }
  }
  return NextResponse.redirect(`${origin}${next ?? "/dashboard"}`);
}
