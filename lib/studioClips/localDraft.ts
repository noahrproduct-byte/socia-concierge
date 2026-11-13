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

// ---- an export in flight ----
// The reserved storage path and the quality of an export that is rendering in
// this browser. A reload mid-render finds it and makes the video again on the
// same path (the plan unit was taken when the path was reserved, so nothing
// is charged twice); the record is dropped when the export ends either way.

const EXPORT_KEY = (buildId: string) => `socia.editor.export.${buildId}`;
/** A reserved path is good for this long (the export route's signature is checked when the draft is saved). */
const EXPORT_MAX_AGE_MS = 50 * 60 * 1000;

export type LocalExport = { path: string; quality: "high" | "medium" };

export function writeLocalExport(buildId: string, e: LocalExport): void {
  try { localStorage.setItem(EXPORT_KEY(buildId), JSON.stringify({ at: Date.now(), ...e })); } catch { /* no storage */ }
}

export function clearLocalExport(buildId: string): void {
  try { localStorage.removeItem(EXPORT_KEY(buildId)); } catch { /* no storage */ }
}

export function readLocalExport(buildId: string, now = Date.now()): LocalExport | null {
  try {
    const raw = localStorage.getItem(EXPORT_KEY(buildId));
    if (!raw) return null;
    const j = JSON.parse(raw) as { at?: number; path?: string; quality?: string };
    if (typeof j.at !== "number" || typeof j.path !== "string" || !j.path || now - j.at > EXPORT_MAX_AGE_MS) { clearLocalExport(buildId); return null; }
    return { path: j.path, quality: j.quality === "medium" ? "medium" : "high" };
  } catch {
    return null;
  }
}
