// An unsaved edit kept in this browser, so a reload or a closed tab never
// loses work: the editor mirrors its unsaved cut here and offers it back the
// next time the same build opens, when it differs from what the server has.
// Pure apart from localStorage; fail-safe (private windows, full storage).
import type { Edl } from "./types";

const KEY = (buildId: string) => `socia.editor.draft.${buildId}`;
/** A kept edit older than this is dropped (a week). */
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** The clips' signed links last an hour (lib/studioClips/storage.ts): they are signed again after this long. */
export const SOURCE_REFRESH_MS = 50 * 60 * 1000;

export function writeLocalDraft(buildId: string, edl: Edl): void {
  try { localStorage.setItem(KEY(buildId), JSON.stringify({ at: Date.now(), edl })); } catch { /* no storage */ }
}

export function clearLocalDraft(buildId: string): void {
  try { localStorage.removeItem(KEY(buildId)); } catch { /* no storage */ }
}

/** The kept edit for this build when there is one that differs from `current` and isn't stale; null otherwise. */
export function readLocalDraft(buildId: string, current: Edl, now = Date.now()): Edl | null {
  try {
    const raw = localStorage.getItem(KEY(buildId));
    if (!raw) return null;
    const j = JSON.parse(raw) as { at?: number; edl?: Edl };
    if (!j?.edl || typeof j.at !== "number" || now - j.at > MAX_AGE_MS || !Array.isArray(j.edl.segments) || !j.edl.segments.length) { clearLocalDraft(buildId); return null; }
    if (JSON.stringify(j.edl) === JSON.stringify(current)) { clearLocalDraft(buildId); return null; }
    return j.edl;
  } catch {
    return null;
  }
}
