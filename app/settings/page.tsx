import { redirect } from "next/navigation";
import Link from "next/link";
import {
  UserRound,
  Share2,
  CreditCard,
  Lock,
  LogOut,
  Sparkles,
  Sparkle,
  Radar,
  Bell,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  SunMoon,
} from "lucide-react";
import AppearanceSettings from "@/components/AppearanceSettings";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import BrandSettings from "@/components/BrandSettings";
import StrategistSettings from "@/components/StrategistSettings";
import IntelligenceCard, { type IntelState } from "@/components/IntelligenceCard";
import SecurityCard from "@/components/SecurityCard";
import SettingsNav from "@/components/SettingsNav";
import ConnectionsManager from "@/components/ConnectionsManager";
import InstagramConnect from "@/components/InstagramConnect";
import FacebookConnect, { type FbPageOption } from "@/components/FacebookConnect";
import YouTubeConnect from "@/components/YouTubeConnect";
import TikTokConnect from "@/components/TikTokConnect";
import { ttAuthConfigured } from "@/lib/tiktokAuth";
import { ytAuthConfigured } from "@/lib/youtubeAuth";
import { YT_WRITE_SCOPES } from "@/lib/publishing/capabilities";
import type { FbPost } from "@/lib/facebookSync";
import { getIgSnapshot } from "@/lib/instagramSync";
import {
  getEntitlements, getUsage, listConnectedAccountsDetailed, countActiveCompetitors, computeOverLimits,
  activeAccounts, activeByPlatform, workspacesInUse, getLimit,
} from "@/lib/entitlements";
import { limitError } from "@/lib/planErrors";
import PlanNotice from "@/components/PlanNotice";
import PlanBilling from "@/components/settings/PlanBilling";
import WorkspacesManager, { type WorkspaceRow } from "@/components/settings/WorkspacesManager";
import type { KeepCompetitor } from "@/components/settings/PlanKeepChooser";
import type { BrandDetail } from "@/lib/profile";
import { workspacesEnabled, listWorkspaces, getActiveWorkspace, activeWorkspaces } from "@/lib/workspaces";
import { Briefcase } from "lucide-react";

export const metadata = { title: "Settings — SOCIA" };

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** Every tracked competitor, paused ones included, for the "choose what to keep" state. */
async function listTrackedCompetitors(supabase: Supa, userId: string): Promise<KeepCompetitor[]> {
  type Row = { platform: string | null; handle: string | null; is_active?: boolean | null };
  const shape = (rows: Row[], activeKnown: boolean): KeepCompetitor[] =>
    rows
      .filter((r) => r.platform && r.handle)
      .map((r) => ({ platform: r.platform as string, handle: r.handle as string, active: activeKnown ? r.is_active !== false : true }));
  try {
    const { data, error } = await supabase
      .from("tracked_competitors")
      .select("platform, handle, is_active")
      .eq("user_id", userId)
      .order("added_at", { ascending: true });
    if (!error) return shape((data ?? []) as Row[], true);
  } catch {
    /* is_active may not exist yet */
  }
  try {
    const { data, error } = await supabase
      .from("tracked_competitors")
      .select("platform, handle")
      .eq("user_id", userId)
      .order("added_at", { ascending: true });
    if (!error) return shape((data ?? []) as Row[], false);
  } catch {
    /* table may not exist */
  }
  return [];
}

