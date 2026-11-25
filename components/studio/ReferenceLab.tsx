"use client";

// The Video editor's prompt and reference panel as if "Make this video" came from Discover, for looking at the
// reference card and its states without an account. Development only (app/dev/reference-lab). The Reel lookup
// answers from this page: ?case=ok serves SOCIA's own sample video (public/landing/reel.mp4), ?case=fail says
// Instagram didn't share the file. Nothing here is real data.
import { useEffect, useState } from "react";
import BriefPanel from "./BriefPanel";
import type { HandoffReference } from "@/lib/studioClips/handoff";

export default function ReferenceLab() {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const fail = new URLSearchParams(window.location.search).get("case") === "fail";
    setOk(!fail);
    const real = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      const u = String(url);
      const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
      if (u.startsWith("/api/studio/reference/reel")) {
        await new Promise((r) => setTimeout(r, 500));
        const reel = { link: "https://www.instagram.com/reel/LABref123/", code: "LABref123", handle: "fashionhouse", account: "Fashion House", thumb: "/landing/cafe/espresso.jpg", caption: "Three outfits for three moods", format: "Reel", views: 412000, multiplier: 9.4 };
        return fail ? json({ reel, error: "Instagram didn't share this Reel's video file. Upload it as a file instead.", code: "no_video" }, 404) : json({ reel, media: "/landing/reel.mp4" });
      }
      if (u.startsWith("/api/studio/transcribe")) return json({ transcript: null, reason: "limit" });
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
    <div className="s-page" style={{ maxWidth: 760 }}>
      <p className="cbp-muted">Case: {ok ? "video found (sample)" : "video not shared"}</p>
      {ready && (
        <BriefPanel projectId={null} viewerId="lab-viewer" canMake heading="Prompt and reference"
          initialPrompt={"Video idea: Three pizzas for three moods\nOpening: \"Your mood decides your pizza tonight\""}
          initialReference={reference} onOpen={() => {}} />
      )}
    </div>
  );
}
