import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/instagramSync";
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
  const igConn = (await getActiveConnection(supabase, user.id, "username")) as {
    username?: string;
  } | null;

  return (
    <OnboardingFlow
      igConfigured={igConfigured()}
      igUsername={igConn?.username ?? null}
      igStatus={ig ?? ""}
    />
  );
}
