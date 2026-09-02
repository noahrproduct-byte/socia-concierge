"use client";

// The Competitors workspace: snapshot, position, leaderboard, drawer.
//
// Rendered from rows the server assembled, so every figure arrives with the
// provenance the rollup gave it. Nothing here computes a competitor number of
// its own, and nothing substitutes a placeholder for a missing one.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, TrendingUp, TrendingDown, Info } from "lucide-react";
import CompetitorLeaderboard from "@/components/CompetitorLeaderboard";
import {
  buildPositionRows, nicheMedian, rankOf, CELL_REASON, SOURCE_LABEL,
  type Cell, type LeaderRow, type PositionRow,
} from "@/lib/competitorRollup";

const fmtN = (n: number | null | undefined): string =>
  n == null ? "—"
  : n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
  : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

function cellText(c: Cell, fmt?: (n: number) => string): string {
  if (c.state === "ok" && c.value != null) return fmt ? fmt(c.value) : fmtN(c.value);
  return c.state === "unknown" ? "—" : CELL_REASON[c.state as Exclude<Cell["state"], "ok">];
}

export default function CompetitorWorkspace({ rows }: { rows: LeaderRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<LeaderRow | null>(null);

  const you = useMemo(() => rows.find((r) => r.isYou), [rows]);
  const { wins, gaps } = useMemo(() => buildPositionRows(rows, you), [rows, you]);

  const audienceRank = useMemo(() => rankOf(rows, (r) => r.audience), [rows]);
  const engBench = useMemo(() => nicheMedian(rows, (r) => r.engagement), [rows]);
  const cadBench = useMemo(() => nicheMedian(rows, (r) => r.cadence), [rows]);

  const track = useCallback(
    async (r: LeaderRow) => {
      await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: r.handle, platform: r.platform }),
      });
      router.refresh();
    },
    [router],
  );

  // Comparison context, only where a real benchmark exists.
  const context = (c: Cell, bench: Cell): string | null => {
    if (c.state !== "ok" || bench.state !== "ok" || c.value == null || !bench.value) {
      return bench.state === "insufficient" ? "Not enough competitor data" : null;
    }
    const pct = ((c.value - bench.value) / bench.value) * 100;
    if (Math.abs(pct) < 5) return "At the niche median";
    return `${Math.abs(Math.round(pct))}% ${pct > 0 ? "above" : "below"} niche median`;
  };

  return (
    <>
      {/* ---------- competitive snapshot ---------- */}
      <section className="cw-snap">
        <div className="cw-snap-item">
          <small>Your position</small>
          <b>
            {audienceRank ? `#${audienceRank.rank}` : "—"}
            {audienceRank && <em>of {audienceRank.of} measurable</em>}
          </b>
          <span>{audienceRank ? "By audience size" : "Not enough competitor data"}</span>
        </div>
        <div className="cw-snap-item">
          <small>Audience</small>
          <b>{you ? cellText(you.audience) : "—"}</b>
          <span>{you?.platform === "youtube" ? "Subscribers" : "Followers"}</span>
        </div>
        <div className="cw-snap-item">
          <small>Engagement</small>
          <b>{you ? cellText(you.engagement, (n) => `${n.toFixed(1)}%`) : "—"}</b>
          <span>{you ? context(you.engagement, engBench) ?? "No benchmark yet" : "—"}</span>
        </div>
        <div className="cw-snap-item">
          <small>Posting pace</small>
          <b>{you ? cellText(you.cadence, (n) => `${n.toFixed(1)}`) : "—"}<em>/week</em></b>
          <span>{you ? context(you.cadence, cadBench) ?? "No benchmark yet" : "—"}</span>
        </div>
      </section>

      {/* ---------- where you win / fall behind ---------- */}
      <section className="cp4-sec">
        <div className="cp4-sec-head">
          <h2>Your competitive position</h2>
          <small>
            Measured against the median of competitors SOCIA has real data for — never an industry estimate
          </small>
        </div>
        {wins.length || gaps.length ? (
          <div className="cw-pos">
            <div>
              <small className="cw-pos-label win">WHERE YOU WIN</small>
              {wins.length ? wins.map((r) => <PosRow key={r.label} r={r} />)
                : <p className="cp4-empty">Nothing measurably ahead of the median yet.</p>}
            </div>
            <div>
              <small className="cw-pos-label gap">WHERE YOU&apos;RE BEHIND</small>
              {gaps.length ? gaps.map((r) => <PosRow key={r.label} r={r} />)
                : <p className="cp4-empty">Nothing measurably behind the median.</p>}
            </div>
          </div>
        ) : (
          <p className="cp4-empty">
            SOCIA needs at least three competitors with public metrics before it can compare you to a
            median. Track more accounts, or connect Facebook to unlock Instagram competitor data.
          </p>
        )}
      </section>

      {/* ---------- leaderboard ---------- */}
      <section className="cp4-sec">
        <div className="cp4-sec-head">
          <h2>Competitor leaderboard</h2>
          <small>Accounts most relevant to your niche and goals</small>
        </div>
        <CompetitorLeaderboard rows={rows} onOpen={setOpen} onTrack={track} />
      </section>

      {open && <DetailDrawer r={open} rows={rows} you={you} onClose={() => setOpen(null)} />}
    </>
  );
}

