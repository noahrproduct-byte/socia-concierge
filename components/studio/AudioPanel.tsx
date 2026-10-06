"use client";

// "Audio that works": what the sound of past posts did for this account, from
// two honest sources — Instagram hiding a post's file (its documented sign of
// licensed/library music) and the browser's own measurements of the files it
// could fetch. Posts are compared with each account's OWN median. Nothing here
// names a song or lists trending audio: the platforms do not expose that.
import { useCallback, useEffect, useState } from "react";
import { Music, RefreshCw, Loader2, AlertTriangle, Check, Gauge, Lock, Volume2 } from "lucide-react";
import type { AudioData } from "@/lib/audio/server";
import type { AccountAudio } from "@/lib/audio/insights";
import { measureMedia, MeasureError } from "@/lib/audio/measure";

const fmtX = (m: number | null): string => (m == null ? "—" : `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}×`);

function SplitCard({ a }: { a: AccountAudio }) {
  const whose = a.source === "own" ? "your median" : "their median";
  return (
    <div className="ov-card cba-account">
      <div className="cba-account-head">
        <b>{a.accountLabel}</b>
        <small>{a.posts} video post{a.posts === 1 ? "" : "s"}{a.baseline ? "" : " · too few results for a median"}</small>
      </div>
      <div className="cba-split">
        <div className="cba-cell">
          <span className="cba-cell-label"><Lock size={12} /> Library music</span>
          <b>{a.library.n}</b>
          <small>{a.baseline && a.library.medianMultiplier != null ? `${fmtX(a.library.medianMultiplier)} ${whose}` : a.library.n ? "file hidden by Instagram" : "none"}</small>
        </div>
        <div className="cba-cell">
          <span className="cba-cell-label"><Volume2 size={12} /> Original audio</span>
          <b>{a.original.n}</b>
          <small>{a.baseline && a.original.medianMultiplier != null ? `${fmtX(a.original.medianMultiplier)} ${whose}` : a.original.n ? `${a.pending ? `${a.pending} not measured yet` : "measured"}` : "none"}</small>
        </div>
      </div>
      {a.profile && (
        <p className="cba-profile">
          <Gauge size={12} /> Best measured posts ({a.profile.basedOn}): {a.profile.energy ? `${a.profile.energy} energy` : "energy unknown"}
          {a.profile.bpmRange ? ` · ${a.profile.bpmRange[0]}–${a.profile.bpmRange[1]} BPM` : " · no steady beat found"}
          {a.profile.musicShare != null ? ` · music likely in ${Math.round(a.profile.musicShare * 100)}%` : ""}
          {a.profile.audibleShare != null ? ` · sound ${Math.round(a.profile.audibleShare * 100)}% of the time` : ""}
        </p>
      )}
    </div>
  );
}

export default function AudioPanel({ canEdit, current, onUse, fixture }: { canEdit: boolean; current: string | null; onUse: (line: string) => void; fixture?: AudioData }) {
  const [data, setData] = useState<AudioData | null>(fixture ?? null);
  const [loading, setLoading] = useState(!fixture);
  const [err, setErr] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState<{ done: number; total: number; label: string } | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (fixture) return;
    setLoading(true); setErr(null);
    const res = await fetch(`/api/studio/audio${refresh ? "?refresh=1" : ""}`).catch(() => null);
    const j = await res?.json().catch(() => null);
    setLoading(false);
    if (!res || !res.ok) { setErr(j?.error ?? "Couldn't load audio insights."); return; }
    setData(j);
  }, [fixture]);

  useEffect(() => { void load(); }, [load]);

  const measureAll = async () => {
    if (!data?.pending.length || fixture) return;
    const list = data.pending;
    setMeasuring({ done: 0, total: list.length, label: list[0].label });
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      setMeasuring({ done: i, total: list.length, label: p.label });
      try {
        const features = await measureMedia(p.mediaId);
        await fetch("/api/studio/audio/measure", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaId: p.mediaId, features }) });
      } catch (e) {
        const msg = e instanceof MeasureError ? e.message : "Couldn't measure this post.";
        await fetch("/api/studio/audio/measure", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaId: p.mediaId, error: msg }) }).catch(() => null);
      }
    }
    setMeasuring(null);
    await load();
  };

  if (loading && !data) return <div className="ov-card st-progress"><ul><li className="on"><i />Reading what sound has done for your posts</li></ul></div>;
  if (err && !data) return <div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Audio insights unavailable</b><p>{err}</p></div></div>;
  if (!data) return null;

  const { insights, pending, competitors } = data;
  const inUse = current != null && current === insights.recommendation;

  return (
    <div className="cba">
      <div className="ov-card cba-reco">
        <h3><Music size={14} /> What sound has worked for you</h3>
        <p className="cba-reco-text">{insights.recommendation}</p>
        {insights.evidence.length > 0 && <ul className="cba-evidence">{insights.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="st-row-actions">
          {insights.own?.baseline && canEdit && (
            <button type="button" className="ov-btn primary small" disabled={inUse} onClick={() => onUse(insights.recommendation)}>{inUse ? <><Check size={12} /> Used as this cut's music line</> : "Use as this cut's music line"}</button>
          )}
          {pending.length > 0 && (
            <button type="button" className="ov-btn ghost small" disabled={Boolean(measuring)} onClick={() => void measureAll()}>
              {measuring ? <><Loader2 size={12} className="spin" /> Measuring {measuring.done + 1}/{measuring.total} · {measuring.label}</> : <><Gauge size={12} /> Measure {pending.length} post{pending.length === 1 ? "" : "s"} on this device</>}
            </button>
          )}
          <button type="button" className="ov-btn ghost small" disabled={loading || Boolean(measuring)} onClick={() => void load(true)}><RefreshCw size={12} className={loading ? "spin" : undefined} /> Refresh</button>
        </div>
        <p className="ov-source">
          {insights.coverage.total} video posts · {insights.coverage.library} used library music (Instagram hides those files, so only the fact is known) · {insights.coverage.measured} measured · {insights.coverage.pending} waiting{insights.coverage.failed ? ` · ${insights.coverage.failed} couldn't be measured` : ""}.
          {" "}Posts are compared with each account's own median. SOCIA can't name tracks or see trending audio — the platforms don't expose them.
        </p>
      </div>

      {insights.own && <SplitCard a={insights.own} />}

      <div className="cba-competitors">
        <h4>Competitors</h4>
        {!competitors.enabled ? (
          <p className="ov-source">{competitors.reason ?? "Competitor posts need a connected Facebook Page (Business Discovery)."}</p>
        ) : insights.accounts.filter((a) => a.source === "competitor").length ? (
          insights.accounts.filter((a) => a.source === "competitor").map((a) => <SplitCard key={a.accountKey} a={a} />)
        ) : (
          <p className="ov-source">No tracked Instagram competitors with video posts yet. Track some on the Competitors page, then Refresh.</p>
        )}
      </div>
    </div>
  );
}
