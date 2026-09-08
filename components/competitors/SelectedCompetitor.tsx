"use client";

// The selected competitor: who they are, the four-metric comparison, and at
// most three evidence-backed reasons they are ahead.

import Link from "next/link";
import { CalendarDays, Check, ExternalLink, Heart, Info, Link2, Loader2, MapPin, Plus, TrendingUp, Users, Image as ImageIcon, Activity } from "lucide-react";
import type { LeaderRow } from "@/lib/competitorRollup";
import { SOURCE_LABEL } from "@/lib/competitorRollup";
import type { Comparison as Cmp } from "@/lib/similarCompetitor";
import type { CompetitorRow, Reason } from "@/lib/competitorIntel";
import { RangeSelect } from "./Controls";
import { Avatar, PlatformMark, cellText, classLabel, fmtN, platName } from "./shared";

const ICON = { calendar: CalendarDays, reach: TrendingUp, users: Users, heart: Heart } as const;

export function ProfileCard({ r, location, igEnabled, onTrack, tracking, similarity }: {
  r: CompetitorRow; location: string | null; igEnabled: boolean; onTrack: (r: CompetitorRow) => void; tracking: boolean; similarity: number | null;
}) {
  const local = r.location ?? (r.classification === "local_competitor" && location ? location : null);
  const gated = r.platform !== "youtube" && !igEnabled;
  const desc = r.description ? r.description.split("\n")[0].slice(0, 120) : r.reasons.length ? r.reasons.slice(0, 3).join(" · ") : null;
  return (
    <section className="ov-card cx-profile">
      <div className="cx-profile-head">
        <Avatar src={r.avatar} name={r.name} size={64} className="lg" />
        <div className="cx-profile-id">
          <h2 title={r.name}>{r.name}</h2>
          <small><PlatformMark p={r.platform} size={11} /> @{r.handle}</small>
          {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="ov-btn primary small cx-profile-open">View Profile <ExternalLink size={12} /></a>}
        </div>
      </div>
      <div className="cx-profile-row">
        {r.classification && <span className={`cx-chip ${r.classification}`}>{classLabel(r.classification)}</span>}
        {similarity != null && <b className="cx-match-big" title={r.match != null ? "SOCIA relevance: niche, market, comparable audience and verified metrics" : "Estimated from classification and audience size"}>{similarity}% <span>match</span></b>}
      </div>
      {desc && <p className="cx-profile-desc" title={r.description ?? undefined}>{desc}</p>}
      <ul className="cx-profile-meta">
        {local && <li><MapPin size={13} /> {local}{!r.location && <small title="Discovery matched this account to your market">matched</small>}</li>}
        <li><Users size={13} /> {r.audience.state === "ok" ? `${fmtN(r.audience.value)} ${r.platform === "youtube" ? "subscribers" : "followers"}` : <span className="muted">{cellText(r.audience)}</span>}</li>
        <li><ImageIcon size={13} /> {r.postsCount != null ? `${fmtN(r.postsCount)} ${r.platform === "youtube" ? "videos" : "posts"}` : <span className="muted">Post count not published</span>}</li>
        <li><Activity size={13} /> {r.engagement.state === "ok" ? `${r.engagement.value!.toFixed(1)}% engagement rate` : <span className="muted">{cellText(r.engagement)}</span>}</li>
      </ul>
      {gated && (
        <div className="cx-gate">
          <Link2 size={12} /> <span>{platName(r.platform)} shares no numbers for accounts you don&apos;t own{r.platform === "instagram" ? " without a linked Facebook Page" : ""}.</span>
          {r.platform === "instagram" && <Link href="/api/auth/facebook/start">Connect</Link>}
        </div>
      )}
      <div className="cx-profile-actions">
        {r.tracked
          ? <span className="cx-tracked"><Check size={12} /> Tracked</span>
          : <button type="button" className="ov-btn ghost small" onClick={() => onTrack(r)} disabled={tracking}>{tracking ? <Loader2 size={12} className="cx-spin" /> : <Plus size={12} />} Track competitor</button>}
      </div>
    </section>
  );
}

