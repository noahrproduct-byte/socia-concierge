"use client";

import Link from "next/link";
import { Sparkles, Layers, PenLine, Film } from "lucide-react";

export type StudioModeId = "quick" | "clips" | "prompt";

// The ways into Content Studio. Quick Analyze improves one finished post;
// Build from Clips finds the posts in one shoot's raw footage; Prompt cuts
// one video from clips and a written brief. Footage, the standing library,
// has its own page. The mode lives in the URL so a refresh keeps it.
const HINT: Record<StudioModeId, string> = {
  quick: "Improve one post you've already made.",
  clips: "Upload raw clips; SOCIA finds the posts in them.",
  prompt: "Drop clips, describe the video, SOCIA cuts it.",
};

export default function StudioMode({ mode }: { mode: StudioModeId }) {
  return (
    <nav className="st-tabs cb-mode" aria-label="Content Studio mode">
      <Link href="/studio" role="tab" aria-selected={mode === "quick"} className={mode === "quick" ? "on" : ""}><Sparkles size={13} /> Quick analyze</Link>
      <Link href="/studio?mode=clips" role="tab" aria-selected={mode === "clips"} className={mode === "clips" ? "on" : ""}><Layers size={13} /> Build from clips</Link>
      <Link href="/studio?mode=prompt" role="tab" aria-selected={mode === "prompt"} className={mode === "prompt" ? "on" : ""}><PenLine size={13} /> From a brief</Link>
      <Link href="/footage" className="cb-mode-link"><Film size={13} /> Footage library</Link>
      <span className="cb-mode-hint">{HINT[mode]}</span>
    </nav>
  );
}
