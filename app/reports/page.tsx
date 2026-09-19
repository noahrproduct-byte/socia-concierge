import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, FileText, ShieldCheck, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { getIgSnapshot, readDailySnapshots } from "@/lib/instagramSync";
import {
  getFollowers,
  getFollowersGained,
  getReach,
  getPostsPublished,
  getEngagementRate,
  getPerformanceBaseline,
  getTopPosts,
  type AccountInput,
  type DailySnapshot,
  type Metric,
} from "@/lib/dashboardMetrics";
import { engagementOf } from "@/lib/metrics";

export const metadata = { title: "Reports | SOCIA" };

function Row({ label, m, format }: { label: string; m: Metric; format?: (v: number) => string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">
        {m.value != null ? (format ? format(m.value) : m.value.toLocaleString("en-US")) : "—"}
      </td>
      <td className="muted">{m.value != null ? m.period : "unavailable"}</td>
      <td className="muted">
        <span className={`rep-status ${m.status.toLowerCase()}`}>{m.status}</span>
      </td>
      <td className="muted rep-method" title={`${m.source}: ${m.method}`}>
        {m.method}
      </td>
    </tr>
  );
}

// A period report built from the same central metrics the dashboard uses,
// with each row's provenance shown. Nothing here is generated prose.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { range } = await searchParams;
  const days = range === "7" ? 7 : range === "90" ? 90 : 30;

  const snap = await getIgSnapshot(supabase, user.id).catch(() => null);
  let daily: DailySnapshot[] = [];
  try {
    daily = await readDailySnapshots<DailySnapshot>(
      supabase,
      user.id,
      snap?.ig_user_id ?? null,
      "day, followers, reach, views, followers_gained, source",
    );
  } catch {
    /* report still renders with what exists */
  }

  const acct: AccountInput = {
    followers: snap?.followers_count ?? null,
    lifetimePosts: snap?.media_count ?? null,
    posts: snap?.media ?? [],
    daily,
    syncedAt: snap?.last_synced_at ?? null,
    platform: "instagram",
    handle: snap?.username ?? null,
  };

  const since = new Date(Date.now() - days * 86400000);
  const periodLabel = `${since.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  // Only posts published inside the selected range compete for "this period".
  const top = getTopPosts(acct, 3, days);
  const fmtK = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(v));

  return (
    <AppShell active="reports" userEmail={user.email}>
      <PageHeader
        title="Reports"
        sub={<>Period summary for {snap?.username ? `@${snap.username}` : "your account"} · {periodLabel}</>}
        actions={
          <>
            <div className="ov-seg" role="group" aria-label="Date range">
              {[
                { id: "7", label: "7D" },
                { id: "30", label: "30D" },
                { id: "90", label: "90D" },
              ].map((r) => (
                <Link key={r.id} href={`/reports?range=${r.id}`} className={String(days) === r.id ? "on" : ""}>
                  {r.label}
                </Link>
              ))}
            </div>
            <a className="ov-btn ghost" href="/api/export" title="Downloads your profile, plans and conversations, not this report">
              <Download size={14} /> Export account data (JSON)
            </a>
          </>
        }
      />

      {!snap && (
        <section className="dsh-panel">
          <div className="dsh-nodata">
            <b>No account connected</b>
            <p>
              This report is built from your own Instagram numbers, so every row below is unavailable until an account is connected.{" "}
              <Link href="/settings#accounts" className="dsh-link">
                Connect Instagram <ArrowRight size={12} />
              </Link>
            </p>
          </div>
        </section>
      )}

      <section className="dsh-panel dsh-tablewrap">
        <div className="dsh-panel-head">
          <h2>
            <FileText size={14} />
            Metric report
          </h2>
          <span className="lib-totals">Every row shows how the value was produced</span>
        </div>
        <div className="dsh-tablescroll">
          <table className="dsh-table rep-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="num">Value</th>
                <th>Period</th>
                <th>Status</th>
                <th>How it was calculated</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Followers" m={getFollowers(acct)} />
              <Row label="New followers" m={getFollowersGained(acct, days)} />
              <Row label="Accounts reached" m={getReach(acct, days)} format={fmtK} />
              <Row label="Posts published" m={getPostsPublished(acct, days)} />
              <Row
                label="Engagement rate"
                m={getEngagementRate(acct)}
                format={(v) => v.toFixed(2) + "%"}
              />
              <Row label="Performance baseline" m={getPerformanceBaseline(acct)} />
            </tbody>
          </table>
        </div>
      </section>

      <section className="dsh-panel dsh-tablewrap">
        <div className="dsh-panel-head">
          <h2>Top posts this period</h2>
          <Link href="/analytics#posts" className="dsh-link">
            All content <ArrowRight size={12} />
          </Link>
        </div>
        {top.rows.length ? (
          <ol className="dsh-top">
            {top.rows.map(({ post, engagement, multiplier }, i) => (
              <li key={post.id ?? i}>
                <span className="dsh-top-rank">{String(i + 1).padStart(2, "0")}</span>
                {post.thumbnail_url || post.media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="dsh-top-thumb" src={post.thumbnail_url || post.media_url!} alt="" width={44} height={44} />
                ) : (
                  <span className="dsh-top-thumb ph" aria-hidden />
                )}
                <span className="dsh-top-meta">
                  <b>{(post.caption || "").split("\n")[0].slice(0, 40) || "(no caption)"}</b>
                  <small>
                    {post.timestamp
                      ? new Date(post.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : ""}
                    {" · "}
                    {engagementOf(post).toLocaleString("en-US")} engagements
                  </small>
                </span>
                <span className="dsh-top-nums">
                  <span className="dsh-top-stat">
                    <b>{engagement.toLocaleString("en-US")}</b>
                    <small>Engagements</small>
                  </span>
                  {multiplier != null && (
                    <em className={multiplier >= 1 ? "up" : "down"}>
                      {multiplier >= 1 ? "↑" : "↓"} {multiplier.toFixed(1)}×<small>vs baseline</small>
                    </em>
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : !snap ? (
          <p className="dsh-empty">
            No account connected. <Link href="/settings#accounts">Connect Instagram</Link> to see your top posts here.
          </p>
        ) : !acct.posts.length ? (
          <p className="dsh-empty">No posts synced yet.</p>
        ) : (
          <p className="dsh-empty">No posts published in the last {days} days.</p>
        )}
      </section>

      <p className="dsh-trust">
        <ShieldCheck size={13} /> Report values come from the same calculations the dashboard uses.
        Anything Instagram doesn&apos;t provide is shown as &quot;—&quot;, never as zero.
      </p>
    </AppShell>
  );
}
