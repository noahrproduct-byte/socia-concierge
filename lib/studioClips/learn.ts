// Learn (the last step of Build from Clips): how the posts made in Content
// Studio did once published, and what that says about the cuts. Results come
// from lib/postResults.ts (the account's OWN median, "measuring" never 0,
// early results flagged). Lessons are only drawn from settled results, only
// when both sides of a comparison have enough posts, and always carry their
// sample size. Pure, tested.
import type { Edl } from "./types";
import { edlDurationSec } from "./edl";
import { fmtMultiplier } from "@/lib/multiplier";
import { median } from "@/lib/metrics";

export type CutFeatures = {
  lengthSec: number;
  cuts: number;
  /** an on-screen line in the opening */
  openingText: boolean;
  captions: boolean;
  look: "off" | "enhance" | "match";
  sound: boolean;
  pausesCut: boolean;
  /** an ending ask in the cut */
  cta: boolean;
};

export function cutFeatures(edl: Edl): CutFeatures {
  return {
    lengthSec: edlDurationSec(edl),
    cuts: edl.segments.length,
    openingText: edl.text.some((t) => t.role === "opening"),
    captions: Boolean(edl.captions),
    look: edl.finish?.look ?? "off",
    sound: Boolean(edl.finish?.sound),
    pausesCut: Boolean(edl.finish?.pausesCut),
    cta: Boolean(edl.cta) || edl.text.some((t) => t.role === "cta"),
  };
}

export type OutcomeResult = { short: string; text: string; multiplier: number | null; early: boolean; measured: boolean; platform: string };

export type StudioOutcome = {
  buildId: string;
  projectId: string;
  opportunityIdx: number;
  projectTitle: string;
  title: string;
  postId: string;
  status: string;
  features: CutFeatures;
  /** null until the post is published */
  result: OutcomeResult | null;
};

/** Results that can teach something: published, reported, compared with a median, past the early window. */
export const settled = (o: StudioOutcome): boolean => Boolean(o.result?.measured && o.result.multiplier != null && !o.result.early);

export const MIN_SETTLED = 3;
export const MIN_GROUP = 2;
/** A difference smaller than this between two groups' medians isn't called a lesson. */
export const LESSON_RATIO = 1.25;
/** Below this many settled posts every lesson is labelled a small sample. */
export const SMALL_SAMPLE = 8;

type Split = { label: string; yes: string; no: string; test: (f: CutFeatures) => boolean };

const SPLITS: Split[] = [
  { label: "length", yes: "cuts under 20 s", no: "cuts of 20 s or more", test: (f) => f.lengthSec < 20 },
  { label: "captions", yes: "cuts with captions", no: "cuts without captions", test: (f) => f.captions },
  { label: "opening", yes: "cuts that open on an on-screen line", no: "cuts that open without one", test: (f) => f.openingText },
  { label: "look", yes: "cuts with picture corrections", no: "cuts without them", test: (f) => f.look !== "off" },
  { label: "sound", yes: "cuts with audio cleanup", no: "cuts without it", test: (f) => f.sound },
  { label: "ask", yes: "cuts that end on an ask", no: "cuts without one", test: (f) => f.cta },
];

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export type StudioLessons = {
  published: number;
  settledCount: number;
  lessons: string[];
  best: StudioOutcome | null;
  summary: string;
};

export function studioLessons(outcomes: StudioOutcome[]): StudioLessons {
  const published = outcomes.filter((o) => o.result);
  const done = published.filter(settled);
  const best = [...done].sort((a, b) => (b.result!.multiplier ?? 0) - (a.result!.multiplier ?? 0))[0] ?? null;
  const lessons: string[] = [];
  if (done.length >= MIN_SETTLED) {
    for (const s of SPLITS) {
      const yes = done.filter((o) => s.test(o.features)), no = done.filter((o) => !s.test(o.features));
      if (yes.length < MIN_GROUP || no.length < MIN_GROUP) continue;
      const my = median(yes.map((o) => o.result!.multiplier!)), mn = median(no.map((o) => o.result!.multiplier!));
      if (my == null || mn == null || mn <= 0 || my <= 0) continue;
      const hi = Math.max(my, mn), lo = Math.min(my, mn);
      if (hi / lo < LESSON_RATIO) continue;
      const [winLabel, winM, winN, loseLabel, loseM, loseN] = my >= mn ? [s.yes, my, yes.length, s.no, mn, no.length] : [s.no, mn, no.length, s.yes, my, yes.length];
      lessons.push(`Your ${winLabel} have done ${fmtMultiplier(winM as number)} your median (${plural(winN as number, "post")}), against ${fmtMultiplier(loseM as number)} for ${loseLabel} (${plural(loseN as number, "post")}).`);
    }
  }
  const small = done.length < SMALL_SAMPLE;
  const summary = !published.length
    ? "No posts made in Content Studio have been published yet."
    : done.length < MIN_SETTLED
      ? `${plural(published.length, "Studio post")} published, ${done.length} with settled results. SOCIA draws lessons once ${MIN_SETTLED} have settled.`
      : `${plural(done.length, "Studio post")} with settled results${small ? " (a small sample: read these as hints)" : ""}.`;
  return { published: published.length, settledCount: done.length, lessons, best, summary };
}

/** For the post-idea and cut prompts: what this account's own Studio posts did. null when nothing has settled. */
export function learnedBlock(outcomes: StudioOutcome[]): string | null {
  const l = studioLessons(outcomes);
  const done = outcomes.filter(settled).sort((a, b) => (b.result!.multiplier ?? 0) - (a.result!.multiplier ?? 0)).slice(0, 6);
  if (!done.length) return null;
  const lines = done.map((o) => `- "${o.title}": ${o.result!.short} on ${o.result!.platform} (${Math.round(o.features.lengthSec)} s, ${o.features.cuts} cuts, captions ${o.features.captions ? "on" : "off"}, opening line ${o.features.openingText ? "yes" : "no"})`);
  return [
    `Posts this account made with Content Studio, measured against its own median${l.settledCount < SMALL_SAMPLE ? ` (only ${plural(l.settledCount, "post")}: treat as hints, not rules)` : ""}:`,
    ...lines,
    ...(l.lessons.length ? ["Patterns so far:", ...l.lessons.map((x) => `- ${x}`)] : []),
  ].join("\n");
}
