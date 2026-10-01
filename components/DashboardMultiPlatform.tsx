// The Dashboard for someone who has connected a platform OTHER than Instagram
// (or alongside it, before Instagram data is live). Instead of the old
// Instagram-only connect wall, they get a real home: their platform snapshot,
// what's scheduled, and a gentle nudge to add Instagram for the deepest view.
// Server component — no interactivity needed.

import Link from "next/link";
import { Link2, CalendarDays, Film, ArrowRight, Plus } from "lucide-react";
import PlatformSnapshot from "./PlatformSnapshot";
import { igConfigured } from "@/lib/instagram";
import type { PlatformSummary } from "@/lib/metrics/allPlatforms";
import type { Upcoming } from "@/lib/overview";

const STATUS: Record<Upcoming["status"], { label: string; tone: string }> = {
  scheduled: { label: "Scheduled", tone: "success" },
  draft: { label: "Draft", tone: "info" },
  publishing: { label: "Publishing", tone: "primary" },
  failed: { label: "Needs review", tone: "warning" },
  published: { label: "Published", tone: "success" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export default function DashboardMultiPlatform({
  greeting,
  name,
  summaries,
  upcoming,
}: {
  greeting: string;
  name: string;
  summaries: PlatformSummary[];
  upcoming: Upcoming[];
}) {
  const igHref = igConfigured() ? "/api/auth/instagram/start" : "/settings";
  return (
    <div className="dv">
      <header className="dv-head">
        <div>
          <h1>{greeting}, {name} <span aria-hidden>👋</span></h1>
          <p>Here&apos;s what&apos;s happening across your connected platforms.</p>
        </div>
        <div className="dv-head-actions">
          <Link href="/tool" className="ov-btn primary"><ArrowRight size={14} /> Generate Content</Link>
        </div>
      </header>

      <PlatformSnapshot summaries={summaries} title="Your social presence" sub="every connected platform, with its own metrics" />

      <section className="ov-card" aria-labelledby="dmp-up-h" style={{ marginTop: 14 }}>
        <div className="ov-card-head">
          <h2 id="dmp-up-h"><span className="ov-h-ico info"><CalendarDays size={14} /></span> Upcoming content</h2>
          <Link href="/calendar" className="ov-link">View calendar <ArrowRight size={13} /></Link>
        </div>
        {upcoming.length ? (
          <ul className="dv-upcoming">
            {upcoming.map((u) => {
              const s = STATUS[u.status];
              const when = new Date(u.at);
              return (
                <li key={u.id}>
                  <Link href="/calendar" className="dv-up-row">
                    <span className="dv-up-when"><b>{when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</b><small>{when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small></span>
                    {u.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.thumb} alt="" width={40} height={40} />
                    ) : <span className="dv-up-ph"><Film size={14} /></span>}
                    <span className="dv-up-body"><b>{u.title}</b><small>{u.format}</small></span>
                    <span className={`ov-chip ${s.tone}`}>{s.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="ov-empty">
            <b>Nothing scheduled</b>
            <p>Add a post and SOCIA publishes it at your audience&apos;s hour.</p>
            <Link href="/calendar?compose=1" className="ov-btn ghost small"><Plus size={13} /> Add content</Link>
          </div>
        )}
      </section>

      <div className="db-connect" style={{ marginTop: 14 }}>
        <span className="db-connect-ico"><Link2 size={22} /></span>
        <div className="db-connect-copy">
          <h2>Connect Instagram for the full dashboard</h2>
          <p>Instagram unlocks SOCIA&apos;s deepest view — daily reach and views, audience demographics, posting-time analysis and content insights. Your other platforms stay exactly as they are.</p>
        </div>
        <a href={igHref} className="db-connect-cta">Connect Instagram</a>
      </div>
    </div>
  );
}
