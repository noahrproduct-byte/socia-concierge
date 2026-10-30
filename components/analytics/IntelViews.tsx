"use client";

// Analytics' brand-wide views beside Performance:
//   Diagnostics           the stored findings (problems first), each with its
//                         evidence, and a refresh that runs the detectors now
//   Content intelligence  what works by format on each platform, against the
//                         account's own median, plus recurring themes
// Both read only SOCIA's own records; empty states say what they wait for.

import { useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button, Empty } from "@/components/system";
import { GOAL_PLATFORM_NAME } from "@/lib/growth";
import type { StoredInsight } from "@/lib/intel/insight";
import type { WorkRow } from "@/lib/intel/overview";
import FindingCard from "./FindingCard";
import "./intel.css";

export function DiagnosticsView({ initial, storeReady, canManage }: { initial: StoredInsight[]; storeReady: boolean; canManage: boolean }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const problems = useMemo(() => list.filter((f) => f.category === "diagnostic"), [list]);
  const patterns = useMemo(() => list.filter((f) => f.category !== "diagnostic"), [list]);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/intel/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || j.message || "Couldn't refresh just now.");
      const l = await fetch("/api/intel/insights").then((x) => x.json()).catch(() => null);
      if (l?.insights) setList(l.insights);
      const run = j.run as { found: number; added: number; superseded: number };
      setMsg({ ok: true, text: `Checked just now: ${run.found} ${run.found === 1 ? "finding" : "findings"}, ${run.added} new, ${run.superseded} no longer showing.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't refresh just now." });
    } finally {
      setBusy(false);
    }
  }

  const drop = (id: string) => setList((l) => l.filter((f) => f.id !== id));

  if (!storeReady) {
    return <Empty><b>Findings aren&apos;t switched on yet.</b> They appear once SOCIA&apos;s database update for insights has run.</Empty>;
  }
  return (
    <div className="iv">
      <div className="iv-bar">
        <p>Patterns and problems SOCIA found in your own posts. Each one says how sure SOCIA is and why; possible explanations are marked as hypotheses, not causes.</p>
        {canManage && <Button size="sm" onClick={refresh} busy={busy}><RefreshCw size={14} aria-hidden /> Check again</Button>}
      </div>
      {msg && <p className={msg.ok ? "iv-note" : "s-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      {list.length === 0 ? (
        <Empty><b>Nothing stands out right now.</b> On Instagram SOCIA looks for breakout posts, a leading format, a drop in posting pace, the time your engagement lands and missing location mentions; on Instagram and YouTube, posts reporting zero views.{canManage ? " Press Check again to look now." : ""}</Empty>
      ) : (
        <>
          {problems.length > 0 && (
            <section className="iv-group">
              <h2>Needs a look</h2>
              {problems.map((f) => <FindingCard key={f.id} f={f} onChange={canManage ? drop : undefined} />)}
            </section>
          )}
          {patterns.length > 0 && (
            <section className="iv-group">
              <h2>Patterns</h2>
              {patterns.map((f) => <FindingCard key={f.id} f={f} onChange={canManage ? drop : undefined} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function ContentIntelView({ works, themes, postsRead }: { works: WorkRow[]; themes: { name: string; posts: number; example: string }[]; postsRead: number }) {
  const byPlatform = new Map<string, WorkRow[]>();
  for (const w of works) byPlatform.set(w.platform, [...(byPlatform.get(w.platform) ?? []), w]);
  return (
    <div className="iv">
      <div className="iv-bar">
        <p>How each format does against your own typical post on the same platform, from the {postsRead} most recent posts SOCIA read. A format needs 3 posts, and the account 6, before it&apos;s compared.</p>
      </div>
      {works.length === 0 ? (
        <Empty><b>Not enough to compare yet.</b> Once an account has 6 posts with numbers in at least two formats, the comparison appears here.</Empty>
      ) : (
        [...byPlatform.entries()].map(([platform, rows]) => (
          <section className="iv-group" key={platform}>
            <h2>{GOAL_PLATFORM_NAME[platform as keyof typeof GOAL_PLATFORM_NAME]}</h2>
            <div className="iv-scroll"><table className="iv-table">
              <thead><tr><th>Format</th><th className="num">Posts</th><th className="num">Median {rows[0].metric} vs your median</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.format}>
                    <td>{r.format}s</td>
                    <td className="num">{r.posts}</td>
                    <td className="num"><b>{r.multiple}x</b></td>
                    <td className="act">
                      {r.multiple >= 1.3 && r.posts >= 3 && (
                        <Link className="s-link" href={`/tool?note=${encodeURIComponent(`${r.format}s are earning ${r.multiple}x my median ${r.metric} on ${GOAL_PLATFORM_NAME[r.platform]} (${r.posts} posts). Weight next week toward them and keep one other format as a comparison.`)}`}>Add to plan</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        ))
      )}
      {themes.length > 0 && (
        <section className="iv-group">
          <h2>Recurring themes</h2>
          <p className="iv-note">Named from your captions when SOCIA read the account. They aren&apos;t measured yet: SOCIA hasn&apos;t sorted each post into a theme, so it can&apos;t say which theme performs best.</p>
          <ul className="iv-themes">{themes.map((t) => <li key={t.name}><b>{t.name}</b> {t.posts} posts{t.example ? `, e.g. "${t.example}"` : ""}</li>)}</ul>
        </section>
      )}
      <p className="iv-note">Per-post numbers are lifetime totals, so older posts have had longer to collect them. Medians keep one unusual post from skewing a format.</p>
    </div>
  );
}
