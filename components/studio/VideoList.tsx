"use client";

// Content Studio · Edit: every video made in this brand, newest first. Each
// opens in the editor; the line under it says what it is and where it went.
import Link from "next/link";
import { Film, Loader2 } from "lucide-react";
import type { VideoKind, VideoSummary } from "@/lib/studioClips/videos";

const KIND: Record<VideoKind, string> = {
  idea: "Made from an idea in your clips",
  clip: "One clip on its own",
  brief: "Made from your description",
  edit: "Your own edit",
};

export default function VideoList({ videos, onOpen }: { videos: VideoSummary[] | null; onOpen: (v: VideoSummary) => void }) {
  return (
    <div className="ov-card cb-projects">
      <div className="ov-card-head"><h2><Film size={15} /> Your videos</h2></div>
      {videos == null ? (
        <p className="ov-source"><Loader2 size={12} className="spin" /> Loading your videos</p>
      ) : !videos.length ? (
        <p className="ov-source">No videos yet. Upload one here, or drop your raw clips in <Link href="/studio?mode=clips">Build</Link> and SOCIA makes them.</p>
      ) : (
        <ul>
          {videos.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => onOpen(v)}>
                <span>
                  <b>{v.title}</b>
                  <small>{KIND[v.kind]} · {v.postId ? "in your calendar" : v.rendered ? "exported" : "not exported yet"} · {new Date(v.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
