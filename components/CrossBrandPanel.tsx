"use client";

// Analytics, All brands (Pro): every Brand Workspace the person owns, side by
// side. Loaded when the tab is opened, so the rest of Analytics stays fast.
// Each brand is measured against its own median, never against the others'
// totals; a dash carries the reason SOCIA has no number there.

import "@/app/(app)/analytics/analytics.css";
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Locked } from "./AnalyticsV3";
import { Card, CardHeader, CardSource, Chip, KpiCell, KpiStrip, PlatformMark, Skeleton, StatusPill, TableWrap, Unavailable } from "@/components/system";
import { fmtMultiplier } from "@/lib/multiplier";
import type { BrandRow, BrandPlatform } from "@/lib/crossBrand";
import type { PlanId } from "@/lib/plans";

type Data = { range: { days: number; label: string; note?: string }; brands: (BrandRow & { error?: boolean })[]; paused: number };

const NAME = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" } as const;
const num = (n: number | null) => (n == null ? null : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString("en-US"));
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n))}`;

function Missing({ why }: { why: string | null }) {
  return <Unavailable reason={why ?? "Not available"} />;
}

function growthCell(p: BrandPlatform) {
  if (p.growth.value == null) return <Missing why={p.growth.note} />;
  const tone = p.growth.value > 0 ? "an-good" : p.growth.value < 0 ? "an-bad" : undefined;
  return (
    <>
      <span className={tone}>{signed(p.growth.value)}</span>
      {(p.growth.note || p.growth.kind === "gained") && <span className="sub">{p.growth.note ?? "gained"}</span>}
    </>
  );
}

function typicalCell(p: BrandPlatform) {
  if (p.typical.multiplier == null) return <Missing why={p.typical.note} />;
  const m = p.typical.multiplier;
  return <StatusPill tone={m >= 1.1 ? "positive" : m <= 0.9 ? "negative" : "neutral"}>{fmtMultiplier(m)}</StatusPill>;
}

/** Brand-level totals. Audience levels and post counts add up; multipliers never do. */
function totalsOf(data: Data) {
  const plats = data.brands.flatMap((b) => b.platforms);
  const aud = plats.map((p) => p.audience).filter((v): v is number => v != null);
  const posts = plats.map((p) => p.posts).filter((v): v is number => v != null);
  return {
    brands: data.brands.length,
    accounts: plats.length,
    audience: aud.length ? aud.reduce((a, b) => a + b, 0) : null,
    audienceFrom: aud.length,
    posts: posts.length ? posts.reduce((a, b) => a + b, 0) : null,
    postsSkipped: plats.length - posts.length,
  };
}

export default function CrossBrandPanel({ days, locked }: { days: number; locked: PlanId | null }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (locked) return;
    let live = true;
    setData(null);
    setError(null);
    fetch(`/api/analytics/brands?days=${days}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => { if (!live) return; if (ok) setData(j as Data); else setError((j as { error?: string }).error ?? "SOCIA couldn't load your brands."); })
      .catch(() => { if (live) setError("SOCIA couldn't load your brands. Check your connection and try again."); });
    return () => { live = false; };
  }, [days, locked]);

  if (locked) {
    return <Locked plan={locked} title="Compare every brand side by side" blurb="See each Brand Workspace's audience, growth, posting and typical post against its own usual, with each brand's best post, in one table." from="analytics_all_brands" />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader title="All brands" />
        <div className="s-error-block" role="alert">
          <AlertCircle aria-hidden />
          <span>{error}</span>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="an-stack" aria-busy="true">
        <KpiStrip cols={4}>
          {["Brands", "Accounts", "Combined audience", "Posts"].map((l) => (
            <div key={l} className="s-kpi">
              <div className="s-kpi-label">{l}</div>
              <Skeleton variant="value" />
            </div>
          ))}
        </KpiStrip>
        <Card>
          <CardHeader title="All brands" />
          <p className="s-hint">Reading every brand…</p>
          <Skeleton variant="block" />
        </Card>
      </div>
    );
  }

  const t = totalsOf(data);
  const hasYouTube = data.brands.some((b) => b.platforms.some((p) => p.platform === "youtube" && p.posts == null));

  return (
    <div className="an-stack">
      <KpiStrip cols={4}>
        <KpiCell label="Brands" value={String(t.brands)} note={data.paused > 0 ? `${data.paused} paused ${data.paused === 1 ? "brand isn't" : "brands aren't"} shown.` : undefined} />
        <KpiCell label="Accounts" value={String(t.accounts)} note="Connected platform accounts across these brands." />
        <KpiCell
          label="Combined audience"
          value={num(t.audience)}
          reason="No connected account reported its audience."
          note={t.audience != null ? `Followers and subscribers across ${t.audienceFrom} ${t.audienceFrom === 1 ? "account" : "accounts"}.` : undefined}
        />
        <KpiCell
          label="Posts"
          value={t.posts != null ? String(t.posts) : null}
          reason="No connected account reported posts for this window."
          note={t.posts != null ? (hasYouTube ? "Published in this window. YouTube uploads are counted on the YouTube tab." : "Published in this window.") : undefined}
        />
      </KpiStrip>

      <Card flush aria-labelledby="cb-h">
        <div className="s-card-head">
          <h2 id="cb-h" className="s-card-title">All brands</h2>
          <div className="s-card-head-actions">
            <span className="s-card-period">{data.range.label}</span>
          </div>
        </div>
        <TableWrap>
          <table className="s-table an-brand-table">
            <thead>
              <tr>
                <th scope="col">Brand</th>
                <th scope="col">Platform</th>
                <th scope="col" className="num">Audience</th>
                <th scope="col" className="num">Growth</th>
                <th scope="col" className="num">Posts</th>
                <th scope="col" className="num">Typical post</th>
                <th scope="col">Best post</th>
              </tr>
            </thead>
            <tbody>
              {data.brands.map((b) => {
                const rows = b.platforms.length ? b.platforms : [null];
                return rows.map((p, i) => (
                  <tr key={`${b.id}-${p?.platform ?? "none"}`}>
                    {i === 0 && (
                      <th scope="row" rowSpan={rows.length} className="an-rowhead">
                        {b.name}
                        {b.active && (
                          <span className="sub">
                            <Chip>Open now</Chip>
                          </span>
                        )}
                      </th>
                    )}
                    {p ? (
                      <>
                        <td>
                          <PlatformMark platform={p.platform} /> {NAME[p.platform]}
                          <span className="sub">{p.account}</span>
                        </td>
                        <td className="num">
                          {p.audience == null ? (
                            <Missing why="The platform didn't report it." />
                          ) : (
                            <>
                              {num(p.audience)}
                              <span className="sub">{p.audienceLabel}</span>
                            </>
                          )}
                        </td>
                        <td className="num">{growthCell(p)}</td>
                        <td className="num">{p.posts == null ? <Missing why={p.postsNote} /> : p.posts}</td>
                        <td className="num">{typicalCell(p)}</td>
                      </>
                    ) : (
                      <td colSpan={5}>
                        <span className="s-na-why">{"error" in b && b.error ? "SOCIA couldn't read this brand just now." : "No accounts connected in this brand."}</span>
                      </td>
                    )}
                    {i === 0 && (
                      <td rowSpan={rows.length}>
                        {b.best ? (
                          <>
                            <span className="id">{b.best.title}</span>
                            <span className="sub">
                              {NAME[b.best.platform]} · {fmtMultiplier(b.best.multiplier)} this brand&apos;s usual
                            </span>
                            {b.best.url && (
                              <a className="s-link" href={b.best.url} target="_blank" rel="noopener noreferrer">
                                See it<span className="s-sr"> (opens {NAME[b.best.platform]} in a new tab)</span>
                              </a>
                            )}
                          </>
                        ) : (
                          <Missing why="No post in this window has enough history behind it to compare." />
                        )}
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </TableWrap>
        <div className="an-flush-foot">
          <CardSource>Each brand is compared with its own usual, so a smaller brand isn&apos;t marked down for being smaller.</CardSource>
          <CardSource>Growth is the net change in followers from SOCIA&apos;s daily counts. YouTube shows subscribers gained, as YouTube reports it. TikTok doesn&apos;t provide follower history.</CardSource>
          <CardSource>Typical post is the median post published in this window against that brand&apos;s own median post on the platform (1× is usual). It needs at least 3 posts in the window and 5 overall.</CardSource>
          {data.range.note && <CardSource>{data.range.note}</CardSource>}
          {data.paused > 0 && <CardSource>{data.paused} paused {data.paused === 1 ? "brand isn't" : "brands aren't"} shown.</CardSource>}
        </div>
      </Card>
    </div>
  );
}
