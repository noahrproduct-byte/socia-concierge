// Editing styles by the kind of video (Noah's editing playbook, 2026-11-10,
// phase 4: "a professional editor doesn't edit a restaurant video the same way
// they edit a software tutorial"). Each style sets the numbers the rest of the
// editor works to: how long shots run (pacing.ts), how shots join (joins.ts),
// how tightly speech is trimmed (speech.ts), and what the editing model is
// told (analysis.ts). They are starting points: the person can make the cut
// again in another style. Pure, unit-tested (profiles.test.ts).

import { asHookPair, asStepLabel, becomesStepLabel } from "@/lib/textPresets";
import type { EdlText } from "./types";

export type EditStyleId = "process" | "talking" | "demo" | "energetic" | "calm";

export type EditStyle = {
  id: EditStyleId;
  label: string;
  /** what the style does, in one line for the editor */
  summary: string;
  /** pacing numbers that differ from the defaults (lib/studioClips/pacing.ts PACING) */
  pacing: { openerMaxSec: number; silentMaxSec: number; followMaxSec: number; speechMaxSec: number; endingMinSec: number; averageCutSec: readonly [number, number] };
  /** how two shots join when nobody is talking across the join */
  joins: "dissolve" | "cut";
  /** how much of each pause is kept (lib/studioClips/speech.ts) */
  speech: "tight" | "natural";
  /** what the editing model is told, on top of its general rules */
  prompt: string;
  /**
   * How on-screen words are set: "hook" (a designed opening line, the Hook
   * Pair) or "labels" (small step labels, as the food Reels that work do:
   * 2026-11-11 food study, docs/studio/edit-references.md).
   */
  text: "hook" | "labels";
};

export const EDIT_STYLES: Record<EditStyleId, EditStyle> = {
  process: {
    id: "process", label: "Food and process",
    summary: "The finished thing first, the making in order, the real sound of the work, one designed line of text, the finished thing again.",
    pacing: { openerMaxSec: 5, silentMaxSec: 5, followMaxSec: 3, speechMaxSec: 10, endingMinSec: 1.5, averageCutSec: [1, 4] },
    joins: "dissolve", speech: "tight", text: "hook",
    prompt: "Food and process, the way the food Reels that work are cut. Either ONE satisfying action shown whole (a slice pulled, a cheese pull, the knife through a crust: one or two shots, never chopped up), or a process: open on the finished thing for 1 to 2 seconds, then the making in the order it happens, one step a shot, slow steps may hold while the end speeds up, and close on the finished thing again from a different moment. Steps filmed from a camera that doesn't move can follow each other as jump cuts at least 1 second apart, so the dish builds up like stop motion. Keep the real sound of the work. Text: at most two text moments in the whole video, never a label on every shot and no reaction line: the hook in the shape the text rule gives, naming the dish or the moment, and optionally one closing line on the payoff.",
  },
  talking: {
    id: "talking", label: "Talking to camera",
    summary: "The words carry it: whole sentences, hard cuts between thoughts, pauses tightened, captions.",
    pacing: { openerMaxSec: 5, silentMaxSec: 4, followMaxSec: 3, speechMaxSec: 15, endingMinSec: 1.5, averageCutSec: [1.5, 8] },
    joins: "cut", speech: "tight", text: "hook",
    prompt: "Talking to camera: the words carry the video. Open on the strongest line, keep whole sentences, cut between thoughts, drop repeated points, and use other footage only to show what is being said. No reaction text: the captions carry the words.",
  },
  demo: {
    id: "demo", label: "Product demo or how-to",
    summary: "The problem, then each step held long enough to see what changed; hard cuts, natural pauses.",
    pacing: { openerMaxSec: 5, silentMaxSec: 7, followMaxSec: 3, speechMaxSec: 15, endingMinSec: 2, averageCutSec: [2, 7] },
    joins: "cut", speech: "natural", text: "hook",
    prompt: "Product demo or how-to: open on the result or the problem, never a logo; then show it working step by step, holding each step 2 to 5 seconds so the viewer can see what changed; end on the result. Text names the step, in a few words.",
  },
  energetic: {
    id: "energetic", label: "Fast and energetic",
    summary: "Quick hard cuts on the action, peak motion first, building to the biggest moment.",
    pacing: { openerMaxSec: 3, silentMaxSec: 3, followMaxSec: 2.5, speechMaxSec: 8, endingMinSec: 1.5, averageCutSec: [0.6, 2.5] },
    joins: "cut", speech: "tight", text: "hook",
    prompt: "Fast and energetic: cut quickly, 0.6 to 2 seconds a shot, always on the action; open on peak motion, build to the biggest moment, and end on a strong frame.",
  },
  calm: {
    id: "calm", label: "Calm and premium",
    summary: "Fewer, longer shots with slow reveals, a soft dissolve where time passes; restrained text.",
    pacing: { openerMaxSec: 6, silentMaxSec: 7, followMaxSec: 7, speechMaxSec: 12, endingMinSec: 2.5, averageCutSec: [2.5, 6] },
    joins: "dissolve", speech: "natural", text: "hook",
    prompt: "Calm and premium: fewer, longer shots of 2.5 to 6 seconds, slow reveals, no hype words, at most one line of text in the hook shape the text rule gives, and end on the most beautiful frame.",
  },
};

/**
 * On-screen words as this edit's style sets them: in a label style (food and
 * process, calm) the opening and middle lines become small Step Labels, on one
 * line and shortened only at a whole word; calls to action keep their label.
 */
