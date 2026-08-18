import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import OnboardingFlow from "@/components/OnboardingFlow";

export const metadata = { title: "Set up your account — SOCIA" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="onb-wrap">
      <div className="onb-card onb-card-wide">
        <div className="onb-logo">
          <span className="side-mark">S</span>SOCIA
        </div>
        <h1>Welcome to SOCIA 👋</h1>
        <p className="onb-sub">
          Two quick steps and your AI strategist is tailored to you. You can change
          any of this later in Settings.
        </p>

        <OnboardingFlow />

        <div className="onb-skip">
          <Link href="/dashboard">Skip for now</Link>
        </div>
      </div>
    </div>
  );
}
