import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import DiscoverPage from "@/components/discover/DiscoverPage";
import { loadDiscoverData } from "@/lib/discoverData";

export const metadata = { title: "Discover | SOCIA" };

// Discover: the data is assembled in lib/discoverData.ts (shared with the Dashboard's viral videos).
export default async function Page() {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  return <DiscoverPage d={await loadDiscoverData(supabase, user)} />;
}
