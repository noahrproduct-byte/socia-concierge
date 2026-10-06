import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageSquare, ArrowRight } from "lucide-react";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import PageHeader from "@/components/PageHeader";
import CommentsInbox from "@/components/CommentsInbox";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { minPlanWithFeature, pricingHref, PLANS } from "@/lib/plans";
import { listCommentDrafts } from "@/lib/commentDrafts";
import { getFbSnapshot } from "@/lib/facebookSync";
import { getIgSnapshot } from "@/lib/instagramSync";
import "@/components/comments.css";

export const metadata = { title: "Comments — SOCIA" };

// AI comment replies: SOCIA drafts a reply to every new comment on your posts,
// you approve (or edit, or skip) each one. Growth and up. Nothing is ever sent
// without a person approving it.
export default async function CommentsPage() {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);
  const ent = await getEntitlements(ctx.client, ctx.ownerId);

  if (!canUseFeature(ent, "comment_replies")) {
    const plan = minPlanWithFeature("comment_replies") ?? "growth";
    return (
      <>
        <PageHeader title="Comments" sub="SOCIA drafts a reply to every new comment. You approve each one before it's sent." />
        <div className="cm-gate">
          <span className="cm-gate-ico" aria-hidden><MessageSquare size={22} /></span>
          <h2>AI comment replies are on {PLANS[plan].name}</h2>
          <p>Every new comment on your Facebook and Instagram posts gets a suggested reply in your brand&apos;s voice. You approve, edit or skip each one from a single inbox — nothing is ever sent automatically.</p>
          <Link href={pricingHref(plan)} className="cm-cta">Upgrade to {PLANS[plan].name} <ArrowRight size={15} /></Link>
        </div>
      </>
    );
  }

  const wsId = ctx.workspace?.id ?? null;
  const [drafts, fb, ig] = await Promise.all([
    listCommentDrafts(ctx.client, ctx.ownerId, wsId),
    getFbSnapshot(ctx.client, ctx.ownerId).catch(() => null),
    getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null),
  ]);
  const connected = { facebook: fb?.status === "connected", instagram: Boolean(ig && ig.followers_count != null) };

  return (
    <>
      <PageHeader title="Comments" sub="SOCIA drafts a reply to every new comment. You approve each one before it's sent." />
      <CommentsInbox initial={drafts} connected={connected} />
    </>
  );
}
