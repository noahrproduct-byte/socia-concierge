"use client";

// The AI Clipper's two ways in: a long video (the clipper) or live Twitch
// streams (Live streams). The tab is in the address (?tab=streams), so the
// Twitch sign-in lands back on it.
import { useState, type ReactNode } from "react";

export default function ClipperTabs({ initial, videos, streams }: { initial: "videos" | "streams"; videos: ReactNode; streams: ReactNode | null }) {
  const [tab, setTab] = useState<"videos" | "streams">(streams ? initial : "videos");
  const pick = (t: "videos" | "streams") => {
    setTab(t);
    const u = new URL(window.location.href);
    if (t === "streams") u.searchParams.set("tab", "streams"); else u.searchParams.delete("tab");
    u.searchParams.delete("twitch");
    window.history.replaceState(null, "", u.toString());
  };
  return (
    <>
      {streams && (
        <div className="ai-tabs" role="tablist" aria-label="What to clip">
          <button type="button" role="tab" aria-selected={tab === "videos"} className={`ai-tab${tab === "videos" ? " is-on" : ""}`} onClick={() => pick("videos")}>Long videos</button>
          <button type="button" role="tab" aria-selected={tab === "streams"} className={`ai-tab${tab === "streams" ? " is-on" : ""}`} onClick={() => pick("streams")}>Live streams</button>
        </div>
      )}
      <div role="tabpanel" hidden={tab !== "videos"}>{videos}</div>
      {streams && <div role="tabpanel" hidden={tab !== "streams"}>{streams}</div>}
    </>
  );
}
