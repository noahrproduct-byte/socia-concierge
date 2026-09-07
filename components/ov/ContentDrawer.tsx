"use client";

// Content detail: the post, every metric Instagram returned for it, and why it
// worked, split into observed data, SOCIA's interpretation and a recommendation.

import Link from "next/link";
import { ExternalLink, Sparkles, CalendarPlus, Play } from "lucide-react";
import Drawer from "./Drawer";
import { fmtNum, type PostCard } from "@/lib/overview";
import { askSocia } from "@/lib/ask";

const IG = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

function why(p: PostCard, baseline: number | null, medianViews: number | null) {
  const observed: string[] = [];
  observed.push(`${p.engagements.toLocaleString("en-US")} engagements (${p.likes ?? 0} likes, ${p.comments ?? 0} comments)`);
  if (p.views != null) observed.push(`${p.views.toLocaleString("en-US")} views${medianViews ? ` vs. a median of ${fmtNum(medianViews)}` : ""}`);
  if (p.reach != null) observed.push(`${p.reach.toLocaleString("en-US")} accounts reached`);
  if (p.saves != null) observed.push(`${p.saves.toLocaleString("en-US")} saves`);
  if (p.shares != null) observed.push(`${p.shares.toLocaleString("en-US")} shares`);
  if (p.multiplier != null && baseline) observed.push(`${p.multiplier.toFixed(1)}× your median post (${Math.round(baseline)} engagements)`);
  const strong = p.multiplier != null && p.multiplier >= 1.5;
  const weak = p.multiplier != null && p.multiplier < 0.7;
  const viewsButLowEng = p.views != null && p.reach != null && p.reach > 0 && p.engagements / p.reach < 0.01;
  const interpretation = strong
    ? `${p.format === "Reel" ? "The Reel format plus this opening" : "This post's opening"} pulled well beyond your followers; when a post runs this far above your median it's usually the first seconds and the subject, not luck.`
    : weak
      ? "Below your own median. Posts like this typically open without a clear hook or repeat a subject the audience has already seen from you."
      : "Around your median: solid, not a breakout. Useful as a control when you test a bolder version.";
  const recommendation = strong
    ? `Make a second post with the same format and hook structure as "${p.title.slice(0, 40)}" and compare it against the ${baseline ? Math.round(baseline) : "median"} baseline.`
    : viewsButLowEng
      ? "Reach is there but people aren't reacting; add a question or a clear ask in the first line next time."
      : "Re-shoot the strongest idea in this post with a spoken or on-screen hook in the first two seconds.";
  return { observed, interpretation, recommendation };
}

export default function ContentDrawer({ post, baseline, medianViews, onClose }: { post: PostCard | null; baseline: number | null; medianViews: number | null; onClose: () => void }) {
  const p = post;
  const w = p ? why(p, baseline, medianViews) : null;
  return (
    <Drawer open={Boolean(p)} title="Content detail" onClose={onClose}>
      {p && w && (
        <>
          <div className="ov-detail-media">
            {p.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumb} alt="" />
            ) : (
              <span className="ov-card-ph" aria-hidden />
            )}
            {p.isVideo && <span className="ov-card-play big" aria-hidden><Play size={16} fill="currentColor" /></span>}
          </div>
          <div className="ov-detail-meta">
            <span className="ov-detail-plat">{IG} Instagram {p.format}</span>
            <span>{new Date(p.published).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
          <p className="ov-detail-caption">{p.caption || "(no caption)"}</p>
          <dl className="ov-detail-stats">
            {[
              ["Views", p.views], ["Reach", p.reach], ["Likes", p.likes], ["Comments", p.comments], ["Saves", p.saves], ["Shares", p.shares],
            ].map(([k, v]) => (
              <div key={k as string}><dt>{k}</dt><dd>{v == null ? "—" : fmtNum(v as number)}</dd></div>
            ))}
            <div><dt>Engagement</dt><dd>{fmtNum(p.engagements)}</dd></div>
            <div><dt>vs. baseline</dt><dd className={p.multiplier != null ? (p.multiplier >= 1 ? "up" : "down") : ""}>{p.multiplier != null ? `${p.multiplier.toFixed(1)}×` : "—"}</dd></div>
          </dl>
          <section className="ov-why">
            <h3>Why this worked</h3>
            <div className="ov-why-block"><small>Observed data</small><ul>{w.observed.map((o) => <li key={o}>{o}</li>)}</ul></div>
            <div className="ov-why-block ai"><small>AI interpretation</small><p>{w.interpretation}</p></div>
            <div className="ov-why-block rec"><small>Recommendation</small><p>{w.recommendation}</p></div>
          </section>
          <div className="ov-detail-actions">
            <button type="button" className="ov-btn primary" onClick={() => askSocia({ context: { page: "content", postId: p.id }, contextLabel: `Post: ${p.title.slice(0, 40)}` })}><Sparkles size={13} /> Ask SOCIA about this post</button>
            {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="ov-btn ghost"><ExternalLink size={13} /> View original</a>}
            <Link href={`/calendar?compose=1&caption=${encodeURIComponent(p.title)}`} className="ov-btn ghost"><CalendarPlus size={13} /> Create variation</Link>
            <Link href={`/tool?note=${encodeURIComponent(`Build on "${p.title.slice(0, 60)}" (${p.multiplier != null ? `${p.multiplier.toFixed(1)}× my median` : `${p.engagements} engagements`}).`)}`} className="ov-btn ghost"><Sparkles size={13} /> Add idea to Content Plan</Link>
          </div>
        </>
      )}
    </Drawer>
  );
}
