"use client";

// A check page for every Studio screen (development only; app/dev/studio-lab):
// the real components on fixture data (components/studio/labFixtures.ts) with
// the Studio API answered from those fixtures in this tab, so each screen can
// be opened, looked at and screenshotted without an account. The sample video
// in public/ supplies the clips and their frames. Pick a screen with ?screen=:
//   rate, rate-analysis, rate-improve, build, build-collect, build-yield,
//   opportunity, editor, editor-text, editor-finish, edit, audio, guide.
import type { Edl } from "@/lib/studioClips/types";
import { addScene, effectAt, tokens, withPictures } from "@/lib/studioClips/scenes";
import { isSceneFx } from "@/lib/studioClips/sceneFx";
import { DEMO_EGYPT, DEMO_WAREHOUSE } from "@/lib/studioClips/sceneArtDemo";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import ContentStudio from "./ContentStudio";
import ClipsStudio from "./ClipsStudio";
import ClipBuilder from "./ClipBuilder";
import GuideStudio from "./GuideStudio";
import StudioMode from "./StudioMode";
import { extractFrames } from "@/lib/studio";
import * as fx from "./labFixtures";
import { themeById } from "@/lib/studioClips/themes";
import { applyTheme } from "@/lib/studioClips/themes/apply";
import type { Track } from "@/lib/music/tracks";
import { normalizePlaylists, type Playlist } from "@/lib/music/playlists";

const SCREENS = ["rate", "rate-analysis", "rate-improve", "build", "build-collect", "build-yield", "opportunity", "editor", "editor-loaded", "editor-text", "editor-finish", "edit", "audio", "guide"] as const;
type Screen = (typeof SCREENS)[number];

