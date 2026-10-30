import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext, can } from "@/lib/context";
import { readStrategy } from "@/lib/strategyLoad";
import { experimentResults } from "@/lib/experimentsLoad";
import PageHeader from "@/components/PageHeader";
import StrategyView from "@/components/plan/StrategyView";

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
  return (
    <>
      <PageHeader title="Strategy" sub="Your objective, audience, content pillars and pace. Weekly plans are built from it." />
      <StrategyView initial={strategy} experiments={experiments} canManage={can(ctx, "manage_workspace")} />
    </>
  );
}
