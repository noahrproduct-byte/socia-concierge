"use client";

// Ask SOCIA's schedule proposal: the posts the person meant, where each is
// now and where it would go (times worked out by lib/assistant/reschedule.ts,
// never by the model), and one button. Nothing changes until it is pressed.
// Drafts with no platforms yet take the accounts chosen here; posts that
// already have platforms keep theirs and only move in time.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Loader2 } from "lucide-react";
import type { AskProposal } from "@/lib/ask";
import { availabilityFor } from "@/lib/publishing/capabilities";
import { defaultSettings, PLATFORM_LABEL, type ContentItem, type DestinationSettings, type FacebookSettings, type InstagramSettings, type Platform, type YouTubeSettings } from "@/lib/publishing/types";
import type { PickerAccount } from "@/lib/publishing/composer";
import { postLabel } from "@/lib/publishing/postLabel";
import { schedulePost, type ScheduleMedia } from "@/lib/publishing/scheduleClient";
import { formatClock, viewerTimeZone } from "@/lib/publishing/timing";

type Proposal = Extract<AskProposal, { kind: "schedule" }>;
type Outcome = { ok: boolean; text: string };

/** Platforms a batch of new posts can go to from here (TikTok asks who can see each post: Create Post). */
const ASSIGNABLE: Platform[] = ["instagram", "youtube", "facebook"];

const ytTitle = (s: string) => s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);