const ROW_LABEL: Record<Cmp["key"], string> = { audience: "Followers", cadence: "Posts per week", medianViews: "Median views", engagement: "Engagement rate" };
// The reference order: size, cadence, reach, then rate.
const ORDER: Cmp["key"][] = ["audience", "cadence", "medianViews", "engagement"];
const fmtC = (c: Cmp, v: number) => (c.unit === "pct" ? `${v.toFixed(1)}%` : c.unit === "perWeek" ? v.toFixed(1) : fmtN(v));

export function Comparison({ r, you, comparisons, days, connected, connectHref }: {
  r: CompetitorRow; you: LeaderRow; comparisons: Cmp[]; days: number; connected: boolean; connectHref: string;
}) {
  return (
    <section className="ov-card cx-compare">
      <div className="ov-card-head">
        <h2>Performance comparison <span className="cx-info" title="You: authenticated Instagram data for the selected range. Competitor: public platform data (YouTube's API, or Instagram Business Discovery through a linked Facebook Page). A dash means one side is not published, so no difference is claimed."><Info size={13} /></span></h2>
        <RangeSelect days={days} />
      </div>
      <table className="cx-table">
        <thead><tr><th>Metric</th><th>You</th><th title={r.name}>{r.name}</th><th>Difference</th></tr></thead>
        <tbody>
          {ORDER.map((k) => comparisons.find((c) => c.key === k)).filter((c): c is Cmp => Boolean(c)).map((c) => {
            const label = ROW_LABEL[c.key];
            const youText = !connected && c.you.state !== "ok" ? null : cellText(c.you, (n) => fmtC(c, n));
            return (
              <tr key={c.key}>
                <td title={c.key === "audience" && r.platform === "youtube" ? "Subscribers on YouTube" : undefined}>{label}</td>
                <td className={c.you.state === "ok" ? "" : "muted"}>{youText ?? <Link href={connectHref} className="ov-link">Connect</Link>}</td>
                <td className={c.them.state === "ok" ? "" : "muted"} title={c.them.source ? `${SOURCE_LABEL[c.them.source]}${c.them.sample ? ` · ${c.them.sample} posts` : ""}` : undefined}>{cellText(c.them, (n) => fmtC(c, n))}</td>
                <td>
                  {c.diffPct == null
                    ? <span className="cx-diff none" title="One side is not published, so no honest difference exists.">—</span>
                    : <span className={`cx-diff ${c.diffPct > 0 ? "up" : "down"}`}>{c.diffPct > 0 ? "↑" : "↓"} {c.diffPct > 0 ? "+" : "−"}{Math.abs(Math.round(c.diffPct)).toLocaleString("en-US")}%</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <small className="cx-foot-note">Green: the competitor is higher on that metric. Your side uses {you.medianViews.state === "ok" ? "Instagram insights" : "your synced posts"} for the last {days} days.</small>
    </section>
  );
}

export function Reasons({ reasons, r, connected, onEvidence }: { reasons: Reason[]; r: CompetitorRow | null; connected: boolean; onEvidence: (x: Reason) => void }) {
  return (
    <section className="ov-card cx-why">
      <div className="ov-card-head"><h2>Why they&apos;re outperforming you</h2></div>
      {reasons.length ? (
        <ul className="cx-why-list">
          {reasons.map((x) => {
            const Icon = ICON[x.icon];
            return (
              <li key={x.key}>
                <span className={`cx-why-ico ${x.icon}`}><Icon size={15} /></span>
                <span className="cx-why-body"><b>{x.title}</b><p>{x.detail}</p></span>
                <button type="button" className="ov-link cx-why-ev" onClick={() => onEvidence(x)}>See evidence →</button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="cx-empty">
          {!r ? <p>Select a competitor to see the evidence.</p>
            : !connected ? <p>Connect your Instagram account to compare your numbers with {r.name}.</p>
            : r.postsGate === "connection_needed" ? <p>No metric is published for both accounts. Link a Facebook Page to read Instagram competitors.</p>
            : r.platform === "facebook" ? <p>Facebook publishes nothing about Pages you don&apos;t manage, so there is nothing to compare honestly.</p>
            : <p>{r.name} does not lead on any metric both accounts publish. Nothing here is guessed.</p>}
        </div>
      )}
    </section>
  );
}
