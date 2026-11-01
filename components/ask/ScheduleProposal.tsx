"use client";

// Ask SOCIA's schedule proposal: the posts the person meant, where each is
// now and where it would go (times worked out by lib/assistant/reschedule.ts,
// never by the model), and one button. Nothing changes until it is pressed.
// Drafts with no platforms yet take the accounts chosen here; posts that
// already have platforms keep theirs and only move in time. A video rated in
// Content Studio becomes a post here, on the press, from the file in this tab.
// Instagram choices said in the chat (a Trial Reel, collaborators) are shown
// as ticked boxes; collaborators are checked with Instagram before the button
// works, and a pair Instagram hasn't been verified to take together is refused.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Loader2 } from "lucide-react";
import type { AskProposal } from "@/lib/ask";
import { availabilityFor, pairState } from "@/lib/publishing/capabilities";
import { defaultSettings, PLATFORM_LABEL, type CollaboratorsCheck, type ContentItem, type DestinationSettings, type FacebookSettings, type InstagramSettings, type Platform, type YouTubeSettings } from "@/lib/publishing/types";
import { createClient } from "@/lib/supabase/client";
import { normalizeUsername } from "@/lib/publishing/igRules";
import { removePostUpload, uploadForPost } from "@/lib/publishing/uploadForPost";
import { withInstagramAsk, type AskInstagram } from "@/lib/assistant/askExtras";
import { forgetRated, ratedFile } from "@/lib/assistant/rated";
import type { PickerAccount } from "@/lib/publishing/composer";
import { postLabel } from "@/lib/publishing/postLabel";
import { schedulePost, type ScheduleMedia } from "@/lib/publishing/scheduleClient";
import { formatClock, viewerTimeZone } from "@/lib/publishing/timing";

type Proposal = Extract<AskProposal, { kind: "schedule" }>;
type Outcome = { ok: boolean; text: string };

/** Platforms a batch of new posts can go to from here (TikTok asks who can see each post: Create Post). */
const ASSIGNABLE: Platform[] = ["instagram", "youtube", "facebook"];

const ytTitle = (s: string) => s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
const sortedNames = (list: string[]) => Array.from(new Set(list.map(normalizeUsername))).sort();
/** Instagram hasn't been verified to take collaborators on a Trial Reel through SOCIA (lib/publishing/capabilities.ts). */
const TRIAL_COLLAB = pairState("instagram", "trialReel", "collaborators");

async function checkWithInstagram(accountId: string, usernames: string[]): Promise<CollaboratorsCheck> {
  const res = await fetch("/api/publishing/instagram/collaborators", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, usernames }) }).catch(() => null);
  const j = (await res?.json().catch(() => null)) as CollaboratorsCheck | { error?: string } | null;
  return res?.ok && j && "status" in j ? j : { usernames, status: "error", message: (j as { error?: string } | null)?.error ?? "SOCIA couldn't reach Instagram to check.", at: new Date().toISOString() };
}

