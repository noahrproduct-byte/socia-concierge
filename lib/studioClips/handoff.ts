// A file passed from one part of Content Studio to another in this tab (Rate
// → Audio: "Add music to this video"; Rate → Video editor: "Put the text on
// the video", with the lines), so the person doesn't pick it again; or just a
// prompt (Dashboard video idea → Video editor). Memory only; gone on a
// reload. Client only.
import type { OverlayLine } from "./overlay";

export type HandoffData = { overlays?: OverlayLine[]; prompt?: string };
let pending: { files: File[]; to: string; data: HandoffData; at: number } | null = null;

/** A handoff is for the click that made it: one not taken within this long is dropped. */
const HANDOFF_MS = 2 * 60_000;

export function handFiles(to: string, files: File[], data: HandoffData = {}): void {
  pending = { files, to, data, at: Date.now() };
}

/** The files (and what goes with them) handed to this part, once. */
export function takeHandoff(to: string): { files: File[]; data: HandoffData } {
  if (pending && Date.now() - pending.at > HANDOFF_MS) pending = null;
  if (!pending || pending.to !== to) return { files: [], data: {} };
  const p = pending;
  pending = null;
  return { files: p.files, data: p.data };
}

export const takeFiles = (to: string): File[] => takeHandoff(to).files;