function PosRow({ r }: { r: PositionRow }) {
  const good = r.diff ? r.diff.better === r.higherIsBetter : false;
  return (
    <div className="cw-pos-row">
      <span className="cw-pos-metric">{r.label}</span>
      <span className="cw-pos-nums">
        <span><b>{cellText(r.you, (n) => (r.label === "Engagement rate" ? `${n.toFixed(1)}%` : n < 100 ? n.toFixed(1) : fmtN(n)))}</b><small>you</small></span>
        <span><b>{cellText(r.bench, (n) => (r.label === "Engagement rate" ? `${n.toFixed(1)}%` : n < 100 ? n.toFixed(1) : fmtN(n)))}</b><small>median{r.bench.sample ? ` of ${r.bench.sample}` : ""}</small></span>
      </span>
      {r.diff && (
        <span className={`cw-pos-diff ${good ? "up" : "down"}`}>
          {good ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(Math.round(r.diff.pct))}%
        </span>
      )}
    </div>
  );
}

function DetailDrawer({
  r, rows, you, onClose,
}: {
  r: LeaderRow; rows: LeaderRow[]; you: LeaderRow | undefined; onClose: () => void;
}) {
  // "What they do better" is only ever a comparison of two real values.
  const compare: { label: string; theirs: Cell; yours: Cell; higherIsBetter: boolean }[] = you
    ? [
        { label: "Audience", theirs: r.audience, yours: you.audience, higherIsBetter: true },
        { label: "Engagement rate", theirs: r.engagement, yours: you.engagement, higherIsBetter: true },
        { label: "Posts / week", theirs: r.cadence, yours: you.cadence, higherIsBetter: true },
        { label: "Median views", theirs: r.medianViews, yours: you.medianViews, higherIsBetter: true },
      ]
    : [];
  const measurable = compare.filter((c) => c.theirs.state === "ok" && c.yours.state === "ok");
  const theyWin = measurable.filter((c) => (c.theirs.value ?? 0) > (c.yours.value ?? 0));
  const youWin = measurable.filter((c) => (c.yours.value ?? 0) >= (c.theirs.value ?? 0));

  return (
    <div className="cp4-modal-wrap" role="dialog" aria-modal="true" aria-label={`${r.name} details`}>
      <div className="cp4-scrim" onClick={onClose} />
      <aside className="cp4-drawer">
        <div className="cp4-modal-head">
          {r.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cp4-face big" src={r.avatar} alt="" width={46} height={46} />
          ) : (
            <span className="cp4-face ph big">{r.name[0]?.toUpperCase()}</span>
          )}
          <div className="cp4-drawer-id">
            <h3>{r.name}</h3>
            <small>@{r.handle} · {r.platform === "youtube" ? "YouTube" : r.platform === "facebook" ? "Facebook" : "Instagram"}</small>
          </div>
          <button type="button" className="cp4-x" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>

        {r.url && (
          <a className="cp4-drawer-visit" href={r.url} target="_blank" rel="noreferrer">
            Open profile <ExternalLink size={13} />
          </a>
        )}

        <div className="cp4-drawer-sec">
          <h4>Metrics</h4>
          <ul className="cp4-drawer-metrics">
            {[
              ["Audience", r.audience, undefined],
              ["Engagement rate", r.engagement, (n: number) => `${n.toFixed(1)}%`],
              ["Posts / week", r.cadence, (n: number) => n.toFixed(1)],
              ["Median views", r.medianViews, undefined],
            ].map(([label, c, fmt]) => (
              <li key={label as string}>
                <span>{label as string}</span>
                <b
                  className={(c as Cell).state === "ok" ? "real" : undefined}
                  title={(c as Cell).source ? SOURCE_LABEL[(c as Cell).source!] : undefined}
                >
                  {cellText(c as Cell, fmt as ((n: number) => string) | undefined)}
                </b>
              </li>
            ))}
          </ul>
        </div>

        {measurable.length > 0 ? (
          <>
            <div className="cp4-drawer-sec">
              <h4>What they do better</h4>
              {theyWin.length ? (
                <ul className="cw-cmp">
                  {theyWin.map((c) => (
                    <li key={c.label}>
                      <span>{c.label}</span>
                      <em>{cellText(c.theirs)} vs your {cellText(c.yours)}</em>
                    </li>
                  ))}
                </ul>
              ) : <p className="cp4-drawer-note">Nothing measurable — you lead on every comparable metric.</p>}
            </div>
            <div className="cp4-drawer-sec">
              <h4>What you do better</h4>
              {youWin.length ? (
                <ul className="cw-cmp">
                  {youWin.map((c) => (
                    <li key={c.label}>
                      <span>{c.label}</span>
                      <em>{cellText(c.yours)} vs their {cellText(c.theirs)}</em>
                    </li>
                  ))}
                </ul>
              ) : <p className="cp4-drawer-note">Nothing measurable leads yet on the metrics both accounts publish.</p>}
            </div>
          </>
        ) : (
          <div className="cp4-drawer-sec">
            <p className="cp4-drawer-note">
              <Info size={11} /> No metric is published for both accounts, so there is nothing to compare
              honestly. Instagram and Facebook expose no analytics for accounts you don&apos;t own.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
