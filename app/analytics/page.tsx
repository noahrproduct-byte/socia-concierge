import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { igConfigured } from "@/lib/instagram";
import { ytAuthConfigured } from "@/lib/youtubeAuth";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import UniversalAnalytics from "@/components/analytics/UniversalAnalytics";
import { assembleAnalytics } from "@/lib/analytics/assemble";
import { RANGES, rangeDays, clampRangeId } from "@/lib/overview";
import { canUseFeature, getEntitlements, maxHistoryDays } from "@/lib/entitlements";
import type { Platform } from "@/lib/analytics/types";

export const metadata = { title: "Analytics — SOCIA" };

// ONE unified Analytics product. Every connected platform (Instagram, YouTube,
// Facebook, and TikTok once live) feeds the same normalized layer and renders
// through the same shell; there are no separate per-platform analytics pages.
// Opens on All-Accounts by default, or a specific account via ?account=.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; account?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { range: rangeParam, account } = await searchParams;
  const ent = await getEntitlements(supabase, user.id);
  // History is limited per plan here, on the server: a ?range= beyond the
  // plan's window is served as the longest range the plan includes.
  const maxDays = maxHistoryDays(ent);
  const requestedId = RANGES.some((r) => r.id === rangeParam) ? (rangeParam as string) : "30";
  const rangeId = clampRangeId(requestedId, maxDays);
  const days = rangeDays(rangeId);
  const rangeLabel = RANGES.find((r) => r.id === rangeId)?.label ?? "Last 30 days";

  const { accounts } = await assembleAnalytics(supabase, user.id, days);

  if (!accounts.length) {
    const igHref = igConfigured() ? "/api/auth/instagram/start" : "/settings";
    const ytHref = ytAuthConfigured() ? "/api/auth/youtube/start" : "/settings";
    return (
      <AppShell active="analytics" userEmail={user.email}>
        <PageHeader title="Analytics" sub="See what happened, understand why, and find what your strategy is missing." />
        <div className="db-connect">
          <span className="db-connect-ico"><Link2 size={22} /></span>
          <div className="db-connect-copy">
            <h2>Connect an account to see your analytics</h2>
            <p>Analytics fills with your real numbers the moment you connect a platform, and SOCIA starts recording your growth from that moment. Nothing here is estimated.</p>
          </div>
          {/* plain anchors: /api/auth routes must not be Link-prefetched */}
          <span className="db-connect-actions">
            <a href={igHref} className="db-connect-cta">Connect Instagram</a>
            <a href={ytHref} className="db-connect-cta ghost">Connect YouTube</a>
          </span>
        </div>
      </AppShell>
    );
  }

  const initialPlatform: Platform | undefined =
    account && ["instagram", "youtube", "facebook", "tiktok"].includes(account) ? (account as Platform) : undefined;

  return (
    <AppShell active="analytics" userEmail={user.email}>
      <UniversalAnalytics
        accounts={accounts}
        rangeLabel={rangeLabel}
        rangeDays={days}
        maxDays={maxDays}
        canCrossPlatform={canUseFeature(ent, "cross_platform_analytics")}
        initialPlatform={initialPlatform}
      />
    </AppShell>
  );
}
