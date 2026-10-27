// Footage: the standing clip library. Pure helpers over the shapes the page
// already has (a StudioProject whose kind is "library"), so the page and the
// API agree on what "new footage" and "what SOCIA made from it" mean. Nothing
// here talks to the database; the route does.
import type { StudioClip, StudioProject } from "./types";

export type LibraryBuild = {
  opportunityIdx: number;
  title: string;
  /** a rendered file exists in storage */
  rendered: boolean;
  /** a Calendar draft (or later) was made from it */
  postId: string | null;
};

export type LibraryStatus = {
  /** clips whose footage is still on file (not expired, not failed) */
  usable: number;
  /** usable clips the last Content Yield never saw; 0 when there is no yield */
  newSinceYield: number;
  /** the last understanding finished (Content Yield exists) */
  hasYield: boolean;
  /** footage changed since the yield: looking again is worth it */
  stale: boolean;
  posts: number;
  rendered: number;
  drafted: number;
};

const usableClip = (c: StudioClip): boolean => c.status === "uploaded" || c.status === "ready";

/**
 * What the library holds and what has become of it. A clip is new when it was
 * added after the last Content Yield was written, or never got a card (a clip
 * whose card was reused from an earlier upload still counts as new here: this
 * yield never saw it).
 */
export function libraryStatus(project: Pick<StudioProject, "clips" | "yield">, builds: LibraryBuild[]): LibraryStatus {
  const usable = project.clips.filter(usableClip);
  const hasYield = Boolean(project.yield);
  const since = project.yield ? new Date(project.yield.createdAt).getTime() : null;
  const newSinceYield = since == null ? 0 : usable.filter((c) => !c.card || new Date(c.addedAt).getTime() > since).length;
  return {
    usable: usable.length,
    newSinceYield,
    hasYield,
    stale: hasYield && newSinceYield > 0,
    posts: project.yield?.opportunities.length ?? 0,
    rendered: builds.filter((b) => b.rendered).length,
    drafted: builds.filter((b) => b.postId).length,
  };
}

/** The one line under the Footage heading: what is here and what is next. */
export function libraryLine(s: LibraryStatus, retentionDays: number | null): string {
  if (!s.usable) return `Nothing here yet. Drop clips whenever you shoot; footage is kept${retentionDays ? ` for ${retentionDays} days` : ""} and SOCIA finds the posts in it.`;
  const clips = `${s.usable} clip${s.usable === 1 ? "" : "s"} on file`;
  if (!s.hasYield) return `${clips}. Not understood yet.`;
  if (s.stale) return `${clips}, ${s.newSinceYield} new since SOCIA last looked. ${s.posts} post${s.posts === 1 ? "" : "s"} found so far.`;
  return `${clips}. ${s.posts} post${s.posts === 1 ? "" : "s"} found${s.drafted ? `, ${s.drafted} drafted` : ""}${s.rendered ? `, ${s.rendered} rendered` : ""}.`;
}
