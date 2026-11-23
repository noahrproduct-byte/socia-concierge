// "Draw the storyboard" (Noah, 2026-11-23): an AI-drawn still for each shot of a filmed plan post, on
// request, paid from the person's own SOCIA credits at the price the image service quotes. Free icons
// (lib/shotProps.ts) stay the default. Each drawing is one AI Studio image job (lib/generation/server.ts),
// so pricing, refunds and storage are the ones AI Studio already uses.
//
// A beat keeps the job id (`frameJob`) while it draws and the stored image's path (`frame`) once done.
// Paths are only ever turned into links on the server, and only when they sit in the owner's own
// generations folder. Pure and browser-safe.

import type { PlanBeat } from "./schema";

/** The image model: SOUL 2, the still-image model AI Studio already runs (Higgsfield's API has no GPT Image). */
export const STORYBOARD_MODEL = "soul-2-standard";
export const STORYBOARD_SHAPE = "9:16";

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isFrameJob = (v: unknown): v is string => typeof v === "string" && JOB_ID.test(v);

/** A stored drawing: `<owner>/generations/<uuid>.<jpg|png|webp>`, nothing else. */
const FRAME_PATH = /^[0-9a-f-]{36}\/generations\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
export const isFramePath = (v: unknown): v is string => typeof v === "string" && FRAME_PATH.test(v);

/** A stored drawing that belongs to `ownerId` (the only kind the server will link to). */
export const isOwnFrame = (v: unknown, ownerId: string): v is string => isFramePath(v) && v.split("/")[0] === ownerId;

/** What the beat shows: a screen recording is drawn as a screen seen from the side, so no fake writing appears. */
const SCREEN = /\bscreen ?(?:recording|record|capture|share)|\bscreenshots?\b|\bscroll(?:ing)? (?:through|the)\b/i;

/**
 * The image prompt for one shot, from the plan's own words for it. Nothing is added that the beat
 * doesn't say, except how it is photographed and that no words appear (image models invent
 * garbled text and app screens otherwise). Pure.
 */
export function framePrompt(beat: Pick<PlanBeat, "show" | "label">, about: { niche?: string | null } = {}): string {
  const show = beat.show.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  const screen = SCREEN.test(show);
  const niche = (about.niche ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return [
    "A vertical phone video still for a social media storyboard, a real photograph, natural light, candid.",
    `The shot: ${show}.`,
    screen ? "Show the phone or laptop screen at an angle from over the shoulder, its contents soft and out of focus." : "",
    niche ? `The business is in ${niche}.` : "",
    "No text, no captions, no words, no letters, no logos, no watermarks, no readable screen content.",
  ].filter(Boolean).join(" ").slice(0, 1200);
}

/** How the beats stand: how many are drawn, how many are still drawing. Pure. */
export function boardState(beats: PlanBeat[] | undefined): { drawn: number; drawing: number; total: number } {
  const list = beats ?? [];
  return {
    drawn: list.filter((b) => isFramePath(b.frame)).length,
    drawing: list.filter((b) => !isFramePath(b.frame) && isFrameJob(b.frameJob)).length,
    total: list.length,
  };
}

type WithBeats = { id?: string; beats?: PlanBeat[] };

/**
 * A plan edit from the browser, with the drawings kept: a beat that comes back without its frame or job
 * (the page held an older copy) gets the stored one again, but only when it is still the same shot (same
 * label and same words). A changed shot loses its drawing, since the drawing no longer matches. Pure.
 */
export function keepFrames<T extends WithBeats>(incoming: T[], stored: WithBeats[]): T[] {
  const byId = new Map(stored.filter((s) => s.id).map((s) => [s.id as string, s]));
  return incoming.map((item) => {
    const was = item.id ? byId.get(item.id) : undefined;
    if (!was?.beats?.length || !item.beats?.length) return item;
    const beats = item.beats.map((b, k) => {
      const old = was.beats![k];
      if (!old || old.label !== b.label || old.show !== b.show) {
        const { frame: _f, frameJob: _j, ...rest } = b;
        void _f; void _j;
        return rest;
      }
      return {
        ...b,
        ...(isFramePath(old.frame) && !isFramePath(b.frame) ? { frame: old.frame } : {}),
        ...(isFrameJob(old.frameJob) && !isFrameJob(b.frameJob) ? { frameJob: old.frameJob } : {}),
      };
    });
    return { ...item, beats };
  });
}
