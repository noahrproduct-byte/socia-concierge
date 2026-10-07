"use client";

// Plan These Posts (Phase D): where this project's posts could go over the
// next two weeks, worked out in the viewer's own time zone from what's
// already on the calendar, how similar the posts are and, when there is
// enough of it, the account's posting history. Every plan shows the plan;
// Growth/Pro can put the posts in the Calendar as drafts in one go. Nothing
// is scheduled or published from here.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, Check, Clock, Loader2 } from "lucide-react";
import PlanNotice from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { TimedPost } from "@/lib/postingTimes";
import { formatClock, viewerTimeZone } from "@/lib/publishing/timing";
import { freeDays, moveTo, planPosts, type CalendarPost, type Placement, type PlanOpportunity } from "@/lib/studioClips/distribute";

type Opp = PlanOpportunity & {
  angle: string;
  build: { id: string; postId: string | null; postStatus: string | null; postAt: string | null; rendered: boolean; caption: string | null } | null;
};
type PlanData = { opportunities: Opp[]; existing: CalendarPost[]; history: TimedPost[] | null; canPlace: boolean; planError: PlanError | null };
type Placing = { phase: "idle" | "guides" | "placing" | "done" | "error"; done: number; total: number; message: string | null };

export default function PlanPanel({ projectId, stale }: { projectId: string; stale: boolean }) {
  const [data, setData] = useState<PlanData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<number, Placement>>({});
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [placing, setPlacing] = useState<Placing>({ phase: "idle", done: 0, total: 0, message: null });
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const tz = useMemo(() => viewerTimeZone() ?? "UTC", []);
  const [now] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoadErr(null);
    const res = await fetch(`/api/studio/projects/${projectId}/plan`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { setLoadErr(j?.error ?? "Couldn't read your calendar."); return; }
    setData(j as PlanData);
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  // Posts already scheduled or published stay where they are; drafts can be (re)planned.
  const locked = useMemo(() => (data?.opportunities ?? []).filter((o) => o.build?.postStatus && o.build.postStatus !== "draft"), [data]);
  const plannable = useMemo(() => (data?.opportunities ?? []).filter((o) => !locked.includes(o)), [data, locked]);
  const plan = useMemo(() => (data ? planPosts({ opportunities: plannable, existing: data.existing, history: data.history, now, tz }) : null), [data, plannable, now, tz]);
  const placements = useMemo(() => (plan ? plan.placements.map((p) => moved[p.idx] ?? p).sort((a, b) => a.at.localeCompare(b.at)) : []), [plan, moved]);
  const byIdx = useMemo(() => new Map((data?.opportunities ?? []).map((o) => [o.idx, o])), [data]);
  const chosen = placements.filter((p) => !skip.has(p.idx));

  const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(new Date(iso));

  const place = async () => {
    if (!data?.canPlace || !chosen.length) return;
    setPlanError(null);
    try {
      // Each draft carries its post's edit guide and caption, so any guide not written yet is written first.
      const missing = chosen.filter((p) => !byIdx.get(p.idx)?.build);
      for (let i = 0; i < missing.length; i++) {
        setPlacing({ phase: "guides", done: i, total: missing.length, message: byIdx.get(missing[i].idx)?.title ?? null });
        const res = await fetch(`/api/studio/projects/${projectId}/opportunities/${missing[i].idx}`, { method: "POST" });
        if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? "Couldn't write an edit guide."); }
      }
      setPlacing({ phase: "placing", done: 0, total: chosen.length, message: null });
      const res = await fetch(`/api/studio/projects/${projectId}/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ placements: chosen.map((p) => ({ idx: p.idx, at: p.at })) }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) { if (isPlanError(j)) { setPlanError(j); setPlacing({ phase: "idle", done: 0, total: 0, message: null }); return; } throw new Error(j?.error ?? "Couldn't add the drafts."); }
      const results = (j?.results ?? []) as { status: string; note: string | null }[];
      const made = results.filter((r) => r.status !== "kept").length;
      const notes = Array.from(new Set(results.map((r) => r.note).filter(Boolean)));
      setPlacing({ phase: "done", done: made, total: chosen.length, message: notes.join(" ") || null });
      setMoved({}); setSkip(new Set());
      await load();
    } catch (e) {
      setPlacing({ phase: "error", done: 0, total: 0, message: (e as Error)?.message ?? "Something went wrong." });
    }
  };

  if (loadErr) return <div className="ov-card cbp"><p className="cbb-err"><AlertTriangle size={12} /> {loadErr} <button type="button" className="cp-link" onClick={() => void load()}>Try again</button></p></div>;
  if (!data || !plan) return <div className="ov-card cbp"><p className="cbp-muted"><Loader2 size={12} className="spin" /> Reading your calendar…</p></div>;
  if (!data.opportunities.length) return null;
  const busy = placing.phase === "guides" || placing.phase === "placing";

  return (
    <section className="ov-card cbp" aria-labelledby="cbp-h">
      <div className="cbp-head">
        <h3 id="cbp-h"><CalendarDays size={15} /> Plan these posts</h3>
        <span className="cbp-muted">Next two weeks · your time zone ({tz.replace(/_/g, " ")})</span>
      </div>
      <p className="cbp-muted">{plan.timing} One post a day at most, around what's already in your Calendar, with posts that share footage kept apart.</p>
      {stale && <p className="cb-stale"><AlertTriangle size={12} /> These ideas are from before your footage changed.</p>}

      <ol className="cbp-list">
        {placements.map((p) => {
          const o = byIdx.get(p.idx)!;
          const days = freeDays({ ...plan, placements }, data.existing, now, tz, p.date);
          const off = skip.has(p.idx);
          return (
            <li key={p.idx} className={off ? "off" : ""}>
              <div className="cbp-when">
                <b>{dayLabel(p.at)}</b>
                <span className={p.timeChosen ? "" : "placeholder"}><Clock size={11} /> {formatClock(p.at, tz)}{p.timeChosen ? "" : " (placeholder)"}</span>
              </div>
              <div className="cbp-main">
                <b>{o.title}</b>
                <small>{p.reasons.join(" ")}</small>
                <div className="cbp-chips">
                  <span className={`cb-badge ${o.strength}`}>{o.strength === "strong" ? "Strong post" : "Possible post"}</span>
                  {o.build?.rendered && <span className="cb-badge built"><Check size={11} /> Video made</span>}
                  {o.build?.postStatus === "draft" && <span className="cb-badge built">Draft in Calendar{o.build.postAt ? ` · ${dayLabel(o.build.postAt)}` : ""}</span>}
                  {!o.build && <span className="cb-badge">Guide not written yet</span>}
                </div>
              </div>
              <div className="cbp-ctl">
                <select aria-label={`Day for ${o.title}`} value={p.date} disabled={busy || off} onChange={(e) => setMoved((m) => ({ ...m, [p.idx]: moveTo(p, e.target.value, data.history, tz) }))}>
                  {days.map((d) => <option key={d.date} value={d.date}>{d.label}</option>)}
                </select>
                <label className="cbp-skip"><input type="checkbox" checked={!off} disabled={busy} onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(p.idx); else n.add(p.idx); return n; })} /> Include</label>
              </div>
            </li>
          );
        })}
      </ol>

      {plan.unplaced.length > 0 && (
        <ul className="cbp-unplaced">{plan.unplaced.map((u) => <li key={u.idx}><b>{byIdx.get(u.idx)?.title}</b> {u.reason}</li>)}</ul>
      )}
      {locked.length > 0 && (
        <ul className="cbp-unplaced">{locked.map((o) => <li key={o.idx}><b>{o.title}</b> Already {o.build?.postStatus}{o.build?.postAt ? ` for ${dayLabel(o.build.postAt)}` : ""}; left where it is.</li>)}</ul>
      )}

      <div className="cbp-foot">
        {data.canPlace ? (
          placing.phase === "done" ? (
            <>
              <p className="cbb-ok"><Check size={13} /> {placing.done} draft{placing.done === 1 ? "" : "s"} in your Calendar. Nothing is scheduled: open each one in Create Post to review it, then schedule. {placing.message}</p>
              <Link className="ov-btn ghost small" href="/calendar">Open the Calendar <ArrowRight size={12} /></Link>
            </>
          ) : (
            <>
              <button type="button" className="ov-btn primary" disabled={busy || !chosen.length} onClick={() => void place()}>
                {busy ? <Loader2 size={14} className="spin" /> : <CalendarDays size={14} />} Put {chosen.length === 1 ? "this post" : `these ${chosen.length} posts`} in my Calendar as drafts
              </button>
              {placing.phase === "guides" && <span className="cbp-muted">Writing the edit guide for “{placing.message}” ({placing.done + 1} of {placing.total})…</span>}
              {placing.phase === "placing" && <span className="cbp-muted">Adding the drafts…</span>}
              {placing.phase === "error" && <p className="cbb-err"><AlertTriangle size={12} /> {placing.message}</p>}
              <p className="cbp-muted">Drafts only. Each one opens in Create Post with its caption{placements.some((p) => byIdx.get(p.idx)?.build?.rendered) ? " and video" : ""}; you choose the platforms and confirm the time there.</p>
            </>
          )
        ) : (
          <>
            {(planError ?? data.planError) ? <PlanNotice error={(planError ?? data.planError)!} compact /> : <p className="cbp-muted">Only the workspace owner or an admin can put posts in the Calendar.</p>}
            <p className="cbp-muted">Use this as your plan: open each post's guide and create it in Create Post on the day shown.</p>
          </>
        )}
      </div>
    </section>
  );
}
