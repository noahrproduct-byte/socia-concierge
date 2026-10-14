"use client";

// Analytics → All brands (Pro): every Brand Workspace the person owns, side
// by side. Loaded when the tab is opened, so the rest of Analytics stays fast.
// Each brand is measured against its own median, never against the others'
// totals; a "—" carries the reason SOCIA has no number there.

import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Locked } from "./AnalyticsV3";
import { platformMark } from "./platformMarks";
import { fmtMultiplier } from "@/lib/multiplier";
import type { BrandRow, BrandPlatform } from "@/lib/crossBrand";
import type { PlanId } from "@/lib/plans";

type Data = { range: { days: number; label: string; note?: string }; brands: (BrandRow & { error?: boolean })[]; paused: number };

const NAME = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" } as const;
const num = (n: number | null) => (n == null ? null : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString("en-US"));
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n))}`;

function Missing({ why }: { why: string | null }) {
  return <span className="cb-none" title={why ?? undefined} aria-label={why ?? "Not available"}>—</span>;
}

function growthCell(p: BrandPlatform) {
  if (p.growth.value == null) return <Missing why={p.growth.note} />;
  return <span className={p.growth.value > 0 ? "cb-up" : p.growth.value < 0 ? "cb-down" : ""} title={p.growth.note ?? undefined}>{signed(p.growth.value)}{p.growth.kind === "gained" ? <small> gained</small> : null}</span>;
}

function typicalCell(p: BrandPlatform) {
  if (p.typical.multiplier == null) return <Missing why={p.typical.note} />;
  const m = p.typical.multiplier;
  return <span className={m >= 1.1 ? "cb-up" : m <= 0.9 ? "cb-down" : ""}>{fmtMultiplier(m)}</span>;
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

  return (
    <section className="ov-card cb" aria-labelledby="cb-h">
      <div className="ov-card-head">
        <div>
          <h2 id="cb-h">All brands</h2>
          <p className="ov-card-sub">Each brand is compared with its own usual, so a smaller brand isn&apos;t marked down for being smaller.</p>
        </div>
        {data && <span className="ov-range-label">{data.range.label}</span>}
      </div>

      {error ? (
        <p className="cb-err" role="alert">{error}</p>
      ) : !data ? (
        <p className="cb-loading"><Loader2 size={14} className="cp-spin" /> Reading every brand…</p>
      ) : (
        <>
          <div className="cb-scroll">
            <table className="cb-table">
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
                    <tr key={`${b.id}-${p?.platform ?? "none"}`} className={i === 0 ? "cb-first" : ""}>
                      {i === 0 && (
                        <th scope="row" rowSpan={rows.length} className="cb-brand">
                          <b>{b.name}</b>
                          {b.active && <small className="cb-chip">Open now</small>}
                        </th>
                      )}
                      {p ? (
                        <>
                          <td className="cb-plat"><span className="cb-mark">{platformMark(p.platform, "currentColor", 13)}</span>{NAME[p.platform]}<small>{p.account}</small></td>
                          <td className="num">{p.audience == null ? <Missing why="The platform didn't report it." /> : <>{num(p.audience)}<small> {p.audienceLabel}</small></>}</td>
                          <td className="num">{growthCell(p)}</td>
                          <td className="num">{p.posts == null ? <Missing why={p.postsNote} /> : p.posts}</td>
                          <td className="num">{typicalCell(p)}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="cb-empty">{"error" in b && b.error ? "SOCIA couldn't read this brand just now." : "No accounts connected in this brand."}</td>
                      )}
                      {i === 0 && (
                        <td rowSpan={rows.length} className="cb-best">
                          {b.best ? (
                            <>
                              <b>{b.best.title}</b>
                              <small>{NAME[b.best.platform]} · {fmtMultiplier(b.best.multiplier)} this brand&apos;s usual</small>
                              {b.best.url && <a href={b.best.url} target="_blank" rel="noopener noreferrer">See it <ArrowUpRight size={11} /></a>}
                            </>
                          ) : <Missing why="No post in this window has enough history behind it to compare." />}
                        </td>
                      )}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
          <ul className="cb-notes">
            <li><b>Growth</b> is the net change in followers from SOCIA&apos;s daily counts. YouTube shows subscribers gained, as YouTube reports it. TikTok doesn&apos;t provide follower history.</li>
            <li><b>Typical post</b> is the median post published in this window against that brand&apos;s own median post on the platform (1× is usual). It needs at least 3 posts in the window and 5 overall.</li>
            {data.range.note && <li>{data.range.note}</li>}
            {data.paused > 0 && <li>{data.paused} paused {data.paused === 1 ? "brand isn't" : "brands aren't"} shown.</li>}
          </ul>
        </>
      )}
    </section>
  );
}
