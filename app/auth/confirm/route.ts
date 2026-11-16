import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { confirmNext, isConfirmType } from "@/lib/authEmail";

// Where the links in SOCIA's auth emails land when the email template carries
// a token hash: /auth/confirm?token_hash=…&type=email. Supabase checks the
// hash and signs the person in here, so the link works on any device or
// browser, not only the one that signed up (the older /auth/callback code
// exchange needs the browser that started it). A link that is wrong, used or
// expired signs nobody in and goes to the log-in page with a plain message.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (tokenHash && isConfirmType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (!error) {
      // A new account (nothing set up yet) goes through onboarding, unless the link names somewhere else.
      if (!searchParams.get("next") && type !== "recovery") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("niche").eq("user_id", user.id).maybeSingle();
          if (!profile?.niche) return NextResponse.redirect(`${origin}/onboarding`);
        }
      }
      return NextResponse.redirect(`${origin}${confirmNext(searchParams.get("next"), origin, type)}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
