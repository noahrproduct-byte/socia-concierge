// The creative direction chosen before the first cut in the Video editor:
// pace, captions, animation, transitions, music, what leads (the person or
// the screen) and the look. Each choice becomes a plain instruction added to
// the brief the cut is made from, so it reaches the editor the same way a
// typed prompt does and nothing claims a setting the editor doesn't have.
// The editor reads "music" and "captions" as asks wherever they appear
// (lib/studioClips/briefIntent.ts), so the "none" choices never name them.
// Defaults come from the creative style chosen in Ask SOCIA when there is one
// (lib/research/direction.ts), so the person can go straight to Make the
// video. Pure and browser-safe.

import type { CreativeStyle } from "@/lib/research/direction";
import { PROMPT_MAX } from "./reference";

export const DIRECTION_OPTIONS = {
  pace: { label: "Editing pace", options: [["calm", "Calm"], ["steady", "Steady"], ["fast", "Fast"]] },
  captions: { label: "Captions", options: [["none", "None"], ["clean", "Clean lines"], ["bold", "Bold key words"], ["word", "Word by word"]] },
  animation: { label: "Animation", options: [["none", "None"], ["subtle", "Subtle"], ["lots", "Lots"]] },
  transitions: { label: "Transitions", options: [["cuts", "Hard cuts"], ["smooth", "Smooth"], ["punchy", "Punchy"]] },
  music: { label: "Music mood", options: [["none", "No music"], ["calm", "Calm"], ["upbeat", "Upbeat"], ["dramatic", "Dramatic"]] },
  lead: { label: "What leads", options: [["person", "Talking head"], ["screen", "Screen recording"], ["balanced", "Balanced"]] },
  look: { label: "Look", options: [["natural", "Natural"], ["cinematic", "Cinematic"], ["bright", "Bright and punchy"]] },
} as const;

export type DirectionKey = keyof typeof DIRECTION_OPTIONS;
export type EditDirection = { [K in DirectionKey]: (typeof DIRECTION_OPTIONS)[K]["options"][number][0] };

export const DEFAULT_DIRECTION: EditDirection = { pace: "steady", captions: "bold", animation: "subtle", transitions: "cuts", music: "none", lead: "balanced", look: "natural" };

const BY_STYLE: Record<CreativeStyle, Partial<EditDirection>> = {
  talking_head_story: { pace: "calm", captions: "clean", animation: "none", transitions: "cuts", music: "none", lead: "person", look: "natural" },
  talking_head_graphics: { pace: "steady", captions: "bold", animation: "lots", transitions: "cuts", music: "none", lead: "person" },
  product_demo: { pace: "steady", captions: "bold", animation: "subtle", transitions: "smooth", music: "calm", lead: "screen" },
  fast_explainer: { pace: "fast", captions: "word", animation: "lots", transitions: "punchy", music: "upbeat", lead: "balanced", look: "bright" },
  screen_recording: { pace: "steady", captions: "clean", animation: "subtle", transitions: "cuts", music: "calm", lead: "screen" },
  pov_sketch: { pace: "fast", captions: "bold", animation: "none", transitions: "punchy", music: "none", lead: "person" },
  tutorial: { pace: "steady", captions: "clean", animation: "subtle", transitions: "cuts", music: "calm", lead: "balanced" },
  montage: { pace: "fast", captions: "bold", animation: "subtle", transitions: "punchy", music: "upbeat", lead: "balanced", look: "cinematic" },
  animated: { pace: "steady", captions: "bold", animation: "lots", transitions: "smooth", music: "upbeat", lead: "screen", look: "bright" },
};

/** The defaults for a creative style (or the plain defaults without one). */
export function directionFor(style: CreativeStyle | null | undefined): EditDirection {
  return { ...DEFAULT_DIRECTION, ...(style ? BY_STYLE[style] : {}) };
}

const INSTR: { [K in DirectionKey]: Record<EditDirection[K], string> } = {
  pace: { calm: "Calm pace: let shots breathe, cut on full sentences.", steady: "Steady pace: a cut every two to four seconds.", fast: "Fast pace: a cut every one to two seconds, no dead air." },
  captions: { none: "Leave the spoken words off the screen.", clean: "Clean captions: short lines at the bottom, no emphasis.", bold: "Captions with the key word bold or larger on each line.", word: "Captions one to three words at a time, in sync with the voice." },
  animation: { none: "No animated graphics.", subtle: "A few subtle motions: a slow push-in or one animated word.", lots: "Animated text and graphics on the key points." },
  transitions: { cuts: "Hard cuts between shots.", smooth: "Smooth transitions between scenes.", punchy: "Punchy transitions: whips, zooms or cuts on action." },
  music: { none: "Keep only the original sound.", calm: "A calm music bed under the voice.", upbeat: "Upbeat music, cut to its beat.", dramatic: "Dramatic music that builds to the payoff." },
  lead: { person: "Keep the person on screen most of the time.", screen: "Lead with the screen recording or the product; the person in a corner or in voice.", balanced: "Balance the person and the screen or product." },
  look: { natural: "Natural colour.", cinematic: "Cinematic look: richer contrast, a soft grade.", bright: "Bright, punchy colour." },
};

/** The direction as plain instructions for the cut. */
export function directionText(d: EditDirection): string {
  return `Creative direction: ${(Object.keys(INSTR) as DirectionKey[]).map((k) => (INSTR[k] as Record<string, string>)[d[k]]).join(" ")}`;
}

/** A short summary line for the panel. */
export function directionSummary(d: EditDirection): string {
  return (Object.keys(DIRECTION_OPTIONS) as DirectionKey[]).map((k) => (DIRECTION_OPTIONS[k].options as readonly (readonly [string, string])[]).find(([id]) => id === d[k])?.[1] ?? d[k]).join(" · ");
}

/** The brief with the direction added, within the editor's prompt limit (the brief gives way, never the direction). */
export function withDirection(brief: string, d: EditDirection | null): string {
  if (!d) return brief;
  const add = directionText(d);
  const room = PROMPT_MAX - add.length - 2;
  const b = brief.trim();
  return `${b.length > room ? b.slice(0, Math.max(0, room)).replace(/\s+\S*$/, "") : b}${b ? "\n\n" : ""}${add}`.slice(0, PROMPT_MAX);
}
