// The creative settings on the Video editor's one screen (components/studio/QuickEdit.tsx):
// what SOCIA recommends from the person's prompt, the footage, a reference video and a
// style chosen elsewhere (Ask SOCIA), and what each setting does to the cut.
//
// Two kinds of setting, and nothing that claims more than it does:
//   - asks: pace, what leads the frame, how many animated graphics and the
//     length. These become plain instructions added to the brief the cut is
//     made from (or to the instructions applied to a talking clip's cut), the
//     way a typed prompt reaches the editor.
//   - the look: the style (a theme), captions, caption animation, transitions,
//     colour and the frame shape. These are set on the cut itself, through the
//     editor's own theme overrides (lib/studioClips/themes/apply.ts
//     setThemeOverride), the same change the Captions, Transitions and Adjust
//     tabs make. "The style's own" leaves the theme as it ships.
//
// A setting the person changed is theirs: a new recommendation never moves it.
// Pure and browser-safe.

import type { CreativeStyle } from "@/lib/research/direction";
import { directionFor } from "./editDirection";
import { CAPTION_ANIMATIONS, CAPTION_STYLES, type CaptionAnimation, type CaptionStyleId } from "./style";
import { ASPECTS, TRANSITIONS, type TransitionKind } from "./types";
import { PROMPT_MAX } from "./reference";

export const PACES = [["auto", "SOCIA decides"], ["calm", "Calm"], ["steady", "Steady"], ["fast", "Fast"]] as const;
export const FOCUSES = [["auto", "SOCIA decides"], ["person", "The person talking"], ["screen", "The product or screen"], ["balanced", "Both"]] as const;
export const GRAPHICS = [["off", "None"], ["some", "A few"], ["lots", "Lots"]] as const;
export const COLOURS = [["style", "The style's own"], ["natural", "Natural"], ["warm", "Warm"], ["cinematic", "Cinematic"], ["bright", "Bright and punchy"]] as const;
export const DURATIONS = [0, 15, 30, 45, 60] as const;
/** What plays under the cut. "match" and "similar" use the reference's measured music (lib/music/referenceMusic.ts). */
export const MUSIC_MODES = [["pick", "The sound I choose"], ["match", "Match the reference's music and timing"], ["similar", "Similar energy, from my library"], ["none", "No music"]] as const;

export type Pace = (typeof PACES)[number][0];
export type Focus = (typeof FOCUSES)[number][0];
export type Graphics = (typeof GRAPHICS)[number][0];
export type Colour = (typeof COLOURS)[number][0];
export type AspectId = (typeof ASPECTS)[number]["id"];
export type MusicMode = (typeof MUSIC_MODES)[number][0];

export type Creative = {
  pace: Pace;
  focus: Focus;
  /** captions: the style's own, off, or one caption style (lib/studioClips/style.ts CAPTION_STYLES) */
  captions: "style" | "off" | CaptionStyleId;
  captionAnim: "style" | CaptionAnimation;
  transition: "style" | TransitionKind;
  colour: Colour;
  graphics: Graphics;
  /** target length in seconds; 0 = SOCIA decides */
  durationSec: number;
  aspect: AspectId;
  /** the music: the sound picked, the reference's song lined up, a similar one from the library, or none */
  music: MusicMode;
};

export type CreativeKey = keyof Creative;

export const DEFAULT_CREATIVE: Creative = {
  pace: "auto", focus: "auto", captions: "style", captionAnim: "style", transition: "style", colour: "style", graphics: "some", durationSec: 0, aspect: "9:16", music: "pick",
};

/** Colour grades, from the shipped themes (cinematic and energetic) and two plain ones. Letterbox off: it would crop a vertical video. */
const GRADES: Record<Exclude<Colour, "style">, Record<string, number>> = {
  natural: { contrast: 1, saturation: 1, warmth: 0, vignette: 0, grain: 0, chroma: 0, scanlines: 0, letterbox: 0 },
  warm: { contrast: 1.05, saturation: 1.05, warmth: 0.3, vignette: 0.1, grain: 0, chroma: 0, scanlines: 0, letterbox: 0 },
  cinematic: { contrast: 1.12, saturation: 0.92, warmth: 0.35, vignette: 0.35, grain: 0.12, chroma: 0, scanlines: 0, letterbox: 0 },
  bright: { contrast: 1.1, saturation: 1.2, warmth: 0, vignette: 0, grain: 0, chroma: 0, scanlines: 0, letterbox: 0 },
};

