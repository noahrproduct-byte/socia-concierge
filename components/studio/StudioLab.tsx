"use client";

// A check page for every Studio screen (development only; app/dev/studio-lab):
// the real components on fixture data (components/studio/labFixtures.ts) with
// the Studio API answered from those fixtures in this tab, so each screen can
// be opened, looked at and screenshotted without an account. The sample video
// in public/ supplies the clips and their frames. Pick a screen with ?screen=:
//   rate, rate-analysis, rate-improve, build, build-collect, build-yield,
//   opportunity, editor, editor-text, editor-finish, edit, audio, guide.
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

const SCREENS = ["rate", "rate-analysis", "rate-improve", "build", "build-collect", "build-yield", "opportunity", "editor", "editor-text", "editor-finish", "edit", "audio", "guide"] as const;
type Screen = (typeof SCREENS)[number];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The Studio API, answered from the fixtures. Everything else goes to the network. */
function installMock(thumbs: fx.Thumb[], durationSec: number, screen: Screen): () => void {
  const real = window.fetch.bind(window);
  const state = screen === "build-collect" ? "collecting" : "ready";
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const p = url.pathname;
    // Storage uploads (the WAV for transcription) land nowhere.
    if (url.hostname.endsWith("placeholder.supabase.co")) return json({ Key: p, Id: "lab" });
    if (!p.startsWith("/api/")) return real(input, init);
    if (p === "/api/studio/projects" && method === "GET") return json({ projects: [fx.summary()], limits: { clipsPerProject: 30, footageMinutes: 30, uploadMb: 2000 }, usage: { meter: "content_build", used: 1, limit: 10, remaining: 9, resetsOn: "2026-12-01" }, transcription: true, features: { autoBuild: true } });
    if (p === "/api/studio/projects" && method === "POST") return json({ id: fx.PROJECT_ID });
    if (p === `/api/studio/projects/${fx.PROJECT_ID}` && method === "GET") return json(fx.project(thumbs, durationSec, state));
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/opportunities/0`) return json(fx.build(thumbs, durationSec, 0));
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/batch`) return json({ existing: [], history: null, accounts: [], accountsComplete: true, builds: [], canSchedule: true, planError: null, roleBlocked: false });
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/brief` && method === "GET") return json({ builds: [] });
    if (p === `/api/studio/projects/${fx.PROJECT_ID}/edit`) return json(fx.build(thumbs, durationSec, -1));
    if (p.startsWith("/api/studio/builds/") && p.endsWith("/music/auto")) return json({ state: "off" });
    if (p.startsWith("/api/studio/builds/") && method === "GET") return json(fx.playerData(thumbs, durationSec, p.includes(fx.MANUAL_BUILD_ID) ? -1 : 0));
    if (p.startsWith("/api/studio/builds/") && method === "PATCH") { const b = (await (init?.body ? JSON.parse(String(init.body)) : null)) as { edl?: unknown } | null; const base = fx.build(thumbs, durationSec, p.includes(fx.MANUAL_BUILD_ID) ? -1 : 0); return json({ ...base, edl: b?.edl ?? base.edl }); }
    if (p === "/api/studio/learn") return json({ outcomes: [], lessons: { published: 0, settledCount: 0, lessons: [], best: null, summary: "No posts made in Content Studio have been published yet." } });
    if (p === "/api/studio/videos") return json({ videos: fx.videos() });
    if (p === "/api/studio/library") return json({ clips: fx.library(thumbs, durationSec) });
    if (p === "/api/studio/style") return json({ brand: null, templates: [] });
    if (p === "/api/studio/music") return json({ auto: true });
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
      // ?tab=Timeline (or Performance, Directions, Improve) opens that workspace once the analysis is back.
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
      case "editor": case "editor-text": case "editor-finish":
        return <ClipBuilder buildId={fx.BUILD_ID} title="The cheese pull, smash to order" fixture={fx.playerData(thumbs, duration, 0)} initialPanel={screen === "editor-text" ? "text" : screen === "editor-finish" ? "finish" : "cut"} onBack={noop} />;
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
