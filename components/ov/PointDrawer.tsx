"use client";

// One bucket of the performance chart, opened by clicking a bar: the number,
// how it compares with the account's typical value, the posts published in
// it, and, for a breakout, what drove it. Observed data, SOCIA's read and the
// recommendation stay in separate blocks.

import Link from "next/link";
import { ExternalLink, Sparkles, Search, Play } from "lucide-react";
import Drawer from "./Drawer";
import { driverOf } from "./OverviewChart";
import { bucketTitle, fmtNum, type Bucket, type Granularity, type Series, type Baseline, type PostCard } from "@/lib/overview";
import { askSocia } from "@/lib/ask";

const IG = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const WORD: Record<Granularity, string> = { day: "day", week: "week", month: "month", year: "year" };

export default function PointDrawer({ bucket, isOutlier, granularity, series, baseline, posts, onClose, onAnalyze }: {
  bucket: Bucket | null; isOutlier: boolean; granularity: Granularity; series: Series; baseline: Baseline; posts: PostCard[]; onClose: () => void; onAnalyze: (p: PostCard) => void;
}) {
  const b = bucket;
  const byId = Object.fromEntries(posts.map((p) => [p.id, p]));
  const inBucket = b ? b.postIds.map((id) => byId[id]).filter((p): p is PostCard => Boolean(p)) : [];
  const driver = b ? driverOf(b.postIds, byId) : null;
  const unit = series.label.toLowerCase();
  const period = WORD[granularity];
  const value = b?.value ?? null;
  // The median post / typical day is a daily reference; a week's total is
  // compared with its own posts instead.
  const mult = value != null && baseline && granularity === "day" ? value / baseline.value : null;
  const postTotals = series.provenance === "publish_totals";
  const driverValue = driver ? (series.metric === "views" ? driver.views : driver.engagements) : null;
  const share = value && driverValue != null && value > 0 ? Math.round((driverValue / value) * 100) : null;

  const observed: string[] = [];
  if (b && value != null) {
    if (postTotals) observed.push(`${value.toLocaleString("en-US")} ${unit} from ${inBucket.length} post${inBucket.length === 1 ? "" : "s"} published this ${period} (each post's total, placed on its publish day).`);
    else observed.push(`Instagram reported ${value.toLocaleString("en-US")} ${unit} for this ${period}; ${inBucket.length} post${inBucket.length === 1 ? " was" : "s were"} published in it.`);
    if (driver && share != null && postTotals) observed.push(`“${driver.title.slice(0, 40)}” accounted for ${share}% of the ${period}'s measured ${unit}.`);
    if (baseline && mult != null) observed.push(`${mult >= 1 ? `${mult.toFixed(mult >= 10 ? 0 : 1)}× ` : `${Math.round(mult * 100)}% of `}your ${baseline.label.toLowerCase()} (${fmtNum(Math.round(baseline.value))} ${unit}).`);
  }
  const interpretation = !b || value == null ? ""
    : isOutlier && driver && postTotals
      ? `One post carried this ${period}. Its opening and subject reached well beyond your followers; a single post can't show which element did it, so treat it as a pattern to test rather than a rule.`
      : isOutlier
        ? `Activity this ${period} ran far above your typical level. ${inBucket.length ? "The posts published in it are the likeliest reason, but Instagram's account-level number also includes older content being rediscovered." : "No post was published in it, so older content being rediscovered or shared is the likelier explanation."}`
        : mult != null && mult < 0.7
          ? `Below your typical ${period}. ${inBucket.length ? "The posts here landed softer than your median; compare their hooks and subjects with your stronger posts before changing more." : "Nothing was published, so this is the normal decay of older posts."}`
          : `Around your typical level. Useful as a control when you test a bolder post.`;
  const recommendation = !b ? "" : isOutlier && driver
    ? `Make a second ${driver.format.toLowerCase()} with the same format and opening structure as “${driver.title.slice(0, 30)}” and compare it against your ${baseline ? baseline.label.toLowerCase() : "median"}.`
    : inBucket.length
      ? "Re-shoot the strongest idea from these posts with a spoken or on-screen hook in the first two seconds."
      : "Keep the cadence steady; gaps like this one are where reach drifts down.";

  return (
    <Drawer open={Boolean(b)} title={`${series.label} detail`} onClose={onClose}>
      {b && (
        <>
          <h3 className="ov-drawer-title">{bucketTitle(b, granularity)}{b.partial ? " (so far)" : ""}</h3>
          <div className="ov-point-num">
            <b>{value == null ? "—" : value.toLocaleString("en-US")}</b>
            <span>{unit}</span>
            {isOutlier && <em className="ov-chip warning">Breakout {period}</em>}
          </div>
          {baseline && mult != null && (
            <p className="ov-point-vs">{mult >= 1 ? `${mult.toFixed(mult >= 10 ? 0 : 1)}× your ${baseline.label.toLowerCase()}` : `${Math.round(mult * 100)}% of your ${baseline.label.toLowerCase()}`} · {baseline.label} {fmtNum(Math.round(baseline.value))} {unit}</p>
          )}
          {driver && (
            <section className="ov-driver">
              <small>Primary driver</small>
              <div className="ov-driver-card">
                <span className="ov-driver-media">
                  {driver.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={driver.thumb} alt="" />
                  ) : <span className="ov-card-ph" aria-hidden />}
                  {driver.isVideo && <span className="ov-card-play big" aria-hidden><Play size={14} fill="currentColor" /></span>}
                </span>
                <span className="ov-driver-body">
                  <b>“{driver.title}”</b>
                  <span className="ov-detail-plat">{IG} Instagram {driver.format}</span>
                  <dl className="ov-driver-stats">
                    {([["Views", driver.views], ["Likes", driver.likes], ["Comments", driver.comments], ["Saves", driver.saves], ["Shares", driver.shares], ["Reach", driver.reach]] as const).map(([k, v]) => (
                      <div key={k}><dt>{k}</dt><dd>{v == null ? "—" : fmtNum(v)}</dd></div>
                    ))}
                  </dl>
                  {driver.multiplier != null && <small className="ov-driver-perf">Performance: {driver.multiplier.toFixed(driver.multiplier >= 10 ? 0 : 1)}× your median post</small>}
                </span>
              </div>
            </section>
          )}
          {inBucket.length > 1 && (
            <div className="ov-evidence">
              <small>Also published this {period}</small>
              {inBucket.filter((p) => p.id !== driver?.id).map((p) => (
                <button key={p.id} type="button" className="ov-evidence-row" onClick={() => onAnalyze(p)}>
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb} alt="" width={40} height={40} />
                  ) : <span className="ov-card-ph" />}
                  <span><b>{p.title}</b><em>{p.views != null ? `${p.views.toLocaleString("en-US")} views · ` : ""}{p.engagements.toLocaleString("en-US")} interactions</em></span>
                </button>
              ))}
            </div>
          )}
          <section className="ov-why">
            <h3>{isOutlier ? `Why this ${period} spiked` : `What happened this ${period}`}</h3>
            {observed.length > 0 && <div className="ov-why-block"><small>Observed</small><ul>{observed.map((o) => <li key={o}>{o}</li>)}</ul></div>}
            {interpretation && <div className="ov-why-block ai"><small>SOCIA's read</small><p>{interpretation}</p></div>}
            {recommendation && <div className="ov-why-block rec"><small>Recommendation</small><p>{recommendation}</p></div>}
          </section>
          <div className="ov-detail-actions">
            {driver && <button type="button" className="ov-btn primary" onClick={() => onAnalyze(driver)}><Search size={13} /> Analyze post</button>}
            {granularity === "day" && <button type="button" className="ov-btn ghost" onClick={() => askSocia({ context: { page: "analytics", day: b.start, postId: driver?.id }, contextLabel: bucketTitle(b, "day"), question: isOutlier ? `Why did my ${unit} spike on ${bucketTitle(b, "day")}?` : `What happened with my ${unit} on ${bucketTitle(b, "day")}?`, autoSend: true })}><Sparkles size={13} /> Ask SOCIA why</button>}
            {driver?.permalink && <a href={driver.permalink} target="_blank" rel="noreferrer" className="ov-btn ghost"><ExternalLink size={13} /> View post</a>}
            {driver && <Link href={`/tool?note=${encodeURIComponent(`Build on “${driver.title.slice(0, 60)}” (${mult != null ? `${mult.toFixed(1)}× my ${baseline?.label.toLowerCase() ?? "median"}` : `${fmtNum(driverValue)} ${unit}`}).`)}`} className="ov-btn ghost"><Sparkles size={13} /> Add to Content Plan</Link>}
          </div>
        </>
      )}
    </Drawer>
  );
}