export default function ScheduleProposal({ p }: { p: Proposal }) {
  const tz = useMemo(() => viewerTimeZone() ?? "UTC", []);
  const needsPlatforms = p.items.some((i) => i.platforms.length === 0 && !(i.legacy && i.status === "scheduled"));
  const [accounts, setAccounts] = useState<PickerAccount[] | null>(null);
  const [dest, setDest] = useState<Set<string>>(new Set());
  const [kids, setKids] = useState<boolean | null>(null);
  const ia = p.instagram ?? null;
  const [useTrial, setUseTrial] = useState(true);
  const [useCollabs, setUseCollabs] = useState(true);
  const ask: AskInstagram | null = ia ? { trial: useTrial ? ia.trial : null, collaborators: useCollabs ? ia.collaborators : [], notes: ia.notes } : null;
  const trialOn = Boolean(ask?.trial && ask.trial !== "off");
  const pairBlocked = trialOn && (ask?.collaborators.length ?? 0) > 0 && TRIAL_COLLAB != null && TRIAL_COLLAB.state !== "supported";
  // Collaborator checks with Instagram, by account and list.
  const [checks, setChecks] = useState<Record<string, CollaboratorsCheck | "checking">>({});
  const checkKey = (accountId: string, names: string[]) => `${accountId}|${names.join(",")}`;
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
  const askNames = sortedNames(ask?.collaborators ?? []);
  const igChosen = chosen.filter((a) => a.platform === "instagram");
  const igKey = igChosen.map((a) => a.accountId).join(",");
  // New posts (drafts and rated videos) go out with exactly the named collaborators: check them now, before the button.
  useEffect(() => {
    if (!askNames.length || !igChosen.length) return;
    for (const a of igChosen) {
      const k = checkKey(a.accountId, askNames);
      if (checks[k]) continue;
      setChecks((c) => ({ ...c, [k]: "checking" }));
      void checkWithInstagram(a.accountId, askNames).then((r) => setChecks((c) => ({ ...c, [k]: r })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igKey, askNames.join(",")]);
  const newChecks = askNames.length && needsPlatforms ? igChosen.map((a) => ({ a, c: checks[checkKey(a.accountId, askNames)] })) : [];
  const collabWaiting = newChecks.some((x) => !x.c || x.c === "checking");
  const collabRefused = newChecks.find((x) => x.c && x.c !== "checking" && x.c.status === "rejected");
  const wantsYouTube = chosen.some((a) => a.platform === "youtube");
  const ready = (!needsPlatforms || (chosen.length > 0 && (!wantsYouTube || kids != null))) && !pairBlocked && !collabWaiting && !collabRefused;
  const day = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(new Date(iso));
  const moving = p.items.filter((i) => i.status === "scheduled").length;

  const settingsFor = (platform: Platform, title: string, accountIdFor?: string): DestinationSettings => {
    if (platform === "youtube") return { ...(defaultSettings("youtube") as YouTubeSettings), title: ytTitle(title), madeForKids: kids, privacy: "public" };
    if (platform === "instagram") {
      const base: InstagramSettings = { ...(defaultSettings("instagram") as InstagramSettings), format: "reel" };
      if (!ask) return base;
      const c = checks[checkKey(accountIdFor ?? "", askNames)];
      return withInstagramAsk(base, ask, c && c !== "checking" ? c : null);
    }
    if (platform === "facebook") return { ...(defaultSettings("facebook") as FacebookSettings), format: "reel" };
    return defaultSettings(platform);
  };

  // A post that already has Instagram gets the asked choices on top of its own settings (its collaborators stay).
  const instagramFor = async (accountId: string, s: InstagramSettings): Promise<InstagramSettings> => {
    if (!ask) return s;
    const names = sortedNames(withInstagramAsk(s, ask, null).collaborators ?? []);
    if (!ask.collaborators.length || !names.length) return withInstagramAsk(s, ask, null);
    const k = checkKey(accountId, names);
    const known = checks[k];
    const check = known && known !== "checking" ? known : await checkWithInstagram(accountId, names);
    return withInstagramAsk(s, ask, check);
  };

  const scheduleRated = async (it: Proposal["items"][number]): Promise<Outcome> => {
    const r = ratedFile(it.rated!);
    if (!r) throw new Error("This video isn't open in this tab any more. Rate it again in Content Studio, then ask again.");
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) throw new Error("You're signed out. Sign in again to schedule it.");
    const title = postLabel(r.video.caption, []) ?? it.title;
    const destinations = chosen.map((a) => ({ platform: a.platform, accountId: a.accountId, settings: settingsFor(a.platform, title, a.accountId) }));
    if (!destinations.length) throw new Error("Choose where it posts.");
    const up = await uploadForPost(r.file, user.id);
    const m = up.media;
    const media: ScheduleMedia[] = [{ id: m.id, kind: m.kind === "image" ? "image" : "video", name: m.name, mime: m.mime, size: m.size, width: m.width, height: m.height, duration: m.duration, path: m.path }];
    const res = await schedulePost({ postId: null, caption: r.video.caption, media, at: it.at, destinations, source: "studio", blob: up.file });
    // No post was saved: the upload doesn't stay in storage.
    if (!res.postId) { if (m.path) await removePostUpload(m.path); }
    else forgetRated(it.rated!);
    return { ok: res.ok, text: res.text };
  };

  const apply = async () => {
    setPhase("busy");
    const results: Record<string, Outcome> = {};
    for (const it of p.items) {
      let out: Outcome;
      try {
        if (it.rated) {
          out = await scheduleRated(it);
        } else if (it.legacy && it.status === "scheduled") {
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
            ? await Promise.all(live.map(async (d) => ({ platform: d.platform, accountId: d.accountId, settings: d.platform === "instagram" ? await instagramFor(d.accountId, d.settings as InstagramSettings) : d.settings })))
            : chosen.map((a) => ({ platform: a.platform, accountId: a.accountId, settings: settingsFor(a.platform, title, a.accountId) }));
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
                  <em>{it.from ? `Now ${day(it.from)}, ${formatClock(it.from, tz)}. ` : it.rated ? (ratedFile(it.rated)?.video.caption ? "Rated in Studio, with your caption. " : "Rated in Studio, no caption yet. ") : "Draft. "}{it.platforms.length ? it.platforms.map((x) => PLATFORM_LABEL[x as Platform] ?? x).join(", ") : it.legacy && it.status === "scheduled" ? "Instagram" : "Platforms chosen below"}</em>
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

      {ia && p.items.length > 0 && phase === "idle" && (
        <div className="ask-sched-dest">
          <small>On Instagram</small>
          {ia.trial && (
            <label><input type="checkbox" checked={useTrial} onChange={(e) => setUseTrial(e.target.checked)} />
              {ia.trial === "off" ? "A normal Reel, not a Trial Reel"
                : ia.trial === "manual" ? "Trial Reel: shown to people who don't follow you first. You share it to your followers yourself in Instagram."
                : "Trial Reel: shown to people who don't follow you first, then shared to your followers if it does well."}
            </label>
          )}
          {ia.collaborators.length > 0 && (
            <label><input type="checkbox" checked={useCollabs} onChange={(e) => setUseCollabs(e.target.checked)} /> Collaborators: {ia.collaborators.map((u) => `@${u}`).join(", ")}</label>
          )}
          {newChecks.map(({ a, c }) => (
            <span key={a.accountId} className="ask-sched-muted">
              {!c || c === "checking" ? <><Loader2 size={11} className="spin" /> Checking them with Instagram for {a.label}</>
                : c.status === "accepted" ? <><Check size={11} /> Instagram accepted them for {a.label}.</>
                : c.status === "rejected" ? <><AlertTriangle size={11} /> {c.message ?? "Instagram refused these collaborators."}</>
                : c.status === "unconfirmed" ? <>Instagram didn&apos;t confirm them in advance. Check the invite in Instagram after it posts.</>
                : <>{c.message ?? "SOCIA couldn't check them with Instagram."} They&apos;re still added.</>}
            </span>
          ))}
          {pairBlocked && <span className="ask-sched-muted"><AlertTriangle size={11} /> {TRIAL_COLLAB?.message}</span>}
          {ia.notes.map((n) => <span key={n} className="ask-sched-muted">{n}</span>)}
          {!needsPlatforms && !p.items.some((i) => i.platforms.includes("instagram")) && <span className="ask-sched-muted">None of these go to Instagram, so this doesn&apos;t change anything.</span>}
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
