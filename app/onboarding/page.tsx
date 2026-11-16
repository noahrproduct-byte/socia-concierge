import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/instagramSync";
import { igConfigured } from "@/lib/instagram";
import { fbConfigured } from "@/lib/facebook";
import { ytAuthConfigured } from "@/lib/youtubeAuth";
import { ttAuthConfigured } from "@/lib/tiktokAuth";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { readOnboarding, saveOnboarding } from "@/lib/growthStore";
import { syncCheckoutSession } from "@/lib/billing";
import { resumeStep } from "@/lib/onboarding";
import { scopeToWorkspace, listAccessibleWorkspaces } from "@/lib/workspaces";
import OnboardingFlow from "@/components/OnboardingFlow";
import type { ConnectState } from "@/components/ConnectAccounts";
import { offlineFor } from "@/lib/platformAccess";
import { isAdminEmail } from "@/lib/admin";
import { INTRO_COOKIE, introDue } from "@/lib/intro";
import { cookies } from "next/headers";
import { IG_STATE_COOKIE } from "@/lib/oauthState";
import IntroGate from "@/components/intro/IntroGate";

export const metadata = { title: "Welcome to SOCIA" };

const start = (platform: string) => `/api/auth/${platform}/start?next=onboarding`;

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ ig?: string; fb?: string; yt?: string; tt?: string; billing?: string; session_id?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { ig, fb, yt, tt, billing, session_id } = await searchParams;
  const igConn = (await getActiveConnection(supabase, user.id, "username")) as {
    username?: string;
  } | null;

  // The other platforms' rows for the active Brand Workspace, the same read
  // Settings makes. A failed read shows "Not connected", never a guess.
  const ctx = await resolveContext(supabase, user.id);
  const row = async (table: string, cols: string): Promise<Record<string, unknown> | null> => {
    const { data } = await scopeToWorkspace(
      ctx.client.from(table).select(cols).eq("user_id", ctx.ownerId),
      ctx.workspace?.id,
    ).limit(1);
    return ((data as unknown as Record<string, unknown>[] | null) ?? [])[0] ?? null;
  };
  // Back from Stripe's checkout. The plan is switched on from what Stripe says
  // about this session (and by the webhook), never from the address alone: a
  // session that isn't this person's, or isn't paid, changes nothing.
  let planNotice: string | null = null;
  if (billing === "success" && session_id) {
    const paid = await syncCheckoutSession(session_id, user.id);
    if (paid) {
      await saveOnboarding(ctx, { step: "plan", completed: true });
      redirect("/dashboard?welcome=1");
    }
    planNotice = "We couldn't confirm the payment yet. If you paid, your plan switches on within a minute. Reload this page to check.";
  } else if (billing === "cancelled") {
    planNotice = "Checkout was cancelled. Nothing was charged.";
  }

  const [fbRow, ytRow, ttRow] = await Promise.all([
    row("facebook_connections", "page_name, username, connection_status").catch(() => null),
    row("youtube_connections", "title, handle").catch(() => null),
    row("tiktok_connections", "display_name, username").catch(() => null),
  ]);
  const name = (r: Record<string, unknown> | null, handle: string, title: string): string | null => {
    if (!r) return null;
    const h = typeof r[handle] === "string" && r[handle] ? String(r[handle]) : null;
    const t = typeof r[title] === "string" && r[title] ? String(r[title]) : null;
    return h ? (h.startsWith("@") ? h : `@${h}`) : t;
  };
  const fbName = fbRow?.connection_status === "connected" ? name(fbRow, "username", "page_name") : null;

  const connections: ConnectState[] = [
    { id: "Instagram", href: igConfigured() ? start("instagram") : null, connectedAs: igConn?.username ? `@${igConn.username}` : null },
    // Facebook and TikTok aren't open to new connections yet (lib/platformStatus.ts); admins still connect from Settings.
    { id: "Facebook", href: fbConfigured() ? start("facebook") : null, connectedAs: fbName, offline: offlineFor("facebook", user.email) },
    { id: "YouTube", href: ytAuthConfigured() ? start("youtube") : null, connectedAs: name(ytRow, "handle", "title") },
    { id: "TikTok", href: ttAuthConfigured() ? start("tiktok") : null, connectedAs: name(ttRow, "username", "display_name"), offline: offlineFor("tiktok", user.email) },
  ];

  const returned = [
    { name: "Facebook", code: fb ?? "" },
    { name: "YouTube", code: yt ?? "" },
    { name: "TikTok", code: tt ?? "" },
  ].filter((r) => r.code && r.code !== "connected");

  // Saved progress and answers, so leaving and coming back resumes here.
  const [{ tableReady, row: progress }, profile, workspaces] = await Promise.all([
    readOnboarding(ctx),
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
    listAccessibleWorkspaces(supabase, user.id).catch(() => []),
  ]);
  // Setup is required per brand: with several, the person can switch to
  // another brand from here instead of being held on this one.
  const brands = workspaces.map((w) => ({ id: w.id, name: w.name, active: w.id === ctx.workspace?.id }));
  // Back from a platform's sign-in: stay on Connect so the result shows.
  const fromOAuth = Boolean(ig || fb || yt || tt);
  // An Instagram connection was started in the last few minutes and never came
  // back (Noah, 2026-11-15: Instagram stopped to confirm it was him and then
  // left him on its own home page). The start cookie is still here and nothing
  // is connected, so Connect says what happened and what to do.
  const igInterrupted = !fromOAuth && !igConn?.username && Boolean((await cookies()).get(IG_STATE_COOKIE));
  const initial = {
    step: fromOAuth || igInterrupted ? ("connect" as const) : billing ? ("plan" as const) : resumeStep(progress),
    tableReady,
    niche: profile?.niche ?? null,
    brandName: profile?.brand_name ?? null,
    detail: profile?.brand_detail ?? null,
    introSeen: Boolean((progress?.answers as Record<string, unknown> | null | undefined)?.sio_intro),
  };

  return (
    <>
      <OnboardingFlow
        initial={initial}
        brands={brands}
        connections={connections}
        igStatus={ig ?? ""}
        returned={returned}
        planNotice={planNotice}
        igInterrupted={igInterrupted}
      />
      {/* a new owner lands here first, so the first-run film plays here */}
      {introDue(user) && <IntroGate userId={user.id} seen={Boolean((await cookies()).get(INTRO_COOKIE))} />}
    </>
  );
}