const label = <T extends readonly (readonly [string, string])[]>(list: T, id: string) => list.find(([k]) => k === id)?.[1] ?? id;
export const captionLabel = (c: Creative["captions"]) => (c === "style" ? "The style's own" : c === "off" ? "Off" : CAPTION_STYLES.find((s) => s.id === c)?.label ?? c);
export const animLabel = (a: Creative["captionAnim"]) => (a === "style" ? "The style's own" : CAPTION_ANIMATIONS.find((x) => x.id === a)?.label ?? a);
export const transitionLabel = (t: Creative["transition"]) => (t === "style" ? "The style's own" : TRANSITIONS.find((x) => x.id === t)?.label ?? t);
export const aspectLabel = (a: AspectId) => ASPECTS.find((x) => x.id === a)?.label ?? a;
export const paceLabel = (p: Pace) => label(PACES, p);
export const focusLabel = (f: Focus) => label(FOCUSES, f);
export const graphicsLabel = (g: Graphics) => label(GRAPHICS, g);
export const colourLabel = (c: Colour) => label(COLOURS, c);
export const musicModeLabel = (m: MusicMode) => label(MUSIC_MODES, m);
export const durationLabel = (s: number) => (s ? `About ${s} seconds` : "SOCIA decides");

/** What the recommendation is made from. Every field is optional: only what is really known is passed. */
export type RecommendInput = {
  prompt?: string;
  /** a creative style chosen in Ask SOCIA */
  style?: CreativeStyle | null;
  /** the reference video, as SOCIA read it: its length, its cuts, whether anyone speaks in it */
  reference?: { durationSec: number; cuts: number[] | null; speech: boolean } | null;
  /** the footage: how many clips, and whether one talking clip */
  clips?: { count: number } | null;
};

export type Recommendation = { creative: Partial<Creative>; reasons: string[] };

const has = (text: string, re: RegExp) => re.test(text);

