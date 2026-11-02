// Your clips: every clip uploaded to Content Studio, kept until the person
// deletes it, so it can be posted again or used in a new video later. The
// same footage added to several projects is one clip here (the newest copy).
// A clip used in a new video is copied into that project's own folder, so
// deleting either project never breaks the other. Pure.
import { clipFolder } from "./storage";

export type LibraryClip = {
  id: string;
  projectId: string;
  projectTitle: string | null;
  name: string;
  durationSec: number | null;
  bytes: number;
  addedAt: string;
  thumb: string | null;
};

export const MAX_COPY = 20;

/** One entry per piece of footage (by fingerprint), newest first. */
export function dedupeByFootage<T extends { fingerprint: string; created_at: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((r) => {
    if (seen.has(r.fingerprint)) return false;
    seen.add(r.fingerprint);
    return true;
  });
}

/**
 * Where a clip's files go when it is copied into another project: the same
 * file names under the new clip's own folder. A path outside the old clip's
 * folder is never copied.
 */
export function copyPaths(
  from: { folder: string; source: string | null; frames: { t: number; path: string }[]; audio: string | null },
  to: { uploaderId: string; projectId: string; clipId: string },
): { pairs: [string, string][]; source: string | null; frames: { t: number; path: string }[]; audio: string | null } {
  const dest = clipFolder(to.uploaderId, to.projectId, to.clipId);
  const inside = (p: string | null) => Boolean(p && p.startsWith(`${from.folder}/`) && !p.split("/").some((s) => s === ".." || s === "."));
  const move = (p: string) => `${dest}/${p.slice(from.folder.length + 1)}`;
  const pairs: [string, string][] = [];
  const source = inside(from.source) ? move(from.source!) : null;
  if (source) pairs.push([from.source!, source]);
  const frames = from.frames.filter((f) => inside(f.path)).map((f) => { const p = move(f.path); pairs.push([f.path, p]); return { t: f.t, path: p }; });
  const audio = inside(from.audio) ? move(from.audio!) : null;
  if (audio) pairs.push([from.audio!, audio]);
  return { pairs, source, frames, audio };
}

/** The next free clip position: one past the highest, so a deleted clip's gap never makes two clips share one. */
export const nextPosition = (rows: { position: number }[]): number => rows.reduce((m, r) => Math.max(m, r.position + 1), 0);
