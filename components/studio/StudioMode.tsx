"use client";

import Link from "next/link";
import { Clapperboard, Gauge, Images, Music, Scissors } from "lucide-react";
import "./studio-hub.css";

export type StudioModeId = "quick" | "clips" | "edit" | "audio" | "guide" | "make" | "animate" | "clipper" | "ai";

// Content Studio's five tools, each a tile: the Video editor (which asks
// whether to animate a video or edit clips), Rate, Audio, the AI Clipper and
// AI Studio (Umar, 2026-11-21: the Clipper and AI Studio moved in from the
// More panel). Plan a post (the production guide) is opened from a planned
// post, and a Build project from an old link, so no tile is lit there.
// The mode lives in the URL so a refresh keeps it.
const HINT: Record<StudioModeId, string> = {
  quick: "Rate a video you've made and fix it before it goes out.",
  clips: "A project from your clips: the videos SOCIA found in them, ready to check and schedule.",
  edit: "Put in clips, then a prompt or a video to copy. Or edit them yourself.",
  audio: "Drop a video and SOCIA puts in a song from your playlist that fits your taste.",
  guide: "Hooks, script and shot list for a planned post, before you film.",
  make: "Animate a video from a prompt, or edit clips you filmed.",
  animate: "Say what the video is about, add a video to copy if you have one, and SOCIA animates it.",
  clipper: "Turn a long video into short clips with captions.",
  ai: "Ideas from your brand, made into AI videos and images.",
};

const TILES: { id: StudioModeId; also?: StudioModeId[]; href: string; label: string; sub: string; Icon: typeof Gauge }[] = [
  { id: "make", also: ["edit", "animate", "clips"], href: "/studio?mode=make", label: "Video editor", sub: "Animate or edit", Icon: Scissors },
  { id: "quick", href: "/studio", label: "Rate", sub: "Score a video", Icon: Gauge },
  { id: "audio", href: "/studio?mode=audio", label: "Audio", sub: "Music for a video", Icon: Music },
  { id: "clipper", href: "/clipper", label: "AI Clipper", sub: "Long video to clips", Icon: Clapperboard },
  { id: "ai", href: "/ai-studio", label: "AI Studio", sub: "AI videos and images", Icon: Images },
];

export default function StudioMode({ mode }: { mode: StudioModeId }) {
  return (
    <nav className="stu-hub" aria-label="Content Studio">
      <ul>
        {TILES.map(({ id, also, href, label, sub, Icon }) => {
          const on = mode === id || Boolean(also?.includes(mode));
          return (
            <li key={id}>
              <Link href={href} aria-current={on ? "page" : undefined} className={on ? "on" : undefined}>
                <i aria-hidden><Icon /></i>
                <span><b>{label}</b><small>{sub}</small></span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="stu-hub-hint">{HINT[mode]}</p>
    </nav>
  );
}
