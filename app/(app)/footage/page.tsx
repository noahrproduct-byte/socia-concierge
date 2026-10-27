import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import FootagePage from "@/components/footage/FootagePage";

export const metadata = { title: "Footage — SOCIA" };

// Footage: the standing clip library. Drop raw clips whenever you shoot;
// SOCIA understands what is new, finds the posts in it, and the cuts become
// drafts you approve. One library per Brand Workspace; everything heavy
// about a clip is measured in the browser, like Build from Clips.
export default async function Page() {
  const { user } = await getViewer();
  if (!user) redirect("/login");
  return (
    <Suspense fallback={null}>
      <FootagePage />
    </Suspense>
  );
}
