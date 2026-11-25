"use client";

// The Video editor's screen (QuickEdit) as if "Make this video" came from Discover, the Planner or Ask SOCIA, for
// looking at the reference card and its states without an account. Development only (app/dev/reference-lab). The
// Reel lookup answers from this page: ?case=ok serves SOCIA's own sample video (public/landing/reel.mp4), ?case=fail
// says Instagram didn't share the file, ?case=music serves a reference with music and a two-sound library for the
// Reference music card. That case needs local files nobody commits (public/dev-lab is untracked):
//   ffmpeg -i public/landing/reel.mp4 -ss 3 -t 8 -i public/intro/intro-sound.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -shortest public/dev-lab/ref.mp4
//   ffmpeg -i public/intro/intro-sound.mp3 -c:a aac public/dev-lab/song.m4a          (the same recording: matches at 0:03)
//   ffmpeg -f lavfi -i "sine=frequency=220:duration=20" -f lavfi -i "anoisesrc=d=20:a=0.3" -filter_complex "[0][1]amix=inputs=2,volume='0.3+0.7*gt(mod(t,0.43),0.3)':eval=frame" -c:a aac public/dev-lab/other.m4a
// Nothing here is real data.
import { useEffect, useState } from "react";
import QuickEdit from "./QuickEdit";
import type { HandoffReference } from "@/lib/studioClips/handoff";

export default function ReferenceLab() {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(true);
  const [withMusic, setWithMusic] = useState(false);
  useEffect(() => {
    const which = new URLSearchParams(window.location.search).get("case");
    const fail = which === "fail", music = which === "music";
    setOk(!fail);
    setWithMusic(music);
    const real = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      const u = String(url);
      const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
      if (u.startsWith("/api/studio/reference/reel")) {
        await new Promise((r) => setTimeout(r, 500));
        const reel = { link: "https://www.instagram.com/reel/LABref123/", code: music ? "LABmusic1" : "LABref123", handle: "fashionhouse", account: "Fashion House", thumb: "/landing/cafe/espresso.jpg", caption: "Three outfits for three moods", format: "Reel", views: 412000, multiplier: 9.4 };
        return fail ? json({ reel, error: "Instagram didn't share this Reel's video file. Upload it as a file instead.", code: "no_video" }, 404) : json({ reel, media: music ? "/dev-lab/ref.mp4" : "/landing/reel.mp4" });
      }
      if (u.startsWith("/api/studio/transcribe")) return json({ transcript: null, reason: "limit" });
      if (u.startsWith("/api/studio/library")) return json({ clips: [] });
      if (u.startsWith("/api/studio/style")) return json({ brand: null, templates: [] });
      // AI music: answered here after a short wait (nothing is made or charged in the lab).
      if (u.startsWith("/api/studio/tracks/generate")) {
        await new Promise((r) => setTimeout(r, 1500));
        return json({ track: { id: "lab-ai", name: "AI music: Warm acoustic", sourceName: "SOCIA AI music", durationSec: 16, createdAt: "2026-11-25T10:00:00Z", lastUsedAt: null, url: "/dev-lab/song.m4a" }, seconds: 16 });
      }
      if (u.startsWith("/api/studio/tracks")) return json({ tracks: music ? [
        { id: "lab-other", name: "Pulse loop", sourceName: "pulse.m4a", durationSec: 20, createdAt: "2026-11-20T10:00:00Z", lastUsedAt: null, url: "/dev-lab/other.m4a" },
        { id: "lab-same", name: "Intro theme", sourceName: "intro.m4a", durationSec: 12, createdAt: "2026-11-19T10:00:00Z", lastUsedAt: null, url: "/dev-lab/song.m4a" },
      ] : [] });
      if (u.startsWith("/api/studio/videos")) return json({ videos: [] });
      return real(url, init);
    };
    setReady(true);
    return () => { window.fetch = real; };
  }, []);
  const reference: HandoffReference = {
    url: null, name: "@fashionhouse Reel.mp4",
    reel: { link: "https://www.instagram.com/reel/LABref123/", code: "LABref123", handle: "fashionhouse", account: "Fashion House", thumb: "/landing/cafe/espresso.jpg", caption: "Three outfits for three moods", format: "Reel", views: 412000, multiplier: 9.4, structure: "Three-option reveal with quick cuts" },
  };
  return (
    <div className="s-page">
      <p className="cbp-muted">Case: {!ok ? "video not shared" : withMusic ? "video with music, two sounds in the library" : "video found (sample)"}</p>
      {ready && (
        <QuickEdit viewerId="lab-viewer" locals={[]} uploading={false} projectId={null} understood={false} canTranscribe canPicture drag={false}
          onPick={() => {}} onRemove={() => {}} understand={async () => null} onOpenEditor={() => {}} onManual={() => {}} manualBusy={false} onReset={() => {}}
          handed={{ prompt: "Video idea: Three pizzas for three moods\nOpening: \"Your mood decides your pizza tonight\"", reference }} />
      )}
    </div>
  );
}