// Preview competitor list — same labeled demo set as the Competitors page.
const PREVIEW_COMPETITORS = [
  { handle: "@cheese.pull.daily", avatar: "/brand/comp/a1.jpg" },
  { handle: "@trendy.slice", avatar: "/brand/comp/a2.jpg" },
  { handle: "@rival.pizza", avatar: "/brand/comp/a3.jpg" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ig?: string; fb?: string; yt?: string; tt?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { ig, fb, yt, tt } = await searchParams;

  // YouTube channel connection (tokens never leave the server).
  let ytConn: {
    title: string | null;
    handle: string | null;
    subscribers: number | null;
    avatar_url: string | null;
    scopes?: string[] | null;
  } | null = null;
  try {
    const { data, error } = await supabase
      .from("youtube_connections")
      .select("title, handle, subscribers, avatar_url, scopes")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error) ytConn = data;
    else {
      // scopes column may not exist yet: read the card's fields without it
      const { data: legacy } = await supabase
        .from("youtube_connections")
        .select("title, handle, subscribers, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      ytConn = legacy;
    }
  } catch {
    // table may not exist yet — the card shows the disconnected state
  }
  // Channels connected before the upload scope existed carry only read scopes;
  // the card asks for a reconnect instead of pretending uploads work.
  const ytCanUpload = Array.isArray(ytConn?.scopes) && ytConn!.scopes!.some((s) => YT_WRITE_SCOPES.includes(s));

  // TikTok connection (tokens never leave the server).
  let ttConn: {
    display_name: string | null;
    username: string | null;
    follower_count: number | null;
    avatar_url: string | null;
    scopes?: string[] | null;
  } | null = null;
  try {
    const { data } = await supabase
      .from("tiktok_connections")
      .select("display_name, username, follower_count, avatar_url, scopes")
      .eq("user_id", user.id)
      .maybeSingle();
    ttConn = data;
  } catch {
    // table may not exist yet — the card shows the disconnected state
  }
  const ttDirect = Array.isArray(ttConn?.scopes) && ttConn!.scopes!.includes("video.publish");

  // Facebook connection state (tokens never leave the server).
  let fbConn: {
    page_name: string | null;
    username: string | null;
    followers_count: number | null;
    picture_url: string | null;
    connection_status: string | null;
    last_synced_at: string | null;
    pending_pages: unknown; media?: unknown;
  } | null = null;
  try {
    const { data } = await supabase
      .from("facebook_connections")
      .select("page_name, username, followers_count, picture_url, connection_status, last_synced_at, pending_pages, media")
      .eq("user_id", user.id)
      .maybeSingle();
    fbConn = data;
  } catch {
    // table may not exist yet — the card shows the disconnected state
  }
  type PendingPage = {
    id: string; name?: string; followers_count?: number; fan_count?: number;
    picture?: { data?: { url?: string } };
  };
  const fbPages: FbPageOption[] = Array.isArray(fbConn?.pending_pages)
    ? (fbConn!.pending_pages as PendingPage[]).map((p) => ({
        id: p.id,
        name: p.name ?? "Untitled Page",
        followers: p.followers_count ?? p.fan_count ?? null,
        picture: p.picture?.data?.url ?? null,
      }))
    : [];

  // Live account snapshot (avatar, followers, sync state) — best-effort.
  const snap = await getIgSnapshot(supabase, user.id).catch(() => null);

  // Plan, meters and what occupies the plan's slots. Counts that cannot be
  // read stay unknown (never 0); the over-limit state is computed from the
  // same lists the meters render, so the two never disagree.
  const ent = await getEntitlements(supabase, user.id);
  const [usage, accountsResult, competitorCount] = await Promise.all([
    getUsage(supabase, ent),
    listConnectedAccountsDetailed(supabase, user.id),
    countActiveCompetitors(supabase, user.id),
  ]);
  const accountsList = accountsResult.accounts;
  // A platform table that could not be read makes the count unknown (not a lower bound shown as truth).
  const activeCount = accountsResult.complete ? activeAccounts(accountsList).length : null;
  const overLimits = computeOverLimits(ent, accountsResult.complete ? activeByPlatform(accountsList) : null, competitorCount);

  // Brand Workspaces (only once the migration has run; before that the section is hidden).
  const wsEnabled = await workspacesEnabled(supabase);
  let workspaceRows: WorkspaceRow[] = [];
  let workspaceUsed = 0;
  if (wsEnabled) {
    const [wsList, wsActive] = await Promise.all([
      listWorkspaces(supabase, user.id),
      getActiveWorkspace(supabase, user.id),
    ]);
    workspaceRows = wsList.map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault, suspended: w.suspended, active: wsActive?.id === w.id }));
    workspaceUsed = activeWorkspaces(wsList).length;
  }
  const workspaceLimit = getLimit(ent, "workspaces");
  const keepCompetitors = overLimits.competitors ? await listTrackedCompetitors(supabase, user.id) : null;
  const accountLimitHit = ig === "limit" || fb === "limit" || yt === "limit" || tt === "limit";
  // Accounts paused by a downgrade still have rows (the cards below read those
  // rows directly), so tell each card when its platform is paused.
  const pausedOn = (platform: "instagram" | "facebook" | "youtube" | "tiktok") =>
    accountsList.some((a) => a.platform === platform && a.suspended) &&
    !accountsList.some((a) => a.platform === platform && !a.suspended);

  // Intelligence state from the real detection pipeline.
  let intel: IntelState = {
    niche: null,
    subNiche: null,
    confidence: null,
    audience: null,
    signals: [],
    postsAnalyzed: snap ? snap.media.length : null,
    analyzedAgo: null,
    trendsAgo: null,
    location: null,
    connected: Boolean(snap),
  };
  let brandDetail: BrandDetail | null = null;
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("niche, niche_detail, niche_analyzed_at, brand_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    const d = (prof?.niche_detail ?? null) as {
      sub_niche?: string;
      confidence?: number;
      audience?: string;
      signals?: string[];
    } | null;
    brandDetail = (prof?.brand_detail ?? null) as BrandDetail | null;
    intel = {
      ...intel,
      niche: prof?.niche ?? null,
      subNiche: d?.sub_niche ?? null,
      confidence: d?.confidence ?? null,
      audience: d?.audience ?? null,
      signals: (d?.signals ?? []).slice(0, 5),
      analyzedAgo: prof?.niche_analyzed_at ? ago(prof.niche_analyzed_at) : null,
      location: brandDetail?.location ?? null,
    };
  } catch {
    // columns may be mid-migration; intelligence section degrades gracefully
  }
  if (intel.niche) {
    try {
      const { data: cached } = await supabase
        .from("niche_trends")
        .select("updated_at")
        .eq("niche", `${user.id}:${intel.niche}`)
        .maybeSingle();
      if (cached?.updated_at) intel.trendsAgo = ago(cached.updated_at);
    } catch {
      // cache table may not have updated_at — analyzedAgo still shows
    }
  }
  if (!intel.trendsAgo) intel.trendsAgo = intel.analyzedAgo;

  const syncedRecently = Boolean(
    snap?.last_synced_at && Date.now() - new Date(snap.last_synced_at).getTime() < 12 * 3600_000
  );

  return (
    <AppShell active="settings" userEmail={user.email}>
      <div className="st2 st3">
        <PageHeader title="Settings" sub="Manage your brand, connections, intelligence, and plan." />

        <div className="st3-layout">
          <SettingsNav />

          <div className="st3-main">
            {/* 1 — Profile & Brand */}
            <section className="st2-card" id="brand">
              <div className="st2-card-head">
                <span className="st2-card-ico"><UserRound size={15} /></span>
                <h3>Profile &amp; Brand</h3>
                <span className="st2-card-note">Powers every recommendation the AI makes</span>
              </div>
              <BrandSettings email={user.email ?? ""} />
            </section>

            {/* 1b — Brand Workspaces */}
            {wsEnabled && (
              <section className="st2-card" id="workspaces">
                <div className="st2-card-head">
                  <span className="st2-card-ico"><Briefcase size={15} /></span>
                  <h3>Brand Workspaces</h3>
                  <span className="st2-card-note">One brand, one workspace, one account per platform</span>
                </div>
                <WorkspacesManager workspaces={workspaceRows} limit={workspaceLimit} used={workspaceUsed} planName={ent.config.name} />
              </section>
            )}

            {/* 2 — Connected Accounts */}
            <section className="st2-card" id="accounts">
              <div className="st2-card-head">
                <span className="st2-card-ico"><Share2 size={15} /></span>
                <h3>Connected accounts</h3>
                <span className="st2-card-note">SOCIA runs on your live account data</span>
              </div>
              {accountLimitHit && (
                <PlanNotice
                  error={limitError(ent.plan, "workspaces", getLimit(ent, "workspaces"), activeCount == null ? null : workspacesInUse(accountsList))}
                />
              )}
              {snap && (
                <p className={`st3-health${syncedRecently ? "" : " warn"}`}>
                  {syncedRecently ? (
                    <><CheckCircle2 size={13} /> Account health: all systems synced</>
                  ) : (
                    <><AlertTriangle size={13} /> Data is getting stale — hit Sync now</>
                  )}
                </p>
              )}
              <InstagramConnect
                username={snap?.username ?? null}
                status={ig}
                syncedAt={snap?.last_synced_at ?? null}
                followers={snap?.followers_count ?? null}
                avatar={snap?.profile_picture_url ?? null}
                needsReconnect={snap?.insights_ok === false}
                paused={!snap && pausedOn("instagram")}
              />
              <div className="st2-divider"><span>Facebook</span></div>
              <FacebookConnect
                status={fb}
                connectionStatus={fbConn?.connection_status ?? null}
                pageName={fbConn?.page_name ?? null}
                username={fbConn?.username ?? null}
                followers={fbConn?.followers_count ?? null}
                picture={fbConn?.picture_url ?? null}
                syncedAt={fbConn?.last_synced_at ?? null}
                pendingPages={fbPages}
                posts={Array.isArray(fbConn?.media) ? (fbConn!.media as FbPost[]).slice(0, 5) : []}
                paused={pausedOn("facebook")}
              />
              <div className="st2-divider"><span>YouTube</span></div>
              <YouTubeConnect
                status={yt}
                configured={ytAuthConfigured()}
                channelTitle={ytConn?.title ?? null}
                handle={ytConn?.handle ?? null}
                subscribers={ytConn?.subscribers ?? null}
                avatar={ytConn?.avatar_url ?? null}
                paused={pausedOn("youtube")}
                canUpload={ytCanUpload}
              />
              <div className="st2-divider"><span>TikTok</span></div>
              <TikTokConnect
                status={tt}
                configured={ttAuthConfigured()}
                displayName={ttConn?.display_name ?? null}
                username={ttConn?.username ?? null}
                followers={ttConn?.follower_count ?? null}
                avatar={ttConn?.avatar_url ?? null}
                paused={pausedOn("tiktok")}
                canPublishDirect={ttDirect}
              />
              <div className="st2-divider"><span>Other platforms</span></div>
              <ConnectionsManager />
            </section>

            {/* 3 — SOCIA Intelligence */}
            <section className="st2-card st3-intel" id="intel">
              <div className="st2-card-head">
                <span className="st2-card-ico purple"><Sparkle size={15} /></span>
                <h3>SOCIA Intelligence</h3>
                <span className="st2-card-note">What SOCIA has learned from your real content</span>
              </div>
              <IntelligenceCard intel={intel} />
            </section>

            {/* 4 — Competitors & Market */}
            <section className="st2-card" id="market">
              <div className="st2-card-head">
                <span className="st2-card-ico"><Radar size={15} /></span>
                <h3>Competitors &amp; Market</h3>
                <span className="st2-card-note">Preview</span>
              </div>
              <div className="st3-market">
                <div>
                  <small className="st3-sub">Your market</small>
                  {intel.location ? (
                    <p className="st3-market-loc">{intel.location}</p>
                  ) : (
                    <p className="st3-market-loc muted">
                      Set your location in Profile &amp; Brand and SOCIA sharpens local angles.
                    </p>
                  )}
                </div>
                <div>
                  <small className="st3-sub">Tracked competitors <em className="st3-chip">Preview</em></small>
                  <div className="st3-comp-row">
                    {PREVIEW_COMPETITORS.map((c) => (
                      <span className="st3-comp" key={c.handle}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.avatar} alt="" width={22} height={22} /> {c.handle}
                      </span>
                    ))}
                  </div>
                  <Link href="/competitors" className="cp3-viewmore">
                    Manage competitors <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </section>

            {/* 5 — AI Strategist */}
            <section className="st2-card" id="strategist">
              <div className="st2-card-head">
                <span className="st2-card-ico"><Sparkles size={15} /></span>
                <h3>AI Strategist</h3>
                <span className="st2-card-note">Written into every plan and conversation</span>
              </div>
              <StrategistSettings />
            </section>

            {/* 6 — Notifications & Reports (planned; no fake toggles) */}
            <section className="st2-card" id="appearance">
              <div className="st2-card-head">
                <span className="st2-card-ico"><SunMoon size={15} /></span>
                <h3>Appearance</h3>
                <span className="st2-card-note">Choose how SOCIA looks on this device.</span>
              </div>
              <AppearanceSettings />
            </section>

            <section className="st2-card" id="notifications">
              <div className="st2-card-head">
                <span className="st2-card-ico"><Bell size={15} /></span>
                <h3>Notifications &amp; Reports</h3>
                <span className="st2-card-note">Planned — nothing to configure yet</span>
              </div>
              <ul className="st3-planned">
                {[
                  "A post of yours starts outperforming",
                  "A competitor has a breakout post",
                  "A new niche trend is detected",
                  "Engagement drops significantly",
                  "Weekly intelligence report",
                ].map((t) => (
                  <li key={t}>
                    {t} <em className="st3-chip">Planned</em>
                  </li>
                ))}
              </ul>
            </section>

            {/* 7 — Plan & Billing */}
            <section className="st2-card" id="plan">
              <div className="st2-card-head">
                <span className="st2-card-ico"><CreditCard size={15} /></span>
                <h3>Plan &amp; billing</h3>
                <span className="st2-card-note">Your plan and usage this period</span>
              </div>
              <PlanBilling
                ent={ent}
                usage={usage}
                accounts={accountsList}
                activeCount={activeCount}
                competitorCount={competitorCount}
                competitors={keepCompetitors}
                overLimits={overLimits}
              />
            </section>

            {/* Security & session */}
            <section className="st2-card" id="security">
              <div className="st2-card-head">
                <span className="st2-card-ico"><Lock size={15} /></span>
                <h3>Security &amp; privacy</h3>
                <span className="st2-card-note">Signed in as {user.email}</span>
              </div>
              <SecurityCard />
              <p className="st2-legal-links">
                <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link>
              </p>
              <div className="st2-divider"><span>Session</span></div>
              <div className="st2-session">
                <p>Sign out on this device only.</p>
                <form action="/auth/signout" method="post">
                  <button className="st2-logout" type="submit">
                    <LogOut size={14} /> Log out
                  </button>
                </form>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
