import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import PageHeader from "@/components/PageHeader";
import SpendView from "@/components/admin/SpendView";
import { loadSpendFacts } from "@/lib/spendLoad";
import { summarizeSpend } from "@/lib/spendCore";

export const metadata = { title: "AI spend | SOCIA" };
export const dynamic = "force-dynamic";

// What SOCIA's AI costs this month, where the month is heading, and how big
// each provider's automatic top-up should be. Admins only (ADMIN_EMAILS);
// everyone else gets a 404. The balance alarm (lib/providerAlarm.ts) links here.
export default async function SpendPage() {
  const { user } = await getViewer();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) notFound();
  const s = summarizeSpend(await loadSpendFacts());
  return (
    <>
      <PageHeader title="AI spend" sub="What SOCIA's AI costs this month, where the month is heading, and how big each automatic top-up should be. Only admins see this page." />
      <SpendView s={s} />
    </>
  );
}