const NOW_ISO = new Date().toISOString();
/** A small music library for the Sound tool: names only, no files (nothing plays). */
const LAB_TRACKS: Track[] = [
  { id: "lab-t1", name: "Sunset drive", sourceName: "sunset-drive.mp3", durationSec: 142, createdAt: "2026-11-20T10:00:00Z", lastUsedAt: null, url: null },
  { id: "lab-t2", name: "Hype beat", sourceName: "hype.m4a", durationSec: 96, createdAt: "2026-11-19T10:00:00Z", lastUsedAt: null, url: null },
  { id: "lab-t3", name: "Calm keys", sourceName: "calm-keys.wav", durationSec: 60, createdAt: "2026-11-18T10:00:00Z", lastUsedAt: null, url: null },
];
let labPlaylists: Playlist[] = normalizePlaylists([{ id: "energetic", trackIds: ["lab-t2"] }]);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The Studio API, answered from the fixtures. Everything else goes to the network. */
function installMock(thumbs: fx.Thumb[], durationSec: number, screen: Screen): () => void {
  const real = window.fetch.bind(window);
  // Clips dropped in this tab, so the project lists them after a reload of its data.
  const labClips: fx.LabClip[] = [];
  const state = screen === "build-collect" ? "collecting" : "ready";
  // ?fresh=1 on the edit screen: the project starts with no clips, so one clip dropped on the one-drop screen goes
  // down the talking-clip path. Its picture is public/dev-talk.mp4 (not in the repository) and its words are
  // stand-ins with a long pause and a figure in them: they exercise the cut, they are not what is said.
  const fresh = screen === "edit" && new URLSearchParams(window.location.search).get("fresh") === "1";
  let freshEdl: unknown = null;
  const say = (text: string, at: number) => { let t = at; return text.split(" ").map((word) => { const w = { text: word, startMs: Math.round(t * 1000), endMs: Math.round((t + 0.26) * 1000), confidence: 1 }; t += /[.!?]$/.test(word) ? 0.55 : 0.29; return w; }); };
  const freshWords = [...say("Welcome to the showroom everybody.", 0.3), ...say("We have 500 rugs in stock right now.", 3.4), ...say("Come and see us.", 6.4)];
  const freshBuild = () => {
    const c = labClips[0];
    const b = fx.build(thumbs, durationSec, -1);
    const dur = c?.durationSec ?? durationSec;
    const edl = freshEdl ?? { ...b.edl, targetSec: { min: 1, max: Math.ceil(dur) + 1 }, segments: [{ id: "s1", clipId: c?.id ?? "lab-4", in: 0, out: dur, role: "opener", note: "" }], text: [], enhance: [], audio: [], cta: null, caption: "" };
    return { ...b, edl, durationSec: dur } as ReturnType<typeof fx.build>;
  };
  const freshData = () => {
    const c = labClips[0];
    const d = fx.playerData(thumbs, durationSec, -1);
    return { ...d, build: freshBuild(), sources: c ? [{ clipId: c.id, position: 0, name: c.name, url: "/dev-talk.mp4", thumb: null, durationSec: c.durationSec ?? durationSec, width: 1080, height: 1920, words: freshWords, moments: [] }] : [] };
  };
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const p = url.pathname;
    // Storage uploads (the WAV for transcription) land nowhere.
    // (Also when the lab runs beside a real project's keys: nothing of the lab's is ever sent to its storage.)
    if (url.hostname.endsWith("placeholder.supabase.co") || p.startsWith("/storage/v1/object/")) return json({ Key: p, Id: "lab" });
    // Only this app's own API is answered here: Remotion's licence ping and any other host go out as they are.
    if (url.origin !== window.location.origin || !p.startsWith("/api/")) return real(input, init);
    // The upload flow: a dropped file is registered, its uploads land nowhere, and it is completed, so the whole
    // path from drop to "ready" can be exercised without an account.
    if (p === "/api/studio/clips" && method === "POST") {
      const body = (init?.body ? JSON.parse(String(init.body)) : {}) as { name?: string; bytes?: number; durationSec?: number; width?: number; height?: number; mime?: string };
      const id = `lab-${(labClips.length + 4)}`;
      const c = { ...fx.clips(thumbs, durationSec)[0], id, position: labClips.length + 3, name: body.name ?? "clip.mp4", bytes: body.bytes ?? 0, durationSec: body.durationSec ?? durationSec, width: body.width ?? null, height: body.height ?? null, mime: body.mime ?? null, status: "registered" as const, card: null, transcript: null, frames: [], reused: false };
      labClips.push(c);
      return json({ clip: c, reused: false, expiresAt: null, paths: { folder: `lab/${id}/`, source: `lab/${id}/source.mp4`, frames: `lab/${id}/frames/`, audio: `lab/${id}/audio.wav` } });
    }
    const clipPatch = p.match(/^\/api\/studio\/clips\/([^/]+)$/);
    if (clipPatch && method === "PATCH") {
      const c = labClips.find((x) => x.id === clipPatch[1]);
      if (!c) return json({ error: "That clip does not exist." }, 404);
      const body = (init?.body ? JSON.parse(String(init.body)) : {}) as { facts?: fx.LabClip["facts"] };
      Object.assign(c, { status: "uploaded" as const, facts: body.facts ?? null, frames: fx.clips(thumbs, durationSec)[0].frames });
      return json(c);
    }
    if (clipPatch && method === "DELETE") { const i = labClips.findIndex((x) => x.id === clipPatch[1]); if (i >= 0) labClips.splice(i, 1); return json({ ok: true }); }
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/understand`) return json({ ok: true, started: true });
    if (p === "/api/studio/audio") return json({ insights: { accounts: [], own: null, recommendation: "No posts have been measured in the lab.", evidence: [], coverage: { total: 0, library: 0, measured: 0, pending: 0, failed: 0 }, generatedAt: NOW_ISO }, pending: [], competitors: { enabled: false, refreshed: false, accounts: 0 } });
    if (p.startsWith("/api/studio/audio/")) return json({ ok: true });
    if (p === "/api/studio/voices") return json({ voices: [] });
    if (p === "/api/studio/projects" && method === "GET") return json({ projects: [fx.summary()], limits: { clipsPerProject: 30, footageMinutes: 30, uploadMb: 2000 }, usage: { meter: "content_build", used: 1, limit: 10, remaining: 9, resetsOn: "2026-12-01" }, transcription: true, features: { autoBuild: true } });
    // A new video in the fresh lab starts with no clips, as a new project does (an earlier try's clip doesn't stay).
    if (p === "/api/studio/projects" && method === "POST") { if (fresh) { labClips.length = 0; freshEdl = null; } return json({ id: fx.PROJECT_ID }); }
    if (fresh && p === `/api/studio/projects/${fx.PROJECT_ID}` && method === "GET") return json({ ...fx.project(thumbs, durationSec, state), clips: labClips });
    // The steps that ask a model on SOCIA: here the pictures are one stand-in (a warehouse and a map) on the fourth
    // word of the cut, and the instructions change nothing.
    if (p.startsWith("/api/studio/builds/") && p.endsWith("/visuals")) {
      const edl = (init?.body ? (JSON.parse(String(init.body)) as { edl?: Edl }).edl : null) ?? null;
      const d = fresh ? freshData() : fx.playerData(thumbs, durationSec, p.includes(fx.MANUAL_BUILD_ID) ? -1 : 0);
      const words = Object.fromEntries(d.sources.map((s) => [s.clipId, s.words]));
      const toks = edl ? tokens(edl, words) : [];
      if (!edl || !toks.length) return json({ scenes: edl?.scenes ?? [], pictures: 0 });
      const wanted = ((init?.body ? (JSON.parse(String(init.body)) as { wanted?: unknown[] }).wanted : null) ?? []).filter(isSceneFx);
      // Picked effects go on the first words; with none picked the stand-in picture shows instead.
      let scenes = wanted.length ? edl.scenes ?? [] : withPictures(edl, [{ id: "p1", kind: "picture", key: toks[Math.min(3, toks.length - 1)].key, dur: 3.2, text: "Warehouse in Egypt", art: [DEMO_WAREHOUSE, DEMO_EGYPT] }], words);
      wanted.forEach((fx, i) => { const made = effectAt(edl, words, fx, 0.4 + i * 3.4); if (made) scenes = addScene({ ...edl, scenes }, words, made); });
      return json({ scenes, pictures: scenes.filter((s) => s.kind === "picture").length, effects: scenes.filter((s) => s.kind === "effect").length });
    }
    if (p.startsWith("/api/studio/builds/") && p.endsWith("/instruct")) return json({ edl: null, reply: "", done: [], skipped: [], changed: false });
    if (fresh && p === `/api/studio/projects/${fx.PROJECT_ID}/clip-build`) return json(freshBuild());
    if (fresh && p.startsWith("/api/studio/builds/") && method === "GET") return json(freshData());
    if (fresh && p.startsWith("/api/studio/builds/") && method === "PATCH") { freshEdl = (init?.body ? (JSON.parse(String(init.body)) as { edl?: unknown }).edl : null) ?? freshEdl; return json(freshBuild()); }
    if (fresh && p === `/api/studio/projects/${fx.PROJECT_ID}/transcribe`) return json({ ok: true });
    if (p === `/api/studio/projects/${fx.PROJECT_ID}` && method === "GET") { const pr = fx.project(thumbs, durationSec, state); return json({ ...pr, clips: [...pr.clips, ...labClips] }); }
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/opportunities/0`) return json(fx.build(thumbs, durationSec, 0));
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/batch`) return json({ existing: [], history: null, accounts: [], accountsComplete: true, builds: [], canSchedule: true, planError: null, roleBlocked: false });
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/brief` && method === "GET") return json({ builds: [] });
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/edit`) return json(fx.build(thumbs, durationSec, -1));
    // The one-drop screen (QuickEdit): one clip as its own cut, the brief fitted and made, all from the fixtures.
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/clip-build`) return json(fx.build(thumbs, durationSec, -1));
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/brief/enhance`) return json({ prompt: (init?.body ? (JSON.parse(String(init.body)) as { prompt?: string }).prompt : "") ?? "", added: [] });
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/brief` && method === "POST") return json({ build: fx.build(thumbs, durationSec, 0), breakdown: null });
    if (p.startsWith("/api/studio/builds/") && method === "GET") return json(fx.playerData(thumbs, durationSec, p.includes(fx.MANUAL_BUILD_ID) ? -1 : 0));
    if (p.startsWith("/api/studio/builds/") && method === "PATCH") { const b = (await (init?.body ? JSON.parse(String(init.body)) : null)) as { edl?: unknown } | null; const base = fx.build(thumbs, durationSec, p.includes(fx.MANUAL_BUILD_ID) ? -1 : 0); return json({ ...base, edl: b?.edl ?? base.edl }); }
    if (p === "/api/studio/learn") return json({ outcomes: [], lessons: { published: 0, settledCount: 0, lessons: [], best: null, summary: "No posts made in Content Studio have been published yet." } });
    if (p === "/api/studio/videos") return json({ videos: fx.videos() });
    if (p === "/api/studio/library") return json({ clips: fx.library(thumbs, durationSec) });
    if (p === "/api/studio/style") return json({ brand: null, templates: [] });
    if (p === "/api/studio/tracks") return json({ tracks: LAB_TRACKS });
    if (p === "/api/studio/tracks/playlists") {
      if (method === "PUT") labPlaylists = normalizePlaylists((init?.body ? JSON.parse(String(init.body)) : {}).playlists, LAB_TRACKS.map((t) => t.id));
      return json({ playlists: labPlaylists });
    }
    if (p === "/api/studio/outlook") return json(fx.outlook(new URLSearchParams(window.location.search).get("outlook")));
    if (p === "/api/studio/rater-log") return method === "GET" ? json(fx.raterLog()) : json({ ok: true });
    if (p === "/api/studio/analyze") return json({ analysis: fx.analysis(durationSec), usage: { meter: "content_studio", used: 2, limit: 20, remaining: 18, resetsOn: "2026-12-01" } });
    if (p === "/api/studio/transcribe") return json({ transcript: fx.transcript() });
    if (p === "/api/studio/improve") return json({ options: [{ label: "Shorter", text: "Twenty a day. Come before 10.", steps: [] }, { label: "More local", text: "Downtown's smash burger, twenty a day, gone by 10.", steps: [] }] });
    return json({ error: `The lab has no answer for ${method} ${p}.` }, 404);
  };
  return () => { window.fetch = real; };
}