/** SOCIA's recommended settings, and the reason for each one it sets. Only settings with a reason are set. */
export function recommend(input: RecommendInput): Recommendation {
  const out: Partial<Creative> = {};
  const reasons: string[] = [];
  const p = (input.prompt ?? "").toLowerCase();

  // A style chosen in Ask SOCIA: its pace, its lead and how much it animates.
  if (input.style) {
    const d = directionFor(input.style);
    out.pace = d.pace;
    out.focus = d.lead;
    out.graphics = d.animation === "none" ? "off" : d.animation === "lots" ? "lots" : "some";
    reasons.push("Pace, focus and graphics from the style you chose in Ask SOCIA.");
  }

  // The reference: its pace from its real cuts, its length, captions when someone speaks in it.
  const ref = input.reference;
  if (ref && ref.durationSec > 0) {
    if (ref.cuts) {
      const shots = ref.cuts.length + 1;
      const perSec = shots / ref.durationSec;
      out.pace = perSec >= 0.6 ? "fast" : perSec <= 0.25 ? "calm" : "steady";
      // Only a fast reference sets the transition: writing `undefined` here wiped the default and crashed the
      // editor's summary for every calm or steady reference (2026-11-25).
      if (perSec >= 0.6) out.transition = "cut";
      reasons.push(`${paceLabel(out.pace)} pace from the reference: ${shots} shot${shots === 1 ? "" : "s"} in ${Math.round(ref.durationSec)} seconds.`);
    }
    if (ref.durationSec <= 75) {
      const near = DURATIONS.filter((d) => d > 0).reduce((a, b) => (Math.abs(b - ref.durationSec) < Math.abs(a - ref.durationSec) ? b : a));
      out.durationSec = near;
      reasons.push(`About ${near} seconds, like the reference (${Math.round(ref.durationSec)} seconds).`);
    }
    if (ref.speech) { out.captions = "highlight"; reasons.push("Captions on the key words, because someone speaks in the reference."); }
  }

  // The prompt's own words win over both.
  if (p) {
    const said: string[] = [];
    if (has(p, /\b(fast|quick|energetic|hype|punchy|snappy|high[- ]energy)\b/)) { out.pace = "fast"; said.push("a fast pace"); }
    else if (has(p, /\b(calm|slow|relaxed|gentle|soft|elegant)\b/)) { out.pace = "calm"; said.push("a calm pace"); }
    if (has(p, /\bcinematic\b/)) { out.colour = "cinematic"; said.push("a cinematic look"); }
    else if (has(p, /\b(bright|vibrant|colou?rful|punchy colou?rs?)\b/)) { out.colour = "bright"; said.push("bright colour"); }
    else if (has(p, /\bwarm\b/)) { out.colour = "warm"; said.push("warm colour"); }
    if (has(p, /\bno captions?\b|\bwithout captions?\b|\bno subtitles?\b/)) { out.captions = "off"; said.push("no captions"); }
    else if (has(p, /\bbold captions?\b|\bbig captions?\b/)) { out.captions = "highlight"; said.push("bold captions"); }
    else if (has(p, /\bword[- ]by[- ]word\b|\bone word at a time\b/)) { out.captions = "pop"; said.push("word-by-word captions"); }
    if (has(p, /\bsmooth transitions?\b|\bsmooth\b/)) { out.transition = "fade"; said.push("smooth transitions"); }
    else if (has(p, /\bwhip/)) { out.transition = "whip"; said.push("whip transitions"); }
    else if (has(p, /\bhard cuts?\b|\bjump cuts?\b/)) { out.transition = "cut"; said.push("hard cuts"); }
    if (has(p, /\bno (graphics|animations?)\b/)) { out.graphics = "off"; said.push("no graphics"); }
    else if (has(p, /\b(animated|animations?|motion graphics|lots of graphics)\b/)) { out.graphics = "lots"; said.push("animated graphics"); }
    if (has(p, /\b(product|screen recording|demo|close[- ]ups?)\b/)) { out.focus = "screen"; said.push("the product in front"); }
    const secs = p.match(/\b(\d{1,2})\s*(?:-|to)?\s*(?:s|secs?|seconds?)\b/);
    if (secs) {
      const n = Number(secs[1]);
      if (n >= 5 && n <= 90) { out.durationSec = DURATIONS.filter((d) => d > 0).reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)); said.push(`about ${out.durationSec} seconds`); }
    }
    if (said.length) reasons.push(`From your prompt: ${said.join(", ")}.`);
  }

  // One talking clip: the person leads, unless something above said otherwise.
  if (input.clips?.count === 1 && !out.focus) out.focus = "person";

  return { creative: out, reasons };
}

/**
 * The settings in force: the defaults, SOCIA's recommendation on top, the person's own choices on top of that.
 * A layer only counts where it really sets something: an absent or `undefined` entry never wipes the one under
 * it. (2026-11-25: a recommendation that wrote `transition: undefined` took the default with it, and the
 * editor's summary crashed on every calm or steady reference.)
 */
export function settingsInForce(rec: Partial<Creative>, mine: Partial<Creative>): Creative {
  const out: Creative = { ...DEFAULT_CREATIVE };
  for (const layer of [rec, mine]) {
    for (const k of Object.keys(DEFAULT_CREATIVE) as CreativeKey[]) {
      const v = layer[k];
      if (v !== undefined && v !== null) (out as Record<CreativeKey, unknown>)[k] = v;
    }
  }
  return out;
}

