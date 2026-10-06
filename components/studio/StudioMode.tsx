"use client";

import Link from "next/link";
import { Sparkles, Layers } from "lucide-react";

export type StudioModeId = "quick" | "clips";

// The two ways into Content Studio. Quick Analyze improves one finished
// post; Build from Clips starts from raw footage. The mode lives in the URL
// so a refresh keeps it.
export default function StudioMode({ mode }: { mode: StudioModeId }) {
  return (
    <nav className="st-tabs cb-mode" aria-label="Content Studio mode">
      <Link href="/studio" role="tab" aria-selected={mode === "quick"} className={mode === "quick" ? "on" : ""}><Sparkles size={13} /> Quick analyze</Link>
      <Link href="/studio?mode=clips" role="tab" aria-selected={mode === "clips"} className={mode === "clips" ? "on" : ""}><Layers size={13} /> Build from clips</Link>
      <span className="cb-mode-hint">{mode === "quick" ? "Improve one post you've already made." : "Upload raw clips; SOCIA finds the posts in them."}</span>
    </nav>
  );
}
