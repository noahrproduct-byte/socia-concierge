import { DM_Sans } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import Home from "@/components/home/Home";

// DM Sans is the documented substitute for the reference's Thicccboi
// (components/home/home.css). Loaded here only, so the app keeps Inter.
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm" });

const TAGLINE =
  "SOCIA reads your Instagram, Facebook and YouTube accounts, compares them with the competitors you follow, and tells you what to post next, why it should work and when to publish.";

export const metadata = {
  title: "SOCIA: social media with an AI strategist",
  description: TAGLINE,
};

/** Whether a person is signed in, so the page's actions lead to the dashboard instead of signup. Never throws. */
async function signedIn(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return Boolean(data.user);
  } catch {
    return false;
  }
}

export default async function Landing() {
  const authed = await signedIn();
  return (
    <div className={dmSans.variable}>
      <Home signedIn={authed} />
    </div>
  );
}
