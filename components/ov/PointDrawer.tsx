"use client";

// One bucket of the performance chart, opened by clicking a bar: the number,
// how it compares with the account's typical value, the posts published in
// it, and, for a breakout, what drove it. Observed data, SOCIA's read and the
// recommendation stay in separate blocks.

import "@/app/(app)/analytics/analytics.css";
import { ExternalLink, Sparkles, Search, ImageOff } from "lucide-react";
import Drawer from "./Drawer";
import { Button, ButtonLink, PlatformMark, StatusPill, buttonClass } from "@/components/system";
import { driverOf } from "./OverviewChart";
import { bucketTitle, fmtNum, type Bucket, type Granularity, type Series, type Baseline, type PostCard } from "@/lib/overview";
import { askSocia } from "@/lib/ask";

const DASH = String.fromCharCode(0x2014);

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
          <h3 className="s-section-title">{bucketTitle(b, granularity)}{b.partial ? " (so far)" : ""}</h3>
          <div className={value == null ? "an-stat is-na" : "an-stat"}>
            <b>{value == null ? DASH : value.toLocaleString("en-US")}</b>
            <span>{unit}</span>
          </div>
          {isOutlier && (
            <p className="an-meta">
              <StatusPill tone="warning">Breakout {period}</StatusPill>
            </p>
          )}
          {baseline && mult != null && (
            <p className="an-note">{mult >= 1 ? `${mult.toFixed(mult >= 10 ? 0 : 1)}× your ${baseline.label.toLowerCase()}` : `${Math.round(mult * 100)}% of your ${baseline.label.toLowerCase()}`} · {baseline.label} {fmtNum(Math.round(baseline.value))} {unit}</p>
          )}
          {(driver || inBucket.length > 1) && (
            <div className="an-why">
              {driver && (
                <section className="an-why-block">
                  <small>Primary driver</small>
                  <div className="an-row">
                    {driver.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={driver.thumb} alt="" width={40} height={40} className="an-thumb" />
                    ) : (
                      <span className="an-thumb an-avatar is-ph" aria-hidden><ImageOff /></span>
                    )}
                    <span className="an-row-body">
                      <b>“{driver.title}”</b>
                      <small>
                        <PlatformMark platform="instagram" size="sm" /> Instagram {driver.format}{driver.isVideo ? " · video" : ""}
                      </small>
                    </span>
                  </div>
                  <dl className="an-stats">
                    {([["Views", driver.views], ["Likes", driver.likes], ["Comments", driver.comments], ["Saves", driver.saves], ["Shares", driver.shares], ["Reach", driver.reach]] as const).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd className={v == null ? "is-na" : undefined}>{v == null ? DASH : fmtNum(v)}</dd>
                      </div>
                    ))}
                  </dl>
                  {driver.multiplier != null && <p className="s-hint">Performance: {driver.multiplier.toFixed(driver.multiplier >= 10 ? 0 : 1)}× your median post</p>}
                </section>
              )}
              {inBucket.length > 1 && (
                <section className="an-why-block">
                  <small>Also published this {period}</small>
                  <div className="an-list">
                    {inBucket.filter((p) => p.id !== driver?.id).map((p) => (
                      <button key={p.id} type="button" className="an-row" onClick={() => onAnalyze(p)}>
                        {p.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumb} alt="" width={40} height={40} className="an-thumb" />
                        ) : (
                          <span className="an-thumb an-avatar is-ph" aria-hidden><ImageOff /></span>
                        )}
                        <span className="an-row-body">
                          <b>{p.title}</b>
                          <small>{p.views != null ? `${p.views.toLocaleString("en-US")} views · ` : ""}{p.engagements.toLocaleString("en-US")} interactions</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
          <section className="an-why">
            <h3>{isOutlier ? `Why this ${period} spiked` : `What happened this ${period}`}</h3>
            {observed.length > 0 && (
              <div className="an-why-block">
                <small>Observed</small>
                <ul>{observed.map((o) => <li key={o}>{o}</li>)}</ul>
              </div>
            )}
            {interpretation && (
              <div className="an-why-block is-read">
                <small>SOCIA&apos;s read</small>
                <p>{interpretation}</p>
              </div>
            )}
            {recommendation && (
              <div className="an-why-block">
                <small>Recommendation</small>
                <p>{recommendation}</p>
              </div>
            )}
          </section>
          <div className="an-actions">
            {driver && <Button variant="primary" size="sm" onClick={() => onAnalyze(driver)}><Search aria-hidden /> Analyze post</Button>}
            {granularity === "day" && <Button size="sm" onClick={() => askSocia({ context: { page: "analytics", day: b.start, postId: driver?.id }, contextLabel: bucketTitle(b, "day"), question: isOutlier ? `Why did my ${unit} spike on ${bucketTitle(b, "day")}?` : `What happened with my ${unit} on ${bucketTitle(b, "day")}?`, autoSend: true })}><Sparkles aria-hidden /> Ask SOCIA why</Button>}
            {driver?.permalink && <a href={driver.permalink} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}><ExternalLink aria-hidden /> View post</a>}
            {driver && <ButtonLink href={`/tool?note=${encodeURIComponent(`Build on “${driver.title.slice(0, 60)}” (${mult != null ? `${mult.toFixed(1)}× my ${baseline?.label.toLowerCase() ?? "median"}` : `${fmtNum(driverValue)} ${unit}`}).`)}`} variant="ghost" size="sm"><Sparkles aria-hidden /> Add to Content Plan</ButtonLink>}
          </div>
        </>
      )}
    </Drawer>
  );
}
