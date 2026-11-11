import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext, can } from "@/lib/context";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { minPlanWithFeature } from "@/lib/plans";
import { creditBalance } from "@/lib/credits/ledger";
import { sociaClipperReady } from "@/lib/clipper/socia";
import { clipperProvider } from "@/lib/clipper/vizard";
import PageHeader from "@/components/PageHeader";
import AiGate from "@/components/ai/AiGate";
import ClipperPage from "@/components/ai/ClipperPage";
import "../ai/ai.css";

export const metadata = { title: "AI Clipper | SOCIA" };

// The AI Clipper (Starter and up): a long video in, captioned vertical clips out. The
// server decides what this person may do; the routes enforce it again.
export default async function Clipper() {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  if (!canUseFeature(ent, "ai_clipper")) {
    return (
      <>
        <PageHeader title="AI Clipper" sub="Turn a long video into short clips with captions." />
        <AiGate feature="ai_clipper" plan={minPlanWithFeature("ai_clipper")} currentPlan={ent.plan}
          what="Upload a long video. SOCIA finds the moments that stand on their own and makes them vertical clips with captions, a title, a score and a caption for each, ready to schedule." />
      </>
    );
  }
  const balance = await creditBalance(ctx.ownerId, ent.plan).catch(() => null);
  return (
    <>
      <PageHeader title="AI Clipper" sub="Turn a long video into short clips with captions." />
      <ClipperPage initialBalance={balance} canMutate={can(ctx, "publish")} sociaReady={sociaClipperReady()} vizardReady={Boolean(clipperProvider()) && ent.plan === "scale"} />
    </>
  );
}
