import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { igConfigured } from "@/lib/instagram";
import OnboardingFlow from "@/components/OnboardingFlow";

export const metadata = { title: "Welcome to SOCIA" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ ig?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { ig } = await searchParams;
  const { data: igConn } = await supabase
    .from("instagram_connections")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <OnboardingFlow
      igConfigured={igConfigured()}
      igUsername={igConn?.username ?? null}
      igStatus={ig ?? ""}
    />
  );
}