/** The recommendation on top of the current settings, leaving every setting the person changed as they set it. */
export function withRecommendation(current: Creative, rec: Partial<Creative>, mine: ReadonlySet<CreativeKey>): Creative {
  const next: Creative = { ...DEFAULT_CREATIVE, aspect: current.aspect };
  for (const k of Object.keys(DEFAULT_CREATIVE) as CreativeKey[]) {
    if (mine.has(k)) (next as Record<CreativeKey, unknown>)[k] = current[k];
    else if (rec[k] !== undefined) (next as Record<CreativeKey, unknown>)[k] = rec[k];
  }
  return next;
}

/** The asks in plain words, added to what the cut is made from. Empty when every ask is SOCIA's to decide. */
export function asksText(c: Creative): string {
  const parts: string[] = [];
  if (c.durationSec) parts.push(`Make it about ${c.durationSec} seconds long.`);
  if (c.pace === "calm") parts.push("Calm pace: let shots breathe, cut on full sentences.");
  if (c.pace === "steady") parts.push("Steady pace: a cut every two to four seconds.");
  if (c.pace === "fast") parts.push("Fast pace: a cut every one to two seconds, no dead air.");
  if (c.focus === "person") parts.push("Keep the person on screen most of the time.");
  if (c.focus === "screen") parts.push("Lead with the product or the screen; the person in voice or briefly.");
  if (c.focus === "balanced") parts.push("Balance the person and the product or screen.");
  if (c.captions === "off") parts.push("Leave the spoken words off the screen.");
  if (c.transition !== "style") parts.push(c.transition === "cut" ? "Hard cuts between shots." : `${transitionLabel(c.transition)} transitions between shots.`);
  if (c.graphics === "off") parts.push("No animated graphics.");
  if (c.graphics === "lots") parts.push("Animated text and graphics on the key points.");
  return parts.join(" ");
}

/** The person's prompt with the asks after it, inside `max` characters: the prompt gives way, never the asks. */
export function composeBrief(prompt: string, c: Creative, max: number = PROMPT_MAX): string {
  const add = asksText(c);
  const room = max - (add ? add.length + 2 : 0);
  const p = prompt.trim();
  const cut = p.length > room ? p.slice(0, Math.max(0, room)).replace(/\s+\S*$/, "") : p;
  return `${cut}${cut && add ? "\n\n" : ""}${add}`.slice(0, max);
}

/** The theme overrides for the look settings (setThemeOverride's patch), or null when every one is the style's own. */
export function themePatch(c: Creative): Record<string, unknown> | null {
  const typography: Record<string, unknown> = {};
  if (c.captions === "off") typography.captions = false;
  else if (c.captions !== "style") { typography.captions = true; typography.captionPreset = c.captions; }
  if (c.captionAnim !== "style" && c.captions !== "off") typography.captionAnimation = c.captionAnim;
  const patch: Record<string, unknown> = {};
  if (Object.keys(typography).length) patch.typography = typography;
  if (c.transition !== "style") patch.motion = { transition: c.transition };
  if (c.colour !== "style") patch.color = { grade: GRADES[c.colour] };
  return Object.keys(patch).length ? patch : null;
}

/** The frame size for the shape picked. */
export function aspectSize(a: AspectId): { width: number; height: number } {
  const x = ASPECTS.find((s) => s.id === a) ?? ASPECTS[0];
  return { width: x.width, height: x.height };
}

/** One line for the summary card. */
export function creativeSummary(c: Creative, styleName: string): string {
  return [
    styleName,
    c.pace !== "auto" ? `${paceLabel(c.pace)} pace` : null,
    c.captions === "off" ? "no captions" : c.captions !== "style" ? `${captionLabel(c.captions)} captions` : null,
    c.transition !== "style" ? transitionLabel(c.transition).toLowerCase() : null,
    c.colour !== "style" ? `${colourLabel(c.colour).toLowerCase()} colour` : null,
    c.graphics === "off" ? "no graphics" : c.graphics === "lots" ? "lots of graphics" : null,
    c.durationSec ? `about ${c.durationSec} s` : null,
    c.aspect !== "9:16" ? aspectLabel(c.aspect) : null,
    c.music === "match" ? "music matched to the reference" : c.music === "similar" ? "similar-energy music" : c.music === "none" ? "no music" : null,
  ].filter(Boolean).join(" · ");
}
