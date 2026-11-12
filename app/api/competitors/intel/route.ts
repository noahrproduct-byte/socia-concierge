import { NextResponse } from "next/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { perUserLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { loadDiscoveryInputs, readStoredDiscovery, runFreshDiscovery, type IntelDoc, type IntelSources } from "@/lib/discoveryRun";

export type { IntelDoc, IntelSources } from "@/lib/discoveryRun";

/** Fresh research runs one account may start per hour. */
const INTEL_RUNS_PER_HOUR = 2;

export const runtime = "nodejs";
export const maxDuration = 120;

// The discovery pipeline lives in lib/discoveryRun.ts (the niche scan runs it
// too). This route decides whether a run is due: the cached result, the plan,
// the refresh cooldown and the hourly ceiling are enforced here, never in the UI.
//
// The run belongs to the ACTIVE Brand Workspace: the profile, the Instagram
// connection and the stored results are the workspace owner's (lib/context).
// Any role may read (and trigger the first run); forcing a refresh is for the
// owner and admins, and the feature check is against the owner's plan.

// A run is reused for six hours. A manual refresh (Niche intelligence, Starter
// and up) may force a new run at most once an hour; on Free the button is
// honoured only once the run is stale. Each run spends model web searches and
// YouTube quota.
const FRESH_MS = 6 * 60 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

export async function GET(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const wantsRefresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (wantsRefresh && !can(ctx, "manage_workspace")) {
    return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  }

  const inputs = await loadDiscoveryInputs(ctx);
  const { profileGaps, wsId, own } = inputs;

  // ---- cached results, unless a permitted refresh was asked for ----------
  const cached = await readStoredDiscovery(ctx.client, ctx.ownerId, wsId, own);
  const ageMs = cached?.ranAt ? Date.now() - new Date(cached.ranAt).getTime() : Infinity;
  let refresh = false;
  let nextRefreshAt: string | null = null;
  // The owner's plan decides, whoever opened the page or pressed the button.
  const research = canUseFeature(await getEntitlements(ctx.client, ctx.ownerId), "niche_intelligence");
  if (wantsRefresh && cached?.ranAt && research) {
    if (ageMs >= REFRESH_COOLDOWN_MS) refresh = true;
    else nextRefreshAt = new Date(new Date(cached.ranAt).getTime() + REFRESH_COOLDOWN_MS).toISOString();
  }
  if (!refresh && cached && ageMs < FRESH_MS) {
    return NextResponse.json({ ...cached, profileGaps, nextRefreshAt });
  }
  // Each run spends web-search AI and shared YouTube quota: without niche
  // intelligence (Free), a brand gets its first run and then keeps it.
  if (!research && cached?.ranAt) {
    return NextResponse.json({ ...cached, profileGaps, nextRefreshAt: null });
  }

  if (!inputs.profile.niche) {
    return NextResponse.json({
      accounts: [], content: [], trends: [], ranAt: null,
      sources: { youtube: "not_configured", web: "failed" } as IntelSources,
      profileGaps,
    });
  }

  // A fresh run spends about 500 units of SOCIA's shared daily YouTube quota
  // and up to three web-search model calls: a hard hourly ceiling per account,
  // checked atomically, so neither a loop nor parallel requests can drain the
  // quota every customer depends on.
  const limited = await perUserLimit(ctx.ownerId, "competitor_intel", INTEL_RUNS_PER_HOUR, "competitor research runs");
  if (limited) return limited;

  const doc: IntelDoc = await runFreshDiscovery(ctx, inputs);
  return NextResponse.json(doc);
}