export default function ScheduleProposal({ p }: { p: Proposal }) {
  const tz = useMemo(() => viewerTimeZone() ?? "UTC", []);
  const needsPlatforms = p.items.some((i) => i.platforms.length === 0 && !(i.legacy && i.status === "scheduled"));
  const [accounts, setAccounts] = useState<PickerAccount[] | null>(null);
  const [dest, setDest] = useState<Set<string>>(new Set());
  const [kids, setKids] = useState<boolean | null>(null);
  // A kept thread re-shows this card after a reload: remember that it was already used.
  const doneKey = `socia-ask-sched:${p.items.map((i) => `${i.postId}@${i.at}`).join(",")}`;
  const [phase, setPhase] = useState<"idle" | "busy" | "done">("idle");
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(doneKey);
      if (saved) { setOutcomes(JSON.parse(saved) as Record<string, Outcome>); setPhase("done"); }
    } catch { /* storage unavailable */ }
  }, [doneKey]);

  useEffect(() => {
    if (!needsPlatforms) return;
    let alive = true;
    (async () => {
      const res = await fetch("/api/publishing/accounts").catch(() => null);
      const j = res?.ok ? ((await res.json().catch(() => null)) as { accounts?: PickerAccount[] } | null) : null;
      if (!alive) return;
      const list = (j?.accounts ?? []).filter((a) => ASSIGNABLE.includes(a.platform));
      setAccounts(list);
      setDest(new Set(list.filter((a) => availabilityFor(a.platform, a).state === "available").map((a) => `${a.platform}:${a.accountId}`)));
    })();
    return () => { alive = false; };
  }, [needsPlatforms]);

  const chosen = (accounts ?? []).filter((a) => dest.has(`${a.platform}:${a.accountId}`));
  const wantsYouTube = chosen.some((a) => a.platform === "youtube");
  const ready = !needsPlatforms || (chosen.length > 0 && (!wantsYouTube || kids != null));
  const day = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(new Date(iso));
  const moving = p.items.filter((i) => i.status === "scheduled").length;

  const settingsFor = (platform: Platform, title: string): DestinationSettings => {
    if (platform === "youtube") return { ...(defaultSettings("youtube") as YouTubeSettings), title: ytTitle(title), madeForKids: kids, privacy: "public" };
    if (platform === "instagram") return { ...(defaultSettings("instagram") as InstagramSettings), format: "reel" };
    if (platform === "facebook") return { ...(defaultSettings("facebook") as FacebookSettings), format: "reel" };
    return defaultSettings(platform);
  };

  const apply = async () => {
    setPhase("busy");
    const results: Record<string, Outcome> = {};
    for (const it of p.items) {
      let out: Outcome;
      try {
        if (it.legacy && it.status === "scheduled") {
          // A calendar post saved before multi-platform publishing moves by time alone.
          const res = await fetch("/api/schedule", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: it.postId, scheduled_at: it.at }) });
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          out = res.ok ? { ok: true, text: "Moved." } : { ok: false, text: j?.error ?? "Couldn't move it." };
        } else {
          const res = await fetch(`/api/posts/${encodeURIComponent(it.postId)}`);
          const j = (await res.json().catch(() => null)) as { item?: ContentItem; error?: string } | null;
          const item = j?.item;
          if (!res.ok || !item) throw new Error(j?.error ?? "Couldn't open the post.");
          if (!item.media.length) throw new Error("It has no video or photo yet. Add one in Create Post.");
          const live = item.destinations.filter((d) => d.status !== "cancelled");
          const title = postLabel(item.caption, live) ?? it.title;
          const destinations = live.length
            ? live.map((d) => ({ platform: d.platform, accountId: d.accountId, settings: d.settings }))
            : chosen.map((a) => ({ platform: a.platform, accountId: a.accountId, settings: settingsFor(a.platform, title) }));
          if (!destinations.length) throw new Error("Choose where it posts.");
          const media: ScheduleMedia[] = item.media.map((m) => ({ id: m.id, kind: m.kind === "image" ? "image" : "video", name: m.name, mime: m.mime, size: m.size, width: m.width, height: m.height, duration: m.duration, path: m.path }));
          const r = await schedulePost({ postId: item.id, caption: item.caption, media, at: it.at, destinations, source: "calendar", mediaUrl: item.media[0]?.url ?? null });
          out = { ok: r.ok, text: it.status === "scheduled" && r.ok ? "Moved." : r.text };
        }
      } catch (e) {
        out = { ok: false, text: (e as Error)?.message || "Couldn't schedule it." };
      }
      results[it.postId] = out;
      setOutcomes({ ...results });
    }
    try { window.sessionStorage.setItem(doneKey, JSON.stringify(results)); } catch { /* storage unavailable */ }
    setPhase("done");
  };

  const doneOk = Object.values(outcomes).filter((o) => o.ok).length;

  return (
    <div className="ask-proposal ask-sched">
      <small><CalendarClock size={12} /> {p.items.length ? "Proposed schedule" : "Scheduling"}</small>
      <p className="ask-why">{p.summary}</p>
      {p.items.length > 0 && (
        <ol className="ask-sched-list">
          {p.items.map((it) => {
            const o = outcomes[it.postId];
            return (
              <li key={it.postId}>
                <span className="ask-sched-when"><b>{day(it.at)}</b><em>{formatClock(it.at, tz)}</em></span>
                <span className="ask-sched-what">
                  <b>{it.title}</b>
                  <em>{it.from ? `Now ${day(it.from)}, ${formatClock(it.from, tz)}. ` : "Draft. "}{it.platforms.length ? it.platforms.map((x) => PLATFORM_LABEL[x as Platform] ?? x).join(", ") : it.legacy && it.status === "scheduled" ? "Instagram" : "Platforms chosen below"}</em>
                  {o && <em className={o.ok ? "ok" : "bad"}>{o.ok ? <Check size={11} /> : <AlertTriangle size={11} />} {o.text}</em>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {p.left.length > 0 && (
        <ul className="ask-sched-left">{p.left.map((l, i) => <li key={i}><b>{l.title}</b> {l.reason}</li>)}</ul>
      )}

      {p.items.length > 0 && needsPlatforms && phase === "idle" && (
        <div className="ask-sched-dest">
          <small>Drafts without platforms post to</small>
          {accounts == null ? <span className="ask-sched-muted"><Loader2 size={11} className="spin" /> Reading your accounts…</span> : accounts.length === 0 ? <span className="ask-sched-muted">No accounts connected. <Link href="/settings">Connect one in Settings</Link>.</span> : accounts.map((a) => {
            const k = `${a.platform}:${a.accountId}`;
            const av = availabilityFor(a.platform, a);
            return (
              <label key={k} className={av.state === "available" ? "" : "off"} title={av.state === "available" ? undefined : av.reason}>
                <input type="checkbox" checked={dest.has(k)} disabled={av.state !== "available"} onChange={(e) => setDest((s) => { const n = new Set(s); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />
                {PLATFORM_LABEL[a.platform]} · {a.label}{av.state === "available" ? "" : ` (${av.reason})`}
              </label>
            );
          })}
          {wantsYouTube && (
            <div className="ask-sched-kids" role="radiogroup" aria-label="Made for kids">
              <span>YouTube: made for kids?</span>
              <label><input type="radio" name={`kids-${p.items[0].postId}`} checked={kids === false} onChange={() => setKids(false)} /> No</label>
              <label><input type="radio" name={`kids-${p.items[0].postId}`} checked={kids === true} onChange={() => setKids(true)} /> Yes</label>
            </div>
          )}
        </div>
      )}

      {p.items.length > 0 && (
        <div className="ask-proposal-actions">
          {phase === "idle" && (
            <button type="button" className="ov-btn primary small" disabled={!ready} onClick={() => void apply()}>
              {moving === p.items.length ? `Move ${p.items.length === 1 ? "it" : `these ${p.items.length}`}` : `Schedule ${p.items.length === 1 ? "it" : `these ${p.items.length}`}`}
            </button>
          )}
          {phase === "busy" && <span className="ask-sched-muted"><Loader2 size={12} className="spin" /> Scheduling{wantsYouTube ? " and uploading to YouTube" : ""}. Keep this open.</span>}
          {phase === "done" && <span className="ask-sched-muted">{doneOk} of {p.items.length} done.</span>}
          <Link href="/plan/calendar" className="ov-btn ghost small">Open the Calendar <ArrowRight size={12} /></Link>
        </div>
      )}
      {phase === "idle" && p.items.length > 0 && <p className="ask-sched-muted">Nothing changes until you press the button. They publish on their own at these times.</p>}
    </div>
  );
}
