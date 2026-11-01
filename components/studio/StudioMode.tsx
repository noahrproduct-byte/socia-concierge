"use client";

import Link from "next/link";
import { Sparkles, Layers, ClipboardList, CalendarClock } from "lucide-react";

export type StudioModeId = "guide" | "quick" | "clips" | "autopost";

// The ways into Content Studio. Plan a post writes the concept and a
// production guide; Quick Analyze reviews one finished post; Build from Clips
// starts from raw footage. The mode lives in the URL so a refresh keeps it.
export default function StudioMode({ mode }: { mode: StudioModeId }) {
  return (
    <nav className="st-tabs cb-mode" aria-label="Content Studio mode">
      <Link href="/studio?mode=guide" role="tab" aria-selected={mode === "guide"} className={mode === "guide" ? "on" : ""}><ClipboardList size={13} /> Plan a post</Link>
      <Link href="/studio" role="tab" aria-selected={mode === "quick"} className={mode === "quick" ? "on" : ""}><Sparkles size={13} /> Quick analyze</Link>
      <Link href="/studio?mode=autopost" role="tab" aria-selected={mode === "autopost"} className={mode === "autopost" ? "on" : ""}><CalendarClock size={13} /> Clips to posts</Link>
      <Link href="/studio?mode=clips" role="tab" aria-selected={mode === "clips"} className={mode === "clips" ? "on" : ""}><Layers size={13} /> Build from clips</Link>
      <span className="cb-mode-hint">{mode === "guide" ? "Hooks, script and shot list for one post, before you film." : mode === "quick" ? "Review one post you've already made." : mode === "autopost" ? "Drop clips; SOCIA makes the videos and schedules them after you check." : "Upload raw clips; SOCIA finds the posts in them."}</span>
    </nav>
  );
}
