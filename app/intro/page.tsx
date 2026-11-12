import { getViewer } from "@/lib/supabase/server";
import IntroPreview from "./IntroPreview";

export const metadata = { title: "Introducing SOCIA", robots: { index: false, follow: false } };

// The first-run film on its own, to watch again or to check. It saves
// nothing, and ends on the dashboard when signed in, the homepage otherwise.
export default async function IntroPage() {
  const { user } = await getViewer();
  return <IntroPreview next={user ? "/dashboard" : "/"} />;
}
