"use client";

// Make and schedule (Growth/Pro). One run for a whole project:
//   1. choose what to post (SOCIA's video ideas, and/or each clip on its own),
//      how many a day, from which day, and where;
//   2. SOCIA makes each video here in the browser (the same render as the
//      editor's Export), saves it as a draft and writes its caption;
//   3. the person reviews the list (video, caption, day and time) and
//   4. schedules them all with one click, through POST /api/posts like
//      Create Post. Nothing is scheduled before step 4; until then every
//      video is a draft in the Calendar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Loader2, Square } from "lucide-react";
import PlanNotice from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import type { TimedPost } from "@/lib/postingTimes";
import { formatClock, fromLocalInput, toLocalInput, viewerTimeZone } from "@/lib/publishing/timing";
import { availabilityFor } from "@/lib/publishing/capabilities";
import { defaultSettings, PLATFORM_LABEL, type DestinationSettings, type Platform, type YouTubeSettings, type InstagramSettings, type FacebookSettings } from "@/lib/publishing/types";
import type { PickerAccount } from "@/lib/publishing/composer";
import { uploadToYouTube, relayEndpoint } from "@/lib/publishing/youtubeUpload";
import type { CalendarPost } from "@/lib/studioClips/distribute";
import { batchOrder, MAX_PER_DAY, scheduleBatch, tomorrowIn, type BatchItem } from "@/lib/studioClips/batch";
import { clipLabel, type BuildPlayerData, type StudioBuild, type StudioProject } from "@/lib/studioClips/types";
import { renderBlocker, renderBuild, spokenText } from "./renderBuild";

type BuildInfo = { idx: number; id: string; renderPath: string | null; postId: string | null; postStatus: string | null };
type BatchData = {
  existing: CalendarPost[];
  history: TimedPost[] | null;
  accounts: PickerAccount[];
  accountsComplete: boolean;
  builds: BuildInfo[];
  canSchedule: boolean;
  planError: PlanError | null;
  roleBlocked: boolean;
};

type Source = { kind: "idea"; idx: number } | { kind: "clip"; clipId: string };
type Candidate = BatchItem & { source: Source; done: string | null };
type Step = "waiting" | "cut" | "render" | "upload" | "caption" | "ready" | "failed" | "skipped";
type Made = {
  key: string;
  title: string;
  step: Step;
  progress: number;
  error: string | null;
  postId: string | null;
  path: string | null;
  url: string | null;
  /** a local copy of the video just made, for the preview (revoked on unmount) */
  preview: string | null;
  blob: Blob | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  caption: string;
  captionNote: string | null;
  ytTitle: string;
  at: string | null;
  reason: string | null;
  include: boolean;
  outcome: { ok: boolean; text: string } | null;
};

/** TikTok asks who may see each post and, until it audits SOCIA, allows only private posts: Create Post handles it one by one. */
const BATCH_PLATFORMS: Platform[] = ["instagram", "youtube", "facebook"];
const STEP_COPY: Record<Step, string> = {
  waiting: "Waiting", cut: "Writing the cut", render: "Making the video", upload: "Saving the video", caption: "Writing the caption",
  ready: "Ready", failed: "Didn't finish", skipped: "Skipped",
};

const keyOf = (s: Source) => (s.kind === "idea" ? `i${s.idx}` : `c${s.clipId}`);
const ytTitleFrom = (s: string) => s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

