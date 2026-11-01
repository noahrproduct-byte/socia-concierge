// The person's videos in Content Studio's Edit tab: every cut SOCIA made or
// they made themselves, newest first, each with a plain name. The name comes
// from what the cut is, never invented: the idea it was built from, the
// clip it is, the brief it follows, or the project it edits. Pure.
import { fileLabel } from "@/lib/publishing/postLabel";
import { isBriefIdx, titleFor } from "./reference";
import type { EdlBrief } from "./types";

export type VideoKind = "idea" | "clip" | "brief" | "edit";

export type VideoSummary = {
  id: string;
  projectId: string;
  title: string;
  kind: VideoKind;
  /** last saved */
  updatedAt: string;
  /** an MP4 of it has been made */
  rendered: boolean;
  /** it went to the calendar as this post */
  postId: string | null;
};

const MANUAL = -1;
const CLIP_BASE = -1000;

export function videoKind(idx: number): VideoKind {
  if (idx >= 0) return "idea";
  if (idx === MANUAL) return "edit";
  if (idx <= CLIP_BASE) return "clip";
  return isBriefIdx(idx) ? "brief" : "edit";
}

export function videoTitle(args: {
  idx: number;
  brief: EdlBrief | null | undefined;
  ideaTitle: string | null;
  clipName: string | null;
  projectTitle: string | null;
  projectDate: string;
}): string {
  const { idx, brief, ideaTitle, clipName, projectTitle, projectDate } = args;
  const day = new Date(projectDate);
  const dated = Number.isNaN(day.getTime()) ? "" : ` from ${day.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  switch (videoKind(idx)) {
    case "idea": return ideaTitle?.trim() || "An idea from your clips";
    case "clip": return fileLabel(clipName) ?? "One of your clips";
    case "brief": return brief?.prompt ? titleFor(brief.prompt, null) : brief?.referenceName ? `Like “${brief.referenceName}”` : "Your video";
    default: return projectTitle?.trim() ? `Your edit: ${projectTitle.trim()}` : `Your edit${dated}`;
  }
}
