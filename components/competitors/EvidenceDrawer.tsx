"use client";

// Evidence behind a claim. Either one comparison (both numbers, their source
// and sample, and the posts they were computed from) or a set of example
// posts for a counted pattern. Nothing here is generated.

import { ExternalLink } from "lucide-react";
import Drawer from "@/components/ov/Drawer";
import { SOURCE_LABEL, type LeaderRow } from "@/lib/competitorRollup";
import type { CompetitorRow, CompPost, Reason } from "@/lib/competitorIntel";
import { locationTokens, tagsFor } from "@/lib/competitorPatterns";
import { cellText, fmtDate, fmtN } from "./shared";

export type Evidence =
  | { kind: "reason"; reason: Reason }
  | { kind: "examples"; tag: string | null; title: string };

const DEFINITION: Record<Reason["key"], { label: string; you: string; them: string }> = {
  cadence: { label: "Posts per week", you: "Your posts in the selected range ÷ weeks in the range.", them: "Their posts read ÷ the weeks those posts span." },
  medianViews: { label: "Median views", you: "Median views across your posts in the range (Instagram insights).", them: "Median public view count across their recent uploads." },
  audience: { label: "Audience", you: "Followers reported by Instagram now.", them: "Subscribers or followers the platform publishes now." },
  engagement: { label: "Engagement rate", you: "Interactions ÷ reach (or ÷ followers when reach is missing), all synced posts.", them: "YouTube: (likes + comments) ÷ views, median per video. Instagram: median (likes + comments) ÷ followers." },
};

const fmtVal = (unit: Reason["unit"], n: number) => (unit === "pct" ? `${n.toFixed(1)}%` : unit === "perWeek" ? n.toFixed(1) : fmtN(n));

export default function EvidenceDrawer({ item, you, them, days, location, onClose }: {
  item: Evidence | null; you: LeaderRow; them: CompetitorRow | null; days: number; location: string | null; onClose: () => void;
}) {
  const loc = locationTokens(location);
  const posts: CompPost[] = them?.posts ?? [];
  let list: CompPost[] = [];
  let listTitle = "";
  if (item?.kind === "examples") {
    list = item.tag ? posts.filter((p) => tagsFor(p.title, loc).includes(item.tag!)) : [...posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    listTitle = item.tag ? `Their posts with "${item.tag}"` : "Their posts by views";
  } else if (item?.kind === "reason") {
    list = item.reason.key === "cadence" ? [...posts].sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()) : [...posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    listTitle = item.reason.key === "cadence" ? "Their recent posts, newest first" : "Their recent posts by views";
  }

  return (
    <Drawer open={Boolean(item)} title="Evidence" onClose={onClose} width={480}>
      {item?.kind === "reason" && them && (
        <>
          <h3 className="cx-dr-title">{item.reason.title}</h3>
          <p className="cx-dr-sub">{item.reason.detail}</p>
          <table className="cx-ev-table">
            <thead><tr><th>{DEFINITION[item.reason.key].label}</th><th>Value</th><th>Source</th></tr></thead>
            <tbody>
              <tr>
                <td>You</td>
                <td>{cellText(item.reason.you, (n) => fmtVal(item.reason.unit, n))}</td>
                <td>{item.reason.you.source ? SOURCE_LABEL[item.reason.you.source] : "—"}{item.reason.you.sample ? ` · ${item.reason.you.sample} posts` : ""}{item.reason.key !== "audience" ? ` · last ${days} days` : ""}</td>
              </tr>
              <tr>
                <td>{them.name}</td>
                <td>{cellText(item.reason.them, (n) => fmtVal(item.reason.unit, n))}</td>
                <td>{item.reason.them.source ? SOURCE_LABEL[item.reason.them.source] : "—"}{item.reason.them.sample ? ` · ${item.reason.them.sample} posts read` : ""}</td>
              </tr>
              <tr>
                <td>Difference</td>
                <td className={item.reason.diffPct > 0 ? "up" : "down"}>{item.reason.diffPct > 0 ? "+" : ""}{Math.round(item.reason.diffPct)}%</td>
                <td>(them − you) ÷ you</td>
              </tr>
            </tbody>
          </table>
          <dl className="cx-ev-def">
            <div><dt>How yours is measured</dt><dd>{DEFINITION[item.reason.key].you}</dd></div>
            <div><dt>How theirs is measured</dt><dd>{DEFINITION[item.reason.key].them}</dd></div>
          </dl>
        </>
      )}
      {item?.kind === "examples" && (
        <>
          <h3 className="cx-dr-title">{item.title}</h3>
          <p className="cx-dr-sub">{list.length} of the {posts.length} posts SOCIA read{item.tag ? ` show "${item.tag}" in the title` : ""}.</p>
        </>
      )}
      {item && (
        list.length ? (
          <>
            <h4 className="cx-ev-h4">{listTitle}</h4>
            <ul className="cx-ev-posts">
              {list.slice(0, 12).map((p) => (
                <li key={p.url}>
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb} alt="" loading="lazy" />
                  ) : <span className="cx-ev-ph" />}
                  <span className="cx-ev-body">
                    <b title={p.title ?? undefined}>{p.title ?? "(untitled)"}</b>
                    <small>
                      {fmtDate(p.publishedAt)}{p.format ? ` · ${p.format}` : ""}{p.views != null ? ` · ${fmtN(p.views)} views` : ""}{p.likes != null ? ` · ${fmtN(p.likes)} likes` : ""}
                      {p.multiplier != null ? ` · ${p.multiplier.toFixed(1)}× their median` : ""}
                    </small>
                  </span>
                  <a href={p.url} target="_blank" rel="noreferrer" className="cx-icon-btn" aria-label="Open post"><ExternalLink size={13} /></a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="cx-empty small">
            {them?.postsGate === "connection_needed" ? "Their posts need a linked Facebook Page to read." : "No posts read for this account yet."}
          </p>
        )
      )}
    </Drawer>
  );
}
