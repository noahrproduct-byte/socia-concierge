"use client";

import Link from "next/link";
import { Gauge, Layers, Music, Scissors } from "lucide-react";

export type StudioModeId = "quick" | "clips" | "edit" | "audio" | "guide";

// Content Studio: Rate a video you've made, Build videos from raw clips (and
// schedule them), Edit any video, and Audio: music for a video. Plan a post (the
// production guide) is opened from a planned post, so no tab is lit there.
// The mode lives in the URL so a refresh keeps it.
const HINT: Record<StudioModeId, string> = {
  quick: "Rate a video you've made and fix it before it goes out.",
  clips: "Drop raw clips. SOCIA makes the videos and schedules them after you check.",
  edit: "Open any video SOCIA made, or upload one, and edit it yourself.",
  audio: "Drop a video and SOCIA adds music made for it from your taste.",
  guide: "Hooks, script and shot list for a planned post, before you film.",
};

export default function StudioMode({ mode }: { mode: StudioModeId }) {
  const tab = (id: StudioModeId, href: string, icon: React.ReactNode, label: string) => (
    <Link href={href} role="tab" aria-selected={mode === id} className={mode === id ? "on" : ""}>{icon} {label}</Link>
  );
  return (
    <nav className="st-tabs cb-mode" aria-label="Content Studio">
      {tab("quick", "/studio", <Gauge size={13} />, "Rate")}
      {tab("clips", "/studio?mode=clips", <Layers size={13} />, "Build")}
      {tab("edit", "/studio?mode=edit", <Scissors size={13} />, "Edit")}
      {tab("audio", "/studio?mode=audio", <Music size={13} />, "Audio")}
      <span className="cb-mode-hint">{HINT[mode]}</span>
    </nav>
  );
}