/** Drop the sample video on a drop zone, as a person would. */
async function dropSample(target: Element) {
  const blob = await fetch(fx.SAMPLE_URL).then((r) => r.blob());
  const file = new File([blob], "dev-sample.mp4", { type: "video/mp4" });
  const dt = new DataTransfer();
  dt.items.add(file);
  target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
}

const noop = () => {};
const stubRouter: AppRouterInstance = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop };

function Lab() {
  const params = useSearchParams();
  const screen = (SCREENS.find((s) => s === params.get("screen")) ?? "rate") as Screen;
  const [frames, setFrames] = useState<{ thumbs: fx.Thumb[]; duration: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The sample's frames, once, for every fixture.
  useEffect(() => {
    let alive = true;
    extractFrames(fx.SAMPLE_URL, () => null).then((f) => { if (alive) setFrames({ thumbs: f.thumbs, duration: f.duration }); }).catch((e) => { if (alive) setNote(`Couldn't read ${fx.SAMPLE_URL}: ${(e as Error)?.message ?? e}`); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!frames) return;
    const restore = installMock(frames.thumbs, frames.duration, screen);
    setReady(true);
    return () => { restore(); setReady(false); };
  }, [frames, screen]);

  // Rate: the sample goes in on its own; Improve opens once the analysis is back.
  useEffect(() => {
    if (!ready || !screen.startsWith("rate-")) return;
    let alive = true;
    (async () => {
      const root = document.querySelector(".st");
      if (!root) return;
      await dropSample(root);
      // ?tab=Improve (or Caption, Audio, Prepare) opens that tab once the analysis is back.
      const want = screen === "rate-improve" ? "Improve" : new URLSearchParams(window.location.search).get("tab");
      if (!want) return;
      for (let i = 0; i < 400 && alive; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('.st-tabs button[role="tab"]')).find((b) => b.textContent?.trim().startsWith(want));
        if (tab) { tab.click(); return; }
      }
    })();
    return () => { alive = false; };
  }, [ready, screen]);
  // Opportunity: open the first post of the yield.
  useEffect(() => {
    if (!ready || screen !== "opportunity") return;
    let alive = true;
    (async () => {
      for (let i = 0; i < 400 && alive; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const btn = document.querySelector<HTMLButtonElement>(".cb-opp .ov-btn");
        if (btn) { btn.click(); return; }
      }
    })();
    return () => { alive = false; };
  }, [ready, screen]);

  const content = useMemo(() => {
    if (!ready || !frames) return null;
    const { thumbs, duration } = frames;
    switch (screen) {
      case "rate": case "rate-analysis": case "rate-improve":
        return <ContentStudio userId="lab" niche="Burger shop" location="Downtown" goalDefault="local_orders" drafts={[]} connected={false} postsSynced={0} modeTabs={<StudioMode mode="quick" />} plan={null} />;
      case "build": case "build-collect": case "build-yield": case "opportunity":
        return <ClipsStudio key={screen} viewerId="lab" modeTabs={<StudioMode mode="clips" />} variant="build" />;
      // editor-loaded: the editor as the app opens it, the cut fetched from the API after the first render (the path a fixture never exercises).
      case "editor-loaded":
        return <ClipBuilder buildId={fx.BUILD_ID} title="The cheese pull, smash to order" onBack={noop} />;
      case "editor": case "editor-text": case "editor-finish": {
        // ?theme=<id> opens the fixture with that theme applied (lib/studioClips/themes), for checking every theme on the sample.
        const data = fx.playerData(thumbs, duration, 0);
        const theme = themeById(new URLSearchParams(window.location.search).get("theme"));
        if (theme) data.build.edl = applyTheme({ ...data.build.edl, lowerThird: { name: "Noah Reyes", line: "Burger shop, Downtown" } }, theme, { words: Object.fromEntries(data.sources.map((x) => [x.clipId, x.words])) });
        return <ClipBuilder buildId={fx.BUILD_ID} title="The cheese pull, smash to order" fixture={data} initialPanel={screen === "editor-text" ? "text" : screen === "editor-finish" ? "finish" : "cut"} onBack={noop} />;
      }
      case "edit":
        return <ClipsStudio key="edit" viewerId="lab" modeTabs={<StudioMode mode="edit" />} variant="edit" />;
      case "audio":
        return <ClipsStudio key="audio" viewerId="lab" modeTabs={<StudioMode mode="audio" />} variant="audio" />;
      case "guide":
        return <GuideStudio modeTabs={<StudioMode mode="guide" />} concept={null} guide={null} source={null} missing={false} />;
    }
  }, [ready, frames, screen]);

  return (
    <AppRouterContext.Provider value={stubRouter}>
      <div className="txlab" data-screen={screen}>
        <p className="ov-source">Studio lab, development only: {screen}. {SCREENS.map((s) => <a key={s} href={`?screen=${s}${s.startsWith("build") || s === "opportunity" ? `&mode=clips&project=${fx.PROJECT_ID}` : ""}`} style={{ marginRight: 8 }}>{s}</a>)}</p>
        {note && <p className="ov-source">{note}</p>}
        {content ?? <p className="ov-source">Reading the sample video.</p>}
      </div>
    </AppRouterContext.Provider>
  );
}

export default function StudioLab() {
  return <Suspense fallback={null}><Lab /></Suspense>;
}
