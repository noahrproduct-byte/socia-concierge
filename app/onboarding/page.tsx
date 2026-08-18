import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "@/components/ProfileForm";

export const metadata = { title: "Set up your account — SOCIA" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="onb-wrap">
      <div className="onb-card">
        <div className="onb-logo">
          <span className="side-mark">S</span>SOCIA
        </div>
        <h1>Welcome to SOCIA 👋</h1>
        <p className="onb-sub">
          Tell us about your account so the AI can tailor everything to you. You can
          change this anytime in Settings.
        </p>

        <ProfileForm mode="onboarding" />

        <div className="onb-skip">
          <Link href="/dashboard">Skip for now</Link>
        </div>
      </div>
    </div>
  );
}
