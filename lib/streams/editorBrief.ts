// The brief a saved stream clip carries into SOCIA's Video editor (Live
// streams, phase 2). Only clips SOCIA could save have a video: the person's
// own channel or one they edit for. Twitch's clip ends about 5 seconds after
// SOCIA asked for it, and SOCIA asks when chat spikes, so the moment chat
// reacted to sits in the last part of the clip. Nothing here claims more than
// that: the editor watches the clip itself. Pure and browser-safe.

import { PROMPT_MAX } from "@/lib/studioClips/reference";
import type { StreamClip } from "./types";

export function clipEditorBrief(c: Pick<StreamClip, "login" | "title" | "why" | "duration" | "score">): string {
  const len = c.duration ? Math.round(c.duration) : null;
  return [
    `Make a vertical 9:16 Reel from this Twitch clip of ${c.login}${c.title ? `, "${c.title}"` : ""}.`,
    c.why ? `Why SOCIA clipped it: ${c.why}` : "",
    `The moment chat reacted to is in the last part of the clip${len ? ` (it ends about 5 seconds after, in a ${len}-second clip)` : ""}. Open on that moment or a second before it, so the first frames already show what happened, then keep the build-up only if it's needed to follow it.`,
    "Frame the action for a phone: crop to the gameplay where it happens, and keep the streamer's face cam in view if there is one.",
    "Add captions from what is said, one to three words at a time, placed clear of the face cam and the game's own text.",
    "Keep the stream's own sound. Add no music.",
    "Keep it short: under 30 seconds unless the moment needs more.",
    "Use the frame where chat reacted as the cover.",
  ].filter(Boolean).join(" ").slice(0, PROMPT_MAX);
}

/** A file name for the clip's video in the editor. */
export const clipFileName = (c: Pick<StreamClip, "login" | "spikeAt">): string =>
  `${c.login.replace(/[^a-z0-9_]/gi, "") || "twitch"}-clip-${c.spikeAt.slice(0, 10)}.mp4`;
