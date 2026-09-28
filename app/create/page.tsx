import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, canUseFeature, checkFeature } from "@/lib/entitlements";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import { interactionsTotal } from "@/lib/engagement";
import { formatOf } from "@/lib/overview";
import type { TimedPost } from "@/lib/postingTimes";
import { hasDestinationsTable, loadPickerAccountsDetailed } from "@/lib/publishing/db";
import type { PickerAccount } from "@/lib/publishing/composer";
import type { ComposerPageProps } from "@/components/composer/contracts";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import ComposerPage from "@/components/composer/ComposerPage";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { PLANS, type PlanId } from "@/lib/plans";
import type { PlanError } from "@/lib/planErrors";

export const metadata = { title: "Create post — SOCIA" };

/** A Member's answer in the shape the composer already renders for a plan
 *  answer: the sentence, then one quiet link. Publishing is owner/admin only. */
function roleNotice(plan: PlanId): PlanError {
  return {
    error: forbiddenCopy("publish"),
    code: "feature_locked", plan, planName: PLANS[plan].name,
    requiredPlan: null, requiredPlanName: null,
    cta: "Workspace settings", href: "/settings",
  };
}

// Create Post. The server decides what this person may do (plan, connected
// accounts, whether the publishing tables exist) and hands the client the
// facts; the client never has to guess and the API routes enforce it again.

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** A prefilled publish time from the calendar: only a parseable ISO instant that is still ahead of now. */
function futureIso(v: string | null): string | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  if (!Number.isFinite(t) || t <= Date.now()) return null;
  return new Date(t).toISOString();
}

export default async function CreatePostPage({ searchParams }: { searchParams: Promise<Params> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // The active Brand Workspace: its owner's accounts, plan and history, read
  // through ctx.client. Uploads still land in the viewer's own storage folder.
  const ctx = await resolveContext(supabase, user.id);

  const sp = await searchParams;
  const postId = one(sp.post);
  const caption = one(sp.caption);
  const planId = one(sp.planId);
  const planDay = one(sp.planDay);
  const at = futureIso(one(sp.at));
  const fromParam = one(sp.from);
  const source: ComposerPageProps["initial"]["source"] = fromParam === "studio" ? "studio" : fromParam === "plan" ? "plan" : null;
  const mode: "quick" | "advanced" = one(sp.mode) === "quick" ? "quick" : "advanced";

  const [ent, snap, accountsRes, ready] = await Promise.all([
    getEntitlements(ctx.client, ctx.ownerId),
    getIgSnapshot(ctx.client, ctx.ownerId).catch(() => null),
    // A read failure means the list is a lower bound (complete: false), never "no accounts".
    loadPickerAccountsDetailed(ctx.client, ctx.ownerId).then(
      (r) => ({ accounts: r.accounts as PickerAccount[], complete: r.complete }),
      () => ({ accounts: [] as PickerAccount[], complete: false }),
    ),
    // The publishing migration may not have run yet: a missing table is a calm notice, not a crash.
    // Any other error (network, permissions) keeps the composer open and lets the API routes answer.
    hasDestinationsTable(ctx.client),
  ]);

  // The owner's plan first, then the viewer's role: a Member drafts, the
  // owner or an admin publishes. POST /api/posts enforces both again.
  const roleOk = can(ctx, "publish");
  const canPublish = canUseFeature(ent, "scheduling") && roleOk;
  const check = checkFeature(ent, "scheduling");
  const planError = !check.ok ? check.error : roleOk ? null : roleNotice(ent.plan);

  // Real posting history for the scheduling suggestions. null = SOCIA holds no Instagram snapshot.
  let timing: ComposerPageProps["timing"] = { instagram: null };
  if (snap) {
    const media: IgMediaItem[] = snap.media ?? [];
    const timed: TimedPost[] = media
      .filter((m) => m.timestamp)
      .map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) }));
    timing = { instagram: { timed } };
  }

  const props: ComposerPageProps = {
    userId: user.id,
    accounts: accountsRes.accounts,
    accountsComplete: accountsRes.complete,
    timing,
    initial: { item: null, caption, planId, planDay, source, mode, at },
    canPublish,
    planError,
    ready,
  };

  return (
    <AppShell active="create" userEmail={user.email}>
      <PageHeader title="Create post" sub="Create, customize, and publish to your connected platforms." />
      {/* A different post id remounts the composer so "Create another" and editing never share state. */}
      <ComposerPage key={postId ?? "new"} {...props} postId={postId} />
    </AppShell>
  );
}
