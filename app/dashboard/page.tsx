import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Activity,
  Eye,
  FileText,
  Sparkles,
  TrendingUp,
  Clock,
  Target,
  Zap,
  Flame,
  ArrowRight,
  Link2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import AppShell from "@/components/AppShell";
import { MetricCard, PlatformBadge } from "@/components/ui";
import PerformanceChart from "@/components/PerformanceChart";
import DateRangeSelector from "@/components/DateRangeSelector";
import AccountSwitcher from "@/components/AccountSwitcher";
import ContentScoreCard from "@/components/ContentScoreCard";
import {
  KPIS,
  AI_BRIEF,
  ACTIONS,
  TOP_CONTENT,
  COMPETITOR_INTEL,
  UPCOMING,
} from "@/lib/demoData";

export const metadata = { title: "Dashboard — SOCIA" };

const KPI_ICON: Record<string, React.ReactNode> = {
  followers: <Users size={16} />,
  engagement: <Activity size={16} />,
  reach: <Eye size={16} />,
  posts: <FileText size={16} />,
};
const INSIGHT_ICON: Record<string, React.ReactNode> = {
  trend: <TrendingUp size={15} />,
  clock: <Clock size={15} />,
  target: <Target size={15} />,
};
const ACTION_ICON: Record<string, React.ReactNode> = {
  impact: <TrendingUp size={17} />,
  opportunity: <Zap size={17} />,
  consistency: <Clock size={17} />,
};
const INTEL_ICON: Record<string, React.ReactNode> = {
  activity: <Activity size={15} />,
  flame: <Flame size={15} />,
  trend: <TrendingUp size={15} />,
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const raw = (user.email?.split("@")[0] ?? "there").replace(/[._-]+/g, " ");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);

  const profile = await getProfile(supabase, user.id);
  const connected = profile?.account_connected ?? false;

  // No social account connected yet → show a real connect/empty state,
  // not fabricated analytics.
  if (!connected) {
    return (
      <AppShell active="dashboard" userEmail={user.email}>
        <div className="dash-header">
          <div>
            <h1 className="dash-greeting">
              {greeting}, {name} <span aria-hidden>👋</span>
            </h1>
            <p className="dash-context">Let&apos;s get your account set up.</p>
          </div>
        </div>

        <div className="connect-card">
          <span className="connect-ico"><Link2 size={26} /></span>
          <h2>Connect a social account</h2>
          <p>
            SOCIA analyzes your posts to build your dashboard, audits, and weekly plan.
            Connect Instagram or TikTok to see your real numbers here.
          </p>
          <div className="connect-actions">
            <Link href="/settings" className="btn-primary">Connect account</Link>
            {!profile?.niche && (
              <Link href="/onboarding" className="btn-secondary">Set your niche</Link>
            )}
          </div>
          <span className="connect-note">
            No account connected yet — your analytics will appear here once you connect one.
          </span>
        </div>

        <div className="kpi-row">
          {["Total Followers", "Engagement Rate", "Reach / week", "Posts Published"].map((l) => (
            <div className="metric muted" key={l}>
              <div className="metric-head"><span className="metric-label">{l}</span></div>
              <div className="metric-value">—</div>
              <div className="metric-foot"><span className="metric-compare">No data yet</span></div>
            </div>
          ))}
        </div>

        {profile?.niche && (
          <div className="panel-grid">
            <Link href="/niche" className="hub-card">
              <span className="hub-glyph">🔥</span>
              <h3>What&apos;s working in {profile.niche}</h3>
              <p>See the videos and formats performing best in your niche right now.</p>
              <span className="hub-link">Explore your niche →</span>
            </Link>
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell active="dashboard" userEmail={user.email}>
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-greeting">
            {greeting}, {name} <span aria-hidden>👋</span>
          </h1>
          <p className="dash-context">Here&apos;s what&apos;s happening with your content.</p>
        </div>
        <div className="dash-controls">
          <DateRangeSelector />
          <AccountSwitcher />
          <Link href="/chat" className="btn-primary">
            <Sparkles size={15} /> Ask AI Strategist
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        {KPIS.map((k) => (
          <MetricCard key={k.key} kpi={k} icon={KPI_ICON[k.key]} />
        ))}
      </div>

      {/* Content Score (brand signature) */}
      <ContentScoreCard />

      {/* AI Strategy Brief + Recommended Actions */}
      <div className="dash-2col brief">
        <section className="card ai-brief">
          <div className="ai-brief-badge">
            <Sparkles size={14} /> AI Strategy Brief
          </div>
          <h2 className="ai-brief-head">
            {AI_BRIEF.lead} <span className="accent-text">{AI_BRIEF.highlight}</span> {AI_BRIEF.tail}
          </h2>
          <p className="ai-brief-body">{AI_BRIEF.body}</p>
          <div className="ai-brief-insights">
            {AI_BRIEF.insights.map((ins, i) => (
              <div className="ai-insight" key={i}>
                <span className="ai-insight-ico">{INSIGHT_ICON[ins.icon]}</span>
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
          <div className="ai-brief-actions">
            <Link href="/chat" className="btn-primary">
              <Sparkles size={15} /> Ask AI Strategist
            </Link>
            <Link href="/analytics" className="btn-secondary">
              View full strategy
            </Link>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Recommended Actions</h3>
            <Link href="/analytics" className="link-mini">
              View all
            </Link>
          </div>
          <div className="actions">
            {ACTIONS.map((a, i) => (
              <div className="action" key={i}>
                <span className={`action-ico ${a.tone}`}>{ACTION_ICON[a.tone]}</span>
                <div className="action-body">
                  <span className={`action-tag ${a.tone}`}>{a.tag}</span>
                  <b>{a.title}</b>
                  <small>{a.body}</small>
                </div>
                <Link href={a.href} className="action-cta" aria-label={a.cta}>
                  <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Performance + Top Content */}
      <div className="dash-2col perf-row">
        <section className="card">
          <div className="card-head">
            <h3>Performance Over Time</h3>
          </div>
          <PerformanceChart />
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Top Performing Content</h3>
            <Link href="/analytics" className="link-mini">
              View all
            </Link>
          </div>
          <div className="content-list">
            {TOP_CONTENT.map((c, i) => (
              <div className="content-row" key={i}>
                <span className="content-thumb" aria-hidden>
                  {i + 1}
                </span>
                <div className="content-meta">
                  <b>{c.title}</b>
                  <small>
                    {c.date} · {c.format} <PlatformBadge platform={c.platform} />
                  </small>
                </div>
                <div className="content-stats">
                  <span>
                    <b>{c.reach}</b>
                    <small>Reach</small>
                  </span>
                  <span>
                    <b>{c.eng}</b>
                    <small>Eng.</small>
                  </span>
                  <span className="content-mult">▲ {c.mult}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Competitor Intelligence + Upcoming */}
      <div className="dash-2col">
        <section className="card">
          <div className="card-head">
            <h3>Competitor Intelligence</h3>
            <Link href="/competitors" className="link-mini">
              View all
            </Link>
          </div>
          <div className="intel-list">
            {COMPETITOR_INTEL.map((it, i) => (
              <div className="intel-row" key={i}>
                <span className="intel-ico">{INTEL_ICON[it.icon]}</span>
                <span>{it.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Upcoming Content</h3>
            <Link href="/calendar" className="link-mini">
              View calendar
            </Link>
          </div>
          <div className="upcoming-list">
            {UPCOMING.map((u, i) => (
              <div className="upcoming-row" key={i}>
                <PlatformBadge platform={u.platform} />
                <div className="upcoming-meta">
                  <b>{u.title}</b>
                  <small>
                    {u.date} · {u.time}
                  </small>
                </div>
                <span className="upcoming-status">{u.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