export default function BatchPanel({ project, autoBuild }: { project: StudioProject; autoBuild: boolean | null }) {
  const supabase = useMemo(() => createClient(), []);
  const tz = useMemo(() => viewerTimeZone() ?? "UTC", []);
  const [now] = useState(() => new Date());
  const [data, setData] = useState<BatchData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [perDay, setPerDay] = useState(1);
  const [start, setStart] = useState(() => tomorrowIn(new Date(), viewerTimeZone() ?? "UTC"));
  const [dest, setDest] = useState<Set<string>>(new Set());
  const [kids, setKids] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"setup" | "making" | "review" | "scheduling" | "done">("setup");
  const [made, setMade] = useState<Made[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [timing, setTiming] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const previews = useRef<string[]>([]);

  const load = useCallback(async () => {
    setLoadErr(null);
    const res = await fetch(`/api/studio/projects/${project.id}/batch`).catch(() => null);
    const j = res ? await readJson(res) : null;
    if (!res?.ok) { setLoadErr((j?.error as string) ?? "Couldn't read your calendar and accounts."); return; }
    const d = j as unknown as BatchData;
    setData(d);
    // Every account that can take a video is on by default; the person can untick any.
    setDest(new Set(d.accounts.filter((a) => BATCH_PLATFORMS.includes(a.platform) && availabilityFor(a.platform, a).state === "available").map((a) => `${a.platform}:${a.accountId}`)));
  }, [project.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { abort.current?.abort(); for (const u of previews.current) URL.revokeObjectURL(u); }, []);

  // What could be posted: SOCIA's ideas (strongest first), then each ready clip.
  const candidates = useMemo<Candidate[]>(() => {
    const builds = new Map((data?.builds ?? []).map((b) => [b.idx, b]));
    const tagsOf = new Map(project.clips.map((c) => [c.id, c.card?.tags ?? []]));
    const ideas: Candidate[] = (project.yield?.opportunities ?? []).map((o) => {
      const b = builds.get(o.idx);
      const done = b?.postStatus && b.postStatus !== "draft" ? `Already ${b.postStatus}` : null;
      return { key: keyOf({ kind: "idea", idx: o.idx }), title: o.title, strength: o.strength, clipIds: o.clipIds, tags: Array.from(new Set(o.clipIds.flatMap((c) => tagsOf.get(c) ?? []))).slice(0, 20), source: { kind: "idea", idx: o.idx }, done };
    });
    const clips: Candidate[] = project.clips
      .filter((c) => (c.status === "ready" || c.status === "uploaded") && (c.durationSec ?? 0) > 0)
      .sort((a, b) => a.position - b.position)
      .map((c) => {
        const b = builds.get(-1000 - c.position);
        const done = b?.postStatus && b.postStatus !== "draft" ? `Already ${b.postStatus}` : null;
        return { key: keyOf({ kind: "clip", clipId: c.id }), title: c.card?.speech?.hookLine || `${clipLabel(c.position)}${c.name ? `: ${c.name}` : ""}`, strength: "clip" as const, clipIds: [c.id], tags: c.card?.tags ?? [], source: { kind: "clip", clipId: c.id }, done };
      });
    return batchOrder([...ideas, ...clips]);
  }, [project, data]);

  // Ideas start ticked; single clips are opt-in.
  useEffect(() => {
    setPicked(new Set(candidates.filter((c) => !c.done && c.source.kind === "idea").map((c) => c.key)));
  }, [candidates]);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const chosenAccounts = accounts.filter((a) => dest.has(`${a.platform}:${a.accountId}`));
  const wantsYouTube = chosenAccounts.some((a) => a.platform === "youtube");
  const chosen = candidates.filter((c) => picked.has(c.key) && !c.done);
  const ideasChosen = chosen.filter((c) => c.source.kind === "idea").length;
  const ready = made.filter((m) => m.step === "ready");

  const settingsFor = (platform: Platform, m: Made): DestinationSettings => {
    if (platform === "youtube") return { ...(defaultSettings("youtube") as YouTubeSettings), title: m.ytTitle || ytTitleFrom(m.title), madeForKids: kids, privacy: "public" };
    if (platform === "instagram") return { ...(defaultSettings("instagram") as InstagramSettings), format: "reel" };
    if (platform === "facebook") return { ...(defaultSettings("facebook") as FacebookSettings), format: "reel" };
    return defaultSettings(platform);
  };

  const patch = (key: string, p: Partial<Made>) => setMade((cur) => cur.map((m) => (m.key === key ? { ...m, ...p } : m)));

  // ------------------------------------------------------------- make ----
  const makeOne = async (c: Candidate, signal: AbortSignal): Promise<void> => {
    const key = c.key;
    patch(key, { step: "cut", progress: 0 });
    // 1. The cut: SOCIA's edit guide for an idea, or the whole clip on its own.
    let build: StudioBuild;
    if (c.source.kind === "idea") {
      const url = `/api/studio/projects/${project.id}/opportunities/${c.source.idx}`;
      let res = await fetch(url, { signal });
      if (!res.ok) res = await fetch(url, { method: "POST", signal });
      const j = await readJson(res);
      if (!res.ok) { if (isPlanError(j)) throw Object.assign(new Error("plan"), { plan: j }); throw new Error((j?.error as string) ?? "Couldn't write the cut."); }
      build = j as unknown as StudioBuild;
    } else {
      const res = await fetch(`/api/studio/projects/${project.id}/clip-build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clipId: c.source.clipId }), signal });
      const j = await readJson(res);
      if (!res.ok) { if (isPlanError(j)) throw Object.assign(new Error("plan"), { plan: j }); throw new Error((j?.error as string) ?? "Couldn't prepare the clip."); }
      build = j as unknown as StudioBuild;
    }
    const pres = await fetch(`/api/studio/builds/${build.id}`, { signal });
    const pj = await readJson(pres);
    if (!pres.ok) { if (isPlanError(pj)) throw Object.assign(new Error("plan"), { plan: pj }); throw new Error((pj?.error as string) ?? "Couldn't open the cut."); }
    const player = pj as unknown as BuildPlayerData;
    const edl = player.build.edl;
    if (!edl) throw new Error("This idea has no cut yet.");
    const title = c.title;

    // 2. The video: made once. A video already made for this cut, still a draft, is reused.
    const prior = (data?.builds ?? []).find((b) => b.id === build.id);
    let path = prior?.renderPath && prior.postId && (prior.postStatus ?? "draft") === "draft" ? prior.renderPath : null;
    let postId = path ? prior!.postId : null;
    let blob: Blob | null = null;
    let durationSec: number | null = null;
    const width = edl.width, height = edl.height;
    if (!path) {
      patch(key, { step: "render", progress: 0 });
      const out = await renderBuild(player, { signal, onProgress: (f) => patch(key, { progress: f }) });
      blob = out.blob; durationSec = out.durationSec;
      patch(key, { step: "upload", progress: 0 });
      const ex = await fetch(`/api/studio/builds/${build.id}/export`, { method: "POST", signal });
      const ej = await readJson(ex);
      if (!ex.ok) { if (isPlanError(ej)) throw Object.assign(new Error("plan"), { plan: ej }); throw new Error((ej?.error as string) ?? "Couldn't save the video."); }
      const p = ej!.path as string;
      try {
        await uploadMedia(supabase, "scheduled-media", p, new File([blob], "video.mp4", { type: "video/mp4" }), (sent, total) => patch(key, { progress: total ? sent / total : 0 }));
        const d = await fetch(`/api/studio/builds/${build.id}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: p, durationSec, caption: edl.caption }), signal });
        const dj = await readJson(d);
        if (!d.ok) throw new Error((dj?.error as string) ?? "Couldn't save the draft.");
        path = p; postId = dj!.postId as string;
      } catch (e) {
        // Made but not saved: give the video build back.
        await fetch(`/api/studio/builds/${build.id}/export`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: p }) }).catch(() => null);
        throw e;
      }
    }
    const url = supabase.storage.from("scheduled-media").getPublicUrl(path!).data.publicUrl;

    // 3. The caption: SOCIA's caption writer, from what is said in the video and the cut's facts.
    const preview = blob ? URL.createObjectURL(blob) : null;
    if (preview) previews.current.push(preview);
    patch(key, { step: "caption", progress: 0, postId, path, url, preview, blob, durationSec, width, height, ytTitle: ytTitleFrom(title) });
    let caption = edl.caption ?? "";
    let captionNote: string | null = null;
    try {
      const res = await fetch("/api/publishing/caption", {
        method: "POST", headers: { "content-type": "application/json" }, signal,
        body: JSON.stringify({
          action: "generate", postId, destinations: chosenAccounts.map((a) => ({ platform: a.platform, accountId: a.accountId })), perPlatform: false,
          draft: "", notes: "", collaborators: [], userTags: [], planId: null, planDay: null,
          media: { kind: "video", count: 1, durationSec }, frames: [], frameTimes: [], imageUrls: [],
          transcript: spokenText(player), audio: null, location: "auto", studio: null,
        }),
      });
      const j = await readJson(res);
      const text = Array.isArray(j?.captions) ? ((j!.captions as { text?: string }[])[0]?.text ?? "") : "";
      if (res.ok && text.trim()) caption = text.trim();
      else captionNote = isPlanError(j) ? "Your caption allowance is used up, so this is the builder's caption." : "SOCIA couldn't write a caption for this one, so this is the builder's caption.";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      captionNote = "SOCIA couldn't write a caption for this one, so this is the builder's caption.";
    }
    // A single clip has no title of its own: YouTube gets the caption's first line instead of a file name.
    const firstLine = caption.split("\n").map((l) => l.replace(/#[\p{L}\p{N}_]+/gu, "").trim()).find(Boolean) ?? "";
    patch(key, { step: "ready", progress: 1, caption, captionNote, ...(c.source.kind === "clip" && firstLine ? { ytTitle: ytTitleFrom(firstLine) } : {}) });
  };

  const make = async () => {
    if (!chosen.length) return;
    setRunError(null); setPlanError(null);
    const blocker = await renderBlocker(1080, 1920);
    if (blocker) { setRunError(blocker); return; }
    const ctrl = new AbortController(); abort.current = ctrl;
    setMade(chosen.map((c) => ({ key: c.key, title: c.title, step: "waiting", progress: 0, error: null, postId: null, path: null, url: null, preview: null, blob: null, durationSec: null, width: null, height: null, caption: "", captionNote: null, ytTitle: ytTitleFrom(c.title), at: null, reason: null, include: true, outcome: null })));
    setPhase("making");
    for (const c of chosen) {
      if (ctrl.signal.aborted) { patch(c.key, { step: "skipped" }); continue; }
      try {
        await makeOne(c, ctrl.signal);
      } catch (e) {
        const err = e as Error & { plan?: PlanError };
        if (err.name === "AbortError") { patch(c.key, { step: "skipped", progress: 0 }); continue; }
        if (err.plan) {
          // A plan limit stops the run for the ideas; single clips count nothing and carry on.
          setPlanError(err.plan);
          patch(c.key, { step: "failed", error: "Your plan's limit stopped this one." });
          if (c.source.kind === "idea") for (const rest of chosen.filter((x) => x.source.kind === "idea" && x !== c)) patch(rest.key, { step: "skipped" });
          continue;
        }
        patch(c.key, { step: "failed", error: err.message?.replace(/^Upload failed: /, "") || "SOCIA didn't get an answer. Run it again for this one." });
      }
    }
    abort.current = null;
    setPhase("review");
  };

  // Spread the finished videos once they are made (and again when the number a day or the start changes).
  useEffect(() => {
    if (phase !== "review" || !data) return;
    setMade((cur) => {
      const items = cur.filter((m) => m.step === "ready" && m.include);
      const byKey = new Map(candidates.map((c) => [c.key, c]));
      const plan = scheduleBatch({
        items: items.map((m) => byKey.get(m.key)).filter((x): x is Candidate => Boolean(x)),
        perDay, startDate: start, existing: data.existing, history: data.history, now: new Date(), tz,
      });
      setTiming(plan.timing);
      const slots = new Map(plan.slots.map((s) => [s.key, s]));
      const unplaced = new Map(plan.unplaced.map((u) => [u.key, u.reason]));
      return cur.map((m) => (m.step !== "ready" ? m : { ...m, at: slots.get(m.key)?.at ?? null, reason: slots.get(m.key)?.reason ?? unplaced.get(m.key) ?? null }));
    });
    // Only the inputs that should re-spread the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, perDay, start, data]);

  // -------------------------------------------------------- schedule ----
  const scheduleAll = async () => {
    const list = made.filter((m) => m.step === "ready" && m.include && m.at && m.path && m.postId);
    if (!list.length || !chosenAccounts.length) return;
    setPhase("scheduling"); setRunError(null);
    for (const m of list) {
      patch(m.key, { outcome: null });
      try {
        const res = await fetch("/api/posts", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: m.postId, caption: m.caption, scheduledAt: m.at, source: "studio", planId: null, planDay: null, customizePerPlatform: false, action: "schedule",
            media: [{ id: `studio-${m.postId}`, kind: "video", name: "video.mp4", mime: "video/mp4", size: m.blob?.size ?? null, width: m.width, height: m.height, duration: m.durationSec, path: m.path }],
            destinations: chosenAccounts.map((a) => ({ platform: a.platform, accountId: a.accountId, settings: settingsFor(a.platform, m), scheduledAt: m.at })),
          }),
        });
        const j = await readJson(res);
        if (!res.ok) {
          const issues = j?.issues ? Object.values(j.issues as Record<string, { message: string }[]>).flat().map((i) => i.message) : [];
          patch(m.key, { outcome: { ok: false, text: [j?.error as string ?? "Couldn't schedule it.", ...issues].join(" ") } });
          continue;
        }
        // YouTube holds a scheduled video privately until its time; the bytes go from this browser now.
        const item = j!.item as { id: string };
        const uploads = (j!.uploads ?? []) as { destinationId: string; uploadHandle: string }[];
        const notes: string[] = [];
        for (const u of uploads) {
          try {
            const blob = m.blob ?? await (await fetch(m.url!)).blob();
            const { videoId } = await uploadToYouTube({ endpoint: relayEndpoint(item.id, u.destinationId), handle: u.uploadHandle, blob });
            await fetch(`/api/posts/${encodeURIComponent(item.id)}/destinations/${encodeURIComponent(u.destinationId)}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ externalPostId: videoId }) });
          } catch (e) {
            const msg = (e as Error)?.message || "The upload did not complete.";
            await fetch(`/api/posts/${encodeURIComponent(item.id)}/destinations/${encodeURIComponent(u.destinationId)}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ error: msg }) }).catch(() => null);
            notes.push(`YouTube upload didn't finish (${msg}); open the post to upload it again.`);
          }
        }
        patch(m.key, { outcome: { ok: notes.length === 0, text: notes.length ? `Scheduled. ${notes.join(" ")}` : "Scheduled." } });
      } catch {
        patch(m.key, { outcome: { ok: false, text: "Couldn't reach SOCIA. It's still a draft in your Calendar." } });
      }
    }
    setPhase("done");
  };

  // ----------------------------------------------------------- render ----
  if (loadErr) return <div className="ov-card cbp"><p className="cbb-err"><AlertTriangle size={12} /> {loadErr} <button type="button" className="cp-link" onClick={() => void load()}>Try again</button></p></div>;
  if (!data) return <div className="ov-card cbp"><p className="cbp-muted"><Loader2 size={12} className="spin" /> Reading your calendar and accounts…</p></div>;

  const head = (
    <div className="cbp-head">
      <h3 id="cba-h"><CalendarClock size={15} /> Make and schedule</h3>
      <span className="cbp-muted">Your time zone ({tz.replace(/_/g, " ")})</span>
    </div>
  );

  if (!data.canSchedule || autoBuild === false) {
    return (
      <section className="ov-card cbp" aria-labelledby="cba-h">
        {head}
        <p className="cbp-muted">Make every video in this project and schedule them a set number a day, in one go.</p>
        {data.roleBlocked ? <p className="cbp-muted">Only the brand&apos;s owner or an admin can schedule posts.</p> : data.planError ? <PlanNotice error={data.planError} compact /> : null}
      </section>
    );
  }

  const scheduledCount = made.filter((m) => m.outcome && m.outcome.text.startsWith("Scheduled")).length;
  const includeCount = made.filter((m) => m.step === "ready" && m.include && m.at).length;

  return (
    <section className="ov-card cbp cba" aria-labelledby="cba-h">
      {head}
      {planError && <PlanNotice error={planError} compact />}
      {runError && <p className="cbb-err" role="alert"><AlertTriangle size={12} /> {runError}</p>}

      {phase === "setup" && (
        <>
          <p className="cbp-muted">SOCIA makes each video below in this browser, writes its caption and spreads them over the coming days. You check the whole list before anything is scheduled; until then they are drafts in your Calendar.</p>

          <fieldset className="cba-field">
            <legend>What to post</legend>
            <ul className="cba-pick">
              {candidates.map((c) => (
                <li key={c.key} className={c.done ? "off" : ""}>
                  <label>
                    <input type="checkbox" checked={picked.has(c.key)} disabled={Boolean(c.done)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(c.key); else n.delete(c.key); return n; })} />
                    <span>{c.title}</span>
                  </label>
                  <span className={`cb-badge ${c.strength === "clip" ? "" : c.strength}`}>{c.done ?? (c.strength === "strong" ? "Strong idea" : c.strength === "possible" ? "Possible idea" : "Clip on its own")}</span>
                </li>
              ))}
            </ul>
            <p className="cbp-muted">Ideas are cut by SOCIA, with on-screen text where the guide calls for it. A clip on its own is posted whole, with captions from its speech when it has any.</p>
          </fieldset>

          <div className="cba-row">
            <fieldset className="cba-field">
              <legend>Posts a day</legend>
              <div className="cba-seg" role="radiogroup" aria-label="Posts a day">
                {Array.from({ length: MAX_PER_DAY }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={perDay === n} className={perDay === n ? "on" : ""} onClick={() => setPerDay(n)}>{n}</button>
                ))}
              </div>
            </fieldset>
            <label className="cba-field cba-start">
              <span>Starting</span>
              <input type="date" value={start} min={tomorrowIn(now, tz)} onChange={(e) => e.target.value && setStart(e.target.value)} />
            </label>
          </div>

          <fieldset className="cba-field">
            <legend>Post to</legend>
            {!data.accountsComplete && <p className="cbp-muted">SOCIA couldn&apos;t read every connected account just now; some may be missing.</p>}
            <ul className="cba-dest">
              {accounts.map((a) => {
                const k = `${a.platform}:${a.accountId}`;
                const av = availabilityFor(a.platform, a);
                const inBatch = BATCH_PLATFORMS.includes(a.platform);
                const why = !inBatch ? "Schedule TikTok posts from Create Post: TikTok asks who can see each one." : av.state !== "available" ? av.reason : null;
                return (
                  <li key={k} className={why ? "off" : ""}>
                    <label>
                      <input type="checkbox" checked={dest.has(k)} disabled={Boolean(why)} onChange={(e) => setDest((s) => { const n = new Set(s); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />
                      <span>{PLATFORM_LABEL[a.platform]} · {a.label}</span>
                    </label>
                    {why && <small>{why}{av.state === "needs_scope" && a.platform === "youtube" ? <> <a href="/api/auth/youtube/start?publish=1">Enable uploads</a></> : null}</small>}
                  </li>
                );
              })}
              {!accounts.length && <li className="off"><small>No accounts connected. <Link href="/settings">Connect one in Settings</Link>.</small></li>}
            </ul>
          </fieldset>

          {wantsYouTube && (
            <fieldset className="cba-field">
              <legend>YouTube: are these videos made for kids?</legend>
              <div className="cba-kids">
                <label><input type="radio" name="cba-kids" checked={kids === false} onChange={() => setKids(false)} /> No, they&apos;re not made for kids</label>
                <label><input type="radio" name="cba-kids" checked={kids === true} onChange={() => setKids(true)} /> Yes, they&apos;re made for kids</label>
              </div>
              <p className="cbp-muted">YouTube requires an answer for every video. Each one is uploaded from this browser when you schedule, and YouTube keeps it private until its time.</p>
            </fieldset>
          )}

          <div className="cbp-foot">
            <button type="button" className="ov-btn primary" disabled={!chosen.length || !chosenAccounts.length || (wantsYouTube && kids == null)} onClick={() => void make()}>
              <CalendarClock size={14} /> Make {chosen.length === 1 ? "this video" : `${chosen.length} videos`}
            </button>
            <p className="cbp-muted">
              {ideasChosen > 0 ? `Each idea counts as one video build on your plan. ` : ""}Keep this tab open while they&apos;re made: the videos render on this computer.
            </p>
          </div>
        </>
      )}

      {phase !== "setup" && (
        <>
          {phase === "making" && <p className="cbp-muted"><Loader2 size={12} className="spin" /> Making {made.filter((m) => m.step === "ready").length + 1} of {made.length}. Keep this tab open.</p>}
          {(phase === "review" || phase === "scheduling" || phase === "done") && timing && <p className="cbp-muted">{timing}</p>}
          {phase === "review" && (
            <div className="cba-row">
              <fieldset className="cba-field">
                <legend>Posts a day</legend>
                <div className="cba-seg" role="radiogroup" aria-label="Posts a day">
                  {Array.from({ length: MAX_PER_DAY }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={perDay === n} className={perDay === n ? "on" : ""} onClick={() => setPerDay(n)}>{n}</button>
                  ))}
                </div>
              </fieldset>
              <label className="cba-field cba-start"><span>Starting</span><input type="date" value={start} min={tomorrowIn(now, tz)} onChange={(e) => e.target.value && setStart(e.target.value)} /></label>
            </div>
          )}

          <ol className="cba-list">
            {[...made].sort((a, b) => (a.at ?? "~").localeCompare(b.at ?? "~")).map((m) => (
              <li key={m.key} className={m.step === "ready" && !m.include ? "off" : ""}>
                <div className="cba-media">
                  {m.preview ?? m.url ? <video src={m.preview ?? m.url ?? undefined} controls preload="metadata" playsInline aria-label={`Video: ${m.title}`} /> : <span className="cba-ph" aria-hidden />}
                </div>
                <div className="cbp-main">
                  <b>{m.title}</b>
                  {m.step !== "ready" && (
                    <small className={m.step === "failed" ? "cba-bad" : ""}>
                      {m.step === "render" || m.step === "upload" ? `${STEP_COPY[m.step]} · ${Math.round(m.progress * 100)}%` : STEP_COPY[m.step]}{m.error ? `: ${m.error}` : ""}
                    </small>
                  )}
                  {m.step === "ready" && (
                    <>
                      <label className="cba-cap">
                        <span>Caption</span>
                        <textarea value={m.caption} rows={4} maxLength={2200} disabled={phase !== "review"} onChange={(e) => patch(m.key, { caption: e.target.value })} />
                      </label>
                      {m.captionNote && <small>{m.captionNote}</small>}
                      {wantsYouTube && (
                        <label className="cba-cap">
                          <span>YouTube title</span>
                          <input type="text" value={m.ytTitle} maxLength={100} disabled={phase !== "review"} onChange={(e) => patch(m.key, { ytTitle: ytTitleFrom(e.target.value) })} />
                        </label>
                      )}
                      {m.outcome && <small className={m.outcome.ok ? "cba-ok" : "cba-bad"}>{m.outcome.ok ? <Check size={11} /> : <AlertTriangle size={11} />} {m.outcome.text}</small>}
                    </>
                  )}
                </div>
                {m.step === "ready" && (
                  <div className="cbp-ctl">
                    <input type="datetime-local" aria-label={`Time for ${m.title}`} value={m.at ? toLocalInput(m.at, tz) : ""} disabled={phase !== "review" || !m.include} onChange={(e) => { const at = fromLocalInput(e.target.value, tz); if (at) patch(m.key, { at, reason: "Set by you." }); }} />
                    <small className="cba-why">{m.at ? `${formatClock(m.at, tz)} · ${m.reason ?? ""}` : m.reason ?? "No time yet."}</small>
                    <label className="cbp-skip"><input type="checkbox" checked={m.include} disabled={phase !== "review"} onChange={(e) => patch(m.key, { include: e.target.checked })} /> Include</label>
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="cbp-foot">
            {phase === "making" && <button type="button" className="ov-btn ghost small" onClick={() => abort.current?.abort()}><Square size={12} /> Stop after this one</button>}
            {phase === "review" && (
              <>
                <button type="button" className="ov-btn primary" disabled={!includeCount} onClick={() => void scheduleAll()}>
                  <CalendarClock size={14} /> Schedule {includeCount === 1 ? "this post" : `these ${includeCount} posts`}
                </button>
                <p className="cbp-muted">
                  To {chosenAccounts.map((a) => `${PLATFORM_LABEL[a.platform]} (${a.label})`).join(", ")}. They publish on their own at these times; you can still change or remove any of them in the Calendar first.
                  {ready.length < made.length ? " Videos that didn't finish aren't scheduled." : ""}
                </p>
                <button type="button" className="ov-btn ghost small" onClick={() => { setPhase("done"); }}>Keep them as drafts</button>
              </>
            )}
            {phase === "scheduling" && <p className="cbp-muted"><Loader2 size={12} className="spin" /> Scheduling{wantsYouTube ? " and uploading to YouTube" : ""}. Keep this tab open.</p>}
            {phase === "done" && (
              <>
                <p className="cbb-ok"><Check size={13} /> {scheduledCount ? `${scheduledCount} scheduled.` : "Your videos are drafts in the Calendar."} {made.some((m) => m.outcome && !m.outcome.ok) ? "Some need a look: see the notes above." : ""}</p>
                <Link className="ov-btn ghost small" href="/plan/calendar">Open the Calendar <ArrowRight size={12} /></Link>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
