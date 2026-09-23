"use client";

// One niche post, in halves that never mix: the observed public data, the
// deterministic baseline, SOCIA's reading of the real thumbnail and title
// (labelled), an interpretation, at most three lessons, and real actions.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, ExternalLink, Info, Loader2, Sparkles, FileText } from "lucide-react";
import Drawer from "@/components/ov/Drawer";
import { askSocia } from "@/lib/ask";
import { baselineText, type NichePost } from "@/lib/nicheTrends";
import type { AnalyzeResponse } from "@/app/api/niche/analyze/route";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import PlanNotice from "@/components/PlanNotice";
import { PlatformMark, fmtDate, fmtN, platName } from "./shared";

const cache = new Map<string, AnalyzeResponse>();

export default function NicheDrawer({ post, saved, onToggleSave, saving, onClose }: {
  post: NichePost | null; saved: boolean; onToggleSave: (p: NichePost) => void; saving: boolean; onClose: () => void;
}) {
  const [res, setRes] = useState<AnalyzeResponse | null>(null);
  // A plan refusal is not an analysis result: it is never cached, so the
  // reading appears as soon as the plan allows it.
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!post) { setRes(null); setPlanError(null); return; }
    setPlanError(null);
    const hit = cache.get(post.url);
    if (hit) { setRes(hit); return; }
    let alive = true;
    setBusy(true); setRes(null);
    fetch("/api/niche/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post }) })
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok && isPlanError(j)) { setPlanError(j); return; }
        const doc = j as AnalyzeResponse;
        if (r.ok) cache.set(post.url, doc);
        setRes(doc);
      })
      .catch(() => { if (alive) setRes({ durationSec: null, analysis: null, error: "SOCIA couldn't analyse this post right now.", cached: false }); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [post]);

  if (!post) return <Drawer open={false} title="Post analysis" onClose={onClose}>{null}</Drawer>;
  const base = baselineText(post);
  const a = res?.analysis ?? null;
  const observedLine = `${fmtN(post.views)} views, ${fmtN(post.likes)} likes, ${fmtN(post.comments)} comments${post.multiplier != null ? `, ${post.multiplier.toFixed(1)}× the creator's median` : ""}`;
  const question = `Create my version of this ${post.format ?? "post"}: "${post.title ?? post.url}"${post.accountName ? ` by ${post.accountName}` : ""}. Observed: ${observedLine}${post.tags.length ? `; title features: ${post.tags.join(", ")}` : ""}. Give me the hook, a shot list, on-screen text, the caption and the call to action for my own account.`;
  const planNote = `Inspired by "${(post.title ?? post.url).slice(0, 70)}"${post.accountName ? ` (${post.accountName})` : ""}${post.multiplier != null ? `, ${post.multiplier.toFixed(1)}× that creator's median` : ""}: ${a?.your_version ?? "make my own version of this format."}`;
  const structure: [string, string | null][] = a ? [
    ["First-frame subject", a.structure.first_frame_subject], ["Hook", a.structure.hook], ["People visible", a.structure.people_visible],
    ["Product visible", a.structure.product_visible], ["Location reference", a.structure.location_reference], ["Call to action", a.structure.cta],
    ["On-screen text", a.structure.on_screen_text],
  ] : [];

  return (
    <Drawer open title="Post analysis" onClose={onClose} width={520}>
      <div className="cx-nd">
        <div className="cx-nd-media">
          {post.thumb
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={post.thumb} alt="" />
            : <span className="cx-nd-ph"><PlatformMark p={post.platform} size={22} /></span>}
          <span className="cx-ncard-plat"><PlatformMark p={post.platform} size={11} /></span>
        </div>
        <h3 className="cx-dr-title">{post.title ?? "(untitled)"}</h3>
        <p className="cx-dr-sub">{post.accountName ?? "Unknown creator"} · {platName(post.platform)}{post.format ? ` ${post.format}` : ""}{post.publishedAt ? ` · ${fmtDate(post.publishedAt, true)}` : ""}</p>

        <section className="cx-nd-sec">
          <h4>Observed data</h4>
          <dl className="cx-nd-stats">
            <div><dt>Views</dt><dd>{fmtN(post.views)}</dd></div>
            <div><dt>Likes</dt><dd>{fmtN(post.likes)}</dd></div>
            <div><dt>Comments</dt><dd>{fmtN(post.comments)}</dd></div>
            <div><dt>Date</dt><dd>{fmtDate(post.publishedAt)}</dd></div>
            <div><dt>Platform</dt><dd>{platName(post.platform)}</dd></div>
            <div><dt>Format</dt><dd>{post.format ?? "—"}</dd></div>
            <div><dt>Length</dt><dd>{res?.durationSec != null ? `${Math.round(res.durationSec)}s` : busy ? <Loader2 size={11} className="cx-spin" /> : "—"}</dd></div>
            <div><dt>Performance</dt><dd className={post.multiplier != null ? "up" : ""}>{post.multiplier != null ? `${post.multiplier.toFixed(1)}×` : "—"}</dd></div>
          </dl>
          {base ? (
            <p className="cx-nd-note" title="This post's views ÷ the median views of the creator's recent uploads. Both are public numbers.">
              <Info size={11} /> {post.multiplier!.toFixed(1)}× above creator baseline: {base.post} against a recent-upload median of {base.median}.
            </p>
          ) : <p className="cx-nd-note"><Info size={11} /> Creator baseline not available, so no multiple is claimed. Counts are the platform&apos;s public numbers{post.dataSource === "web_research" ? "; this link came from web research and carries none" : ""}.</p>}
        </section>

        <section className="cx-nd-sec">
          <h4>Content structure <small>read from the thumbnail and title</small></h4>
          {busy && !a && <div className="cx-nd-skel"><span /><span /><span /><span /></div>}
          {!busy && !a && planError && <PlanNotice error={planError} compact />}
          {!busy && !a && !planError && <p className="cx-empty small">{res?.error ?? "Not analysed."}</p>}
          {a && (
            <dl className="cx-nd-struct">
              {structure.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}
              {post.tags.length > 0 && <div><dt>Title features</dt><dd>{post.tags.join(" · ")}</dd></div>}
            </dl>
          )}
        </section>

        {/* The notice above says it once; the reading sections below stay quiet when the plan is the reason. */}
        {(!planError || post.why) && (
          <section className="cx-nd-sec ai">
            <h4>SOCIA interpretation</h4>
            {a ? <p className="cx-nd-interp">{a.interpretation}</p> : busy ? <div className="cx-nd-skel two"><span /><span /></div> : post.why ? <p className="cx-nd-interp">{post.why}</p> : <p className="cx-empty small">{res?.error ?? "No interpretation yet."}</p>}
          </section>
        )}

        {!planError && (
          <section className="cx-nd-sec">
            <h4>What you can learn</h4>
            {a?.lessons?.length ? <ol className="cx-nd-lessons">{a.lessons.map((l) => <li key={l}>{l}</li>)}</ol>
              : busy ? <div className="cx-nd-skel two"><span /><span /></div>
              : <p className="cx-empty small">{res?.error ?? "Lessons appear once the post is analysed."}</p>}
            {a?.your_version && <p className="cx-nd-version"><b>Your version:</b> {a.your_version}</p>}
          </section>
        )}

        <div className="cx-nd-actions">
          <button type="button" className="ov-btn primary" onClick={() => askSocia({ question, autoSend: true, context: { page: "competitors", competitorName: post.accountName ?? undefined, competitorPlatform: post.platform }, contextLabel: `Post: ${(post.title ?? post.url).slice(0, 40)}` })}><Sparkles size={13} /> Create your version</button>
          <Link href={`/tool?note=${encodeURIComponent(planNote)}`} className="ov-btn ghost"><FileText size={13} /> Add to Content Plan</Link>
          <button type="button" className={`ov-btn ghost${saved ? " on" : ""}`} onClick={() => onToggleSave(post)} disabled={saving}>{saving ? <Loader2 size={13} className="cx-spin" /> : saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />} {saved ? "Saved" : "Save"}</button>
          <a href={post.url} target="_blank" rel="noreferrer" className="ov-btn ghost"><ExternalLink size={13} /> View original</a>
        </div>
      </div>
    </Drawer>
  );
}
