import { Geist_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import Home from "@/components/home/Home";
import { homeAssets } from "@/lib/homeAssets";

// Inter comes from the root layout (--font-sans). Geist Mono is the
// reference's face for technical micro-labels and metadata (components/home/home.css).
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

const TAGLINE =
  "SOCIA reads your Instagram, Facebook and YouTube accounts, compares them with the competitors you follow, and tells you what to post next, why it should work and when to publish.";

export const metadata = {
  title: "SOCIA: know what to post next",
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
    <div className={geistMono.variable}>
      <Home signedIn={authed} assets={homeAssets()} />
    </div>
  );
}
