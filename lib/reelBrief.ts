// How SOCIA describes a Reel to copy, in its own words: what it does (its hook structure, topic and format) and how
// to make your own version. Shared by Discover's cards, the Dashboard and the Video editor's prompt (which never
// carries the Reel's link, account or numbers: those go as the reference video). Pure and browser-safe.
import type { ProvenReel } from "./trendSignals";

const hookName = (h: string) => h.replace(/ hook$/i, "");

/** How to open your own version, for each hook structure SOCIA recognises (lib/discovery.ts hook tags, plus "Question"). */
const HOOK_HOW: Record<string, string> = {
  "POV": "Open as a POV: the camera is the viewer, and the first words name their situation.",
  "Question": "Open with a question your audience is already asking.",
  "Listicle hook": "Open with the number and what the list is of.",
  "Contrarian hook": "Open by naming what most people get wrong.",
  "Comparison": "Open with the two things side by side.",
  "Time contrast": "Open on the before, then cut to the after.",
  "Levels / tiers": "Open on the first level and say how many there are.",
  "First-person challenge": "Open by saying what you are about to try.",
  "Superlative": "Open on the one thing you would call your best.",
  "High-drama framing": "Open on the moment with the most at stake.",
};

/** What the Reel does, in the words of its own data: its hook structure, topic and format. */
export function does(r: ProvenReel): string[] {
  return [
    ...r.structures.slice(0, 1).map((h) => `Hook: ${hookName(h)}`),
    ...r.topics.slice(0, 1).map((t) => `About: ${t}`),
    `Format: ${r.format}`,
  ];
}

/** How to make your own version, from what the Reel does. */
export function recipe(r: ProvenReel): string {
  // Without a named hook, the Reel's own opening line (or caption) says what to borrow, so no two cards read the same.
  const own = (t: string | null | undefined) => (t ? t.replace(/\s+/g, " ").trim().slice(0, 70) : "");
  const open = HOOK_HOW[r.structures[0] ?? ""]
    ?? (own(r.line) ? `Open the way it does, "${own(r.line)}", said your own way.`
      : own(r.title) ? `Borrow its idea, "${own(r.title)}", and show it at your place.`
      : "Open on the moment itself, with no setup line.");
  return `${open} Film it as a ${r.format} with your own subject, footage and words.`;
}


/**
 * What the Video editor is asked to make from a Discover Reel: only the creative instructions for the person's own
 * version. The Reel itself (its link, account and numbers) goes as the reference video, never into the prompt.
 */
export function reelEditorPrompt(r: ProvenReel): string {
  return [
    `Make my own version of this ${r.format}'s idea with my clips.`,
    ...does(r).filter((x) => !x.startsWith("Format:")),
    `How to make mine: ${r.make ?? recipe(r)}`,
    "Keep the same format, hook structure and angle, with my own subject, footage and words; never its wording.",
    "Follow the reference video's length, pace, order of shots and on-screen text style.",
  ].join("\n");
}

