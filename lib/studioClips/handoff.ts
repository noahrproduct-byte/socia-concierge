// A file passed from one part of Content Studio to another in this tab (Rate
// → Audio: "Add music to this video"; Rate → Video editor: "Put the text on
// the video", with the text layers), so the person doesn't pick it again; or just a
// prompt (Dashboard video idea → Video editor). Memory only; gone on a
// reload. Client only.
import type { EdlText } from "./types";
import type { EditorPanel } from "@/lib/studioFixes";

/** A fix queued from Rate → Improve: the editor tab to open on, and what to apply to the cut first. */
export type HandoffFix = { panel: EditorPanel; cleanSound?: boolean; cuts?: { start: number; end: number }[] };

/** `layers`: text lines (preset, words, timing) ready to go on the cut's EDL; `fix`: what Rate asked the editor to do. */
/**
 * A video to read as the reference for a brief: `url` is a link SOCIA serves for its file (a competitor's Reel from
 * Discover), null when Discover didn't have one; `reel` is the Reel itself (its link, creator, cover, caption,
 * numbers), so the editor can fetch it fresh, show where it came from and say plainly when it couldn't be studied.
 */
export type HandoffReference = { url: string | null; name: string; reel?: import("./referenceSource").ReelSource };
/** `autoMake`: start making the video as soon as the clips are in (Ask SOCIA's "send to the editor"). */
/** The creative style chosen in Ask SOCIA's reference gallery, for the editor's direction defaults. */
export type HandoffStyle = import("@/lib/research/direction").CreativeStyle;
export type HandoffData = { layers?: EdlText[]; prompt?: string; fix?: HandoffFix; reference?: HandoffReference; autoMake?: boolean; style?: HandoffStyle };
let pending: { files: File[]; to: string; data: HandoffData; at: number } | null = null;

/** A handoff is for the click that made it: one not taken within this long is dropped. */
const HANDOFF_MS = 2 * 60_000;

/** Fired when a handoff is made, so a part that is already open (Ask SOCIA on the Video editor page) takes it at once. */
export const HANDOFF_EVENT = "socia:studio-handoff";

export function handFiles(to: string, files: File[], data: HandoffData = {}): void {
  pending = { files, to, data, at: Date.now() };
  try { window.dispatchEvent(new CustomEvent(HANDOFF_EVENT, { detail: { to } })); } catch { /* not in a browser */ }
}

/** The files (and what goes with them) handed to this part, once. */
export function takeHandoff(to: string): { files: File[]; data: HandoffData } {
  if (pending && Date.now() - pending.at > HANDOFF_MS) pending = null;
  if (!pending || pending.to !== to) return { files: [], data: {} };
  const p = pending;
  pending = null;
  return { files: p.files, data: p.data };
}

