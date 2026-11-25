import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext, can } from "@/lib/context";
import { readStrategy } from "@/lib/strategyLoad";
import { experimentResults } from "@/lib/experimentsLoad";
import PageHeader from "@/components/PageHeader";
import StrategyView from "@/components/plan/StrategyView";
import StarterPanel from "@/components/plan/StarterPanel";
import Opportunities from "@/components/intel/Opportunities";
import { opportunitiesFor } from "@/lib/intel/opportunitiesLoad";
import { getProfile } from "@/lib/profile";
import { brandWorkspace } from "@/lib/context";
import { admiredHandles, loadReadiness } from "@/lib/starter/load";
import { starterQuestions } from "@/lib/starter/questions";

export const metadata = { title: "Strategy | SOCIA" };

// Plan > Strategy: the brand's Growth Strategy, the layer weekly plans are
// built from (lib/strategy.ts). Written on first open; edited here.
export default async function StrategyPage() {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);
  const strategy = await readStrategy(ctx).catch(() => null);
  // Each experiment's test posts and what they show (lib/experiments.ts).
  const experiments = await experimentResults(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, strategy).catch(() => []);
  // A new or low-data account gets the starter panel: how much history there is, and what's still unanswered.
  const [readiness, profile, admired, opportunities] = await Promise.all([
    loadReadiness(ctx).catch(() => null),
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
    admiredHandles(ctx).catch(() => []),
    opportunitiesFor(ctx).catch(() => []),
  ]);
  return (
    <>
      <PageHeader title="Strategy" sub="Your objective, audience, content pillars and pace. Weekly plans are built from it." />
      {readiness && readiness.stage !== "established" && (
        <StarterPanel readiness={readiness} questions={starterQuestions(profile?.brand_detail?.growth ?? null, { admired })} canManage={can(ctx, "manage_workspace")} />
      )}
      {opportunities.length > 0 && (
        <section className="opp-section" aria-labelledby="opp-h">
          <h2 id="opp-h">Growth opportunities</h2>
          <p className="opp-lead">What the accounts you learn from do that works for them, and you haven&apos;t tried yet.</p>
          <Opportunities list={opportunities} />
        </section>
      )}
      <StrategyView initial={strategy} experiments={experiments} canManage={can(ctx, "manage_workspace")} />
    </>
  );
}
