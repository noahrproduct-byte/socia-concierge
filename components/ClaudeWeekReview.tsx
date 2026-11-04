"use client";

// Calendar: the videos the person's own Claude made for this week's plan and
// handed in (lib/claudeWeek). Each one plays here; approving schedules it at
// its planned time, sending back returns it to Claude with a note. Nothing
// posts before it's approved. Only shown while something is waiting.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ReviewItem, ReviewResult } from "@/lib/claudeWeek/server";
import { formatWhen, viewerTimeZone } from "@/lib/publishing/timing";
import { PLATFORM_LABEL } from "@/lib/publishing/types";

async function review(postIds: string[], action: "approve" | "reject", note?: string): Promise<{ results: ReviewResult[]; error: string | null }> {
  const r = await fetch("/api/claude-week/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_ids: postIds, action, note }) }).catch(() => null);
  const j = (r ? await r.json().catch(() => ({})) : {}) as { results?: ReviewResult[]; error?: string };
  if (!r) return { results: [], error: "Check your connection and try again." };
  return { results: j.results ?? [], error: r.ok ? null : j.error ?? "SOCIA couldn't do that just now. Try again." };
}

function Row({ item, canApprove, tz, onDone }: { item: ReviewItem; canApprove: boolean; tz: string | null; onDone: (id: string, message: string) => void }) {
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "return">(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setBusy("approve"); setError(null);
    const { results, error: e } = await review([item.postId], "approve");
    setBusy(null);
    const r = results[0];
    if (e || !r?.ok) { setError(e ?? r?.error ?? "It couldn't be scheduled."); return; }
    onDone(item.postId, `Approved: “${item.title}” is scheduled for ${tz && r.scheduled_for ? formatWhen(r.scheduled_for, new Date(), tz) : "its planned time"}.`);
  };

  const sendBack = async () => {
    setBusy("return"); setError(null);
    const { results, error: e } = await review([item.postId], "reject", note);
    setBusy(null);
    if (e || !results[0]?.ok) { setError(e ?? results[0]?.error ?? "It couldn't be sent back."); return; }
    onDone(item.postId, `Sent back to your Claude: “${item.title}”. It makes a new version the next time it runs.`);
  };

  return (
    <li className="ca-row">
      {item.videoUrl ? <video className="cwr-video" src={item.videoUrl} controls playsInline preload="metadata" aria-label={`Video: ${item.title}`} /> : null}
      <div className="ca-body">
        <b>{item.title}</b>
        <small>
          {item.platforms.map((p) => PLATFORM_LABEL[p]).join(", ") || "No platform"}
          {item.goesOutAt ? ` · Goes out ${tz ? formatWhen(item.goesOutAt, new Date(), tz) : "…"} once approved` : ""}
        </small>
        {item.caption && <p className="ca-excerpt">{item.caption}</p>}
        {!canApprove ? (
          <small className="ca-hint">The owner or an Admin approves these.</small>
        ) : !returning ? (
          <div className="ca-actions">
            {item.manual ? (
              <Link href={`/create?post=${encodeURIComponent(item.postId)}`} className="btn-primary sm">Finish in Create post</Link>
            ) : (
              <button type="button" className="btn-primary sm" disabled={busy !== null} onClick={() => void approve()}>
                {busy === "approve" ? <Loader2 size={13} className="cr-spin" /> : null} Approve
              </button>
            )}
            <button type="button" className="btn-secondary sm" disabled={busy !== null} onClick={() => setReturning(true)}>Send back</button>
          </div>
        ) : (
          <div className="ca-return">
            <textarea className="cp-input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should Claude change?" aria-label="What should Claude change" autoFocus />
            <div className="ca-actions">
              <button type="button" className="btn-secondary sm" onClick={() => setReturning(false)}>Cancel</button>
              <button type="button" className="btn-primary sm" disabled={!note.trim() || busy !== null} onClick={() => void sendBack()}>
                {busy === "return" ? <Loader2 size={13} className="cr-spin" /> : null} Send back
              </button>
            </div>
          </div>
        )}
        {item.manual && canApprove && <small className="ca-hint">YouTube and TikTok posts are finished in Create post: their upload runs in your browser.</small>}
        {error && <p className="ca-err" role="alert">{error}</p>}
      </div>
    </li>
  );
}

export default function ClaudeWeekReview({ items: initial, canApprove }: { items: ReviewItem[]; canApprove: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [tz, setTz] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setTz(viewerTimeZone() ?? "UTC"), []);

  if (!items.length && !notice) return null;
  const approvable = items.filter((i) => !i.manual);

  const done = (id: string, message: string) => {
    setItems((xs) => xs.filter((x) => x.postId !== id));
    setNotice(message);
    router.refresh();
  };

  const approveAll = async () => {
    setBusy(true); setError(null);
    const { results, error: e } = await review(approvable.map((i) => i.postId), "approve");
    setBusy(false);
    if (e) { setError(e); return; }
    const ok = results.filter((r) => r.ok).map((r) => r.post_id);
    const failed = results.filter((r) => !r.ok);
    setItems((xs) => xs.filter((x) => !ok.includes(x.postId)));
    setNotice(`Approved ${ok.length} ${ok.length === 1 ? "video" : "videos"}: each is scheduled for its planned time.`);
    if (failed.length) setError(`${failed.length} couldn't be scheduled: ${failed[0].error ?? "try them one by one"}`);
    router.refresh();
  };

  return (
    <section className="ov-card ca cwr" aria-labelledby="cwr-h">
      <div className="cwr-head">
        <div>
          <h2 id="cwr-h">Made by your Claude</h2>
          <p>{items.length ? `${items.length} ${items.length === 1 ? "video" : "videos"} for this week's plan, waiting for your review. Nothing posts until you approve it.` : "Nothing else is waiting for review."}</p>
        </div>
        {canApprove && approvable.length > 1 && (
          <button type="button" className="btn-primary sm" disabled={busy} onClick={() => void approveAll()}>
            {busy ? <Loader2 size={13} className="cr-spin" /> : null} Approve all {approvable.length}
          </button>
        )}
      </div>
      {notice && <p className="ca-notice" role="status">{notice}</p>}
      {error && <p className="ca-err" role="alert">{error}</p>}
      {items.length > 0 && (
        <ul className="ca-list">
          {items.map((i) => <Row key={i.postId} item={i} canApprove={canApprove} tz={tz} onDone={done} />)}
        </ul>
      )}
    </section>
  );
}