export function textForStyle<E extends { editStyle?: unknown; text: EdlText[]; style?: { textBox?: string } | null }>(edl: E): E {
  if (styleOf(edl.editStyle).text !== "labels") {
    // The clean look: a one-line opening title is set as a Hook Pair (bold line, big italic key word).
    if (edl.style?.textBox === "outline") return edl;
    let changed = false;
    const text = edl.text.map((t) => {
      if (t.role !== "opening" || (t.presetId ?? "hook_title") !== "hook_title") return t;
      const pair = asHookPair(t.text);
      if (!pair) return t;
      changed = true;
      return { ...t, text: pair, presetId: "hook_pair" as const };
    });
    return changed ? { ...edl, text } : edl;
  }
  const text = edl.text.map((t) => {
    if (!becomesStepLabel(t.presetId ?? (t.role === "cta" ? "callout_box" : "caption_bar"))) return t;
    const l = asStepLabel(t.text);
    // A label sits in the middle, its own place, so a slot meant for the old look goes.
    const rest: EdlText = { ...t };
    delete rest.slot;
    return { ...rest, text: l.text, presetId: "step_label" as const, ...(l.shortened || t.shortened ? { shortened: true as const } : {}) };
  });
  return { ...edl, text };
}

export const EDIT_STYLE_IDS = Object.keys(EDIT_STYLES) as EditStyleId[];
export const isEditStyle = (v: unknown): v is EditStyleId => typeof v === "string" && v in EDIT_STYLES;
export const styleOf = (id: unknown): EditStyle => EDIT_STYLES[isEditStyle(id) ? id : "process"];

/** Footage this quiet has nobody talking in it. */
const SILENT_SHARE = 0.1;
/** Words a prompt uses to rule something out ("no speech", "nobody talks", "without a voiceover"). */
const NEGATED = /\b(no|without|not any|zero)\s+(speech|talking|talk|dialogue|voice ?over|narration|words spoken)\b|\b(nobody|no one|no-one)\s+(talks|speaks|is talking|is speaking)\b/g;

/** Footage that is mostly someone talking: this share of it has words. */
export const TALKING_SHARE = 0.4;

const ASKED: [EditStyleId, RegExp][] = [
  ["demo", /\b(demo|tutorial|how[- ]to|walk ?through|step[- ]by[- ]step|screen ?record\w*|show (how|the app|the product))\b/],
  ["talking", /\b(talking head|talk(ing)? to (the )?camera|podcast|interview|vlog|my (story|thoughts)|speech|my talk)\b/],
  ["energetic", /\b(hype|energetic|high energy|fast[- ]paced|fast edit|montage|workout|game ?day|party)\b/],
  ["calm", /\b(calm|luxury|luxurious|premium|elegant|slow|aesthetic|relaxing|serene)\b/],
  ["process", /\b(making|being made|process|behind the scenes|recipe|prep|how we make)\b/],
];

const NICHE: [EditStyleId, RegExp][] = [
  ["energetic", /\b(gym|fitness|crossfit|sports?|dance|club|nightlife|events?|boxing|martial|athlet\w*|trainer)\b/],
  ["calm", /\b(spa|hotel|real estate|realtor|interior\w*|jewel\w*|boutique|wedding|florist|luxury|villa|resort)\b/],
  ["demo", /\b(software|saas|app|apps|tech|platform|tool|gadget\w*)\b/],
  ["process", /\b(restaurant|food|pizza\w*|bakery|cafe|café|coffee|barber\w*|tattoo|nails?|craft\w*|kitchen|chef|bar|catering|cake\w*)\b/],
];

export type StylePick = { id: EditStyleId; why: string };

/**
 * The style a cut is edited in: what the person asked for, then whether the
 * footage is mostly someone talking, then the account's niche, then food and
 * process (how most of SOCIA's small businesses film).
 */
export function pickStyle(a: { brief?: string | null; niche?: string | null; speechShare: number }): StylePick {
  // "No speech in the clips" names speech to rule it out (the prompt improver writes it): negations don't count.
  const brief = (a.brief ?? "").toLowerCase().replace(NEGATED, " ");
  for (const [id, re] of ASKED) {
    if (!re.test(brief)) continue;
    // Footage nobody talks in is never cut as talking to camera, whatever word the prompt used (2026-11-12 launch test).
    if (id === "talking" && a.speechShare < SILENT_SHARE) continue;
    return { id, why: "your prompt asked for it" };
  }
  const niche = (a.niche ?? "").toLowerCase();
  const nicheStyle = NICHE.find(([, re]) => re.test(niche))?.[0];
  if (a.speechShare >= TALKING_SHARE) return nicheStyle === "demo" ? { id: "demo", why: "someone explains a product in most of the footage" } : { id: "talking", why: "someone is talking in most of the footage" };
  if (nicheStyle) return { id: nicheStyle, why: "it suits the account's niche" };
  return { id: "process", why: "it suits footage of something being made or served" };
}

/** The share of the footage in which someone is speaking, 0..1, from the transcripts' word timings. */
export function speechShare(clips: { durationSec: number; words: { startMs: number; endMs: number }[] | null | undefined }[]): number {
  const total = clips.reduce((a, c) => a + Math.max(0, c.durationSec), 0);
  if (!total) return 0;
  const spoken = clips.reduce((a, c) => a + (c.words ?? []).reduce((b, w) => b + Math.max(0, w.endMs - w.startMs) / 1000, 0), 0);
  return Math.min(1, spoken / total);
}

/** One line for the cut's notes. */
export const styleNote = (pick: StylePick) => `SOCIA edited this as ${EDIT_STYLES[pick.id].label.toLowerCase()} because ${pick.why}: ${EDIT_STYLES[pick.id].summary.charAt(0).toLowerCase()}${EDIT_STYLES[pick.id].summary.slice(1)} Regenerate can make it again in another style.`;
