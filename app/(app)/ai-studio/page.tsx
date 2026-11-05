import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext, can } from "@/lib/context";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { minPlanWithFeature } from "@/lib/plans";
import { creditBalance } from "@/lib/credits/ledger";
import PageHeader from "@/components/PageHeader";
import AiGate from "@/components/ai/AiGate";
import AiStudioPage from "@/components/ai/AiStudioPage";
import "../ai/ai.css";

export const metadata = { title: "AI Studio | SOCIA" };

// AI Studio (Scale): ideas from the brand's own profile, turned into AI videos and images.
export default async function AiStudio() {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  if (!canUseFeature(ent, "ai_studio")) {
    return (
      <>
        <PageHeader title="AI Studio" sub="Ideas from your brand, made into AI videos and images." />
        <AiGate feature="ai_studio" plan={minPlanWithFeature("ai_studio")} currentPlan={ent.plan}
          what="SOCIA writes content ideas from your niche and brand voice; pick one and it becomes a video or image on a curated set of models, with a caption, ready to schedule." />
      </>
    );
  }
  const balance = await creditBalance(ctx.ownerId, ent.plan).catch(() => null);
  return (
    <>
      <PageHeader title="AI Studio" sub="Ideas from your brand, made into AI videos and images." />
      <AiStudioPage initialBalance={balance} canMutate={can(ctx, "publish")} aiReady={Boolean(process.env.ANTHROPIC_API_KEY)} />
    </>
  );
}
