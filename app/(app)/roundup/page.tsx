import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { minPlanWithFeature, pricingHref, PLANS } from "@/lib/plans";
import { getActiveWorkspace } from "@/lib/workspaces";
import { buildWeeklyRoundup } from "@/lib/weeklyRoundup";
import { RoundupLocked, RoundupView } from "./RoundupView";

export const metadata = { title: "Weekly roundup · SOCIA" };

export default async function RoundupPage() {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);
  const [ent, ws] = await Promise.all([
    getEntitlements(ctx.client, ctx.ownerId),
    getActiveWorkspace(supabase, user.id),
  ]);

  // Starter and up. A plan without it sees what the feature is and how to get it.
  if (!canUseFeature(ent, "weekly_trend_roundup")) {
    const plan = minPlanWithFeature("weekly_trend_roundup");
    return <RoundupLocked plan={PLANS[plan].name} href={pricingHref(plan)} />;
  }

  const roundup = await buildWeeklyRoundup(ctx.client, ctx.ownerId, ws?.id ?? null, new Date());
  return <RoundupView wsName={ws?.name ?? "Your brand"} roundup={roundup} />;
}
