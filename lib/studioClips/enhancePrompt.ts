// "Improve the prompt" in Studio's Prompt and reference panel. The person's
// few words ("show the double crust being made make the edit good") become a
// brief the editor can follow: a length, an opening shot, the order, the
// pace, the on-screen text and the ending, built only from moments SOCIA
// actually found in these clips. Pure: the route calls the model; this file
// writes its instructions, describes the clips and bounds what comes back.

import { PROMPT_MAX } from "./reference";
import { clipLabel, type ClipCard } from "./types";

export const ENHANCE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    prompt: { type: "string" },
    added: { type: "array", items: { type: "string" } },
  },
  required: ["prompt", "added"],
} as const;

export const ENHANCE_SYSTEM = `You rewrite a small business owner's request for a short vertical video (Instagram Reel, TikTok, YouTube Short) into a clear brief that SOCIA's video editor will follow to cut their own clips.
Rules:
- Keep what they asked for. Their subject, product, offer and any words they want on screen stay exactly as they wrote them. You make it specific; you never change the idea.
- Use only the footage listed under "The clips". Name shots by clip number and what happens in them, with the time when it helps ("Clip 3, the cheese pull at 0:04"). Never describe a shot, product, person or place that isn't in that list. When no clips are described, write the structure without naming shots.
- Cover, in this order and only where it helps: the length (15 to 30 seconds unless they said otherwise or a reference video is attached), the first shot (in motion, the strongest moment for what they asked, never a slow wide shot), the order of the shots, the pace (how long shots hold, where it speeds up), short on-screen text lines (a few words each, in the brand's voice), the sound (their own speech when the clips have it, otherwise music), and the last shot with one call to action.
- One call to action only, on the last shot. No "tag a friend", "share this" or "comment below" lines on screen.
- Don't build the video around throwaway speech ("okay, okay", a cough, someone talking off camera). Don't ask for "trending" or "viral" music: describe one steady feel that suits the video.
- On-screen text says something about what's in the shot at that moment. Never "POV" unless the shot really is from that person's point of view.
- When a reference video is attached, leave the length, the pace and the text style to the reference; describe what to show and in what order.
- Never invent facts: no prices, hours, discounts, awards or claims that aren't in their request or the brand notes.
- Write it the way the owner would brief an editor: plain sentences, at most about 120 words, no headings, no bullet symbols, no hashtags, no emojis, no em dashes.
- "added": up to 5 short phrases naming what you added, for example "a 20 second length", "an opening on the cheese pull", "an ending with the order link".`;

const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const one = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** One line per understood clip: what it shows, its strong moments, what is said. Clips SOCIA hasn't understood are counted, not described. */
export function clipLines(rows: { position: number; duration_s: number | null; card: ClipCard | null }[]): string {
  const known = rows.filter((r) => r.card).sort((a, b) => a.position - b.position).slice(0, 30);
  const unknown = rows.length - known.length;
  const lines = known.map((r) => {
    const c = r.card!;
    const moments = c.moments
      .filter((m) => m.strength !== "weak")
      .slice(0, 4)
      .map((m) => `${t(m.start)}-${t(m.end)} ${one(m.label, 60)} (${m.strength})`)
      .join("; ");
    const speech = c.speech.present ? (c.speech.hookLine ? `says “${one(c.speech.hookLine, 100)}”` : `speech: ${one(c.speech.summary, 100)}`) : "no speech";
    return `- ${clipLabel(r.position)} (${Math.round(r.duration_s ?? 0)}s): ${one(c.subject, 80)}; ${one(c.action, 80)}; ${one(c.setting, 60)}. ${moments ? `Moments: ${moments}.` : ""} ${speech}.${c.openerCandidate ? " Could open a post." : ""}`.replace(/\s+/g, " ").trim();
  });
  if (unknown > 0) lines.push(`- ${unknown} more clip${unknown === 1 ? "" : "s"} SOCIA hasn't looked at yet.`);
  return lines.length ? lines.join("\n") : "No clips described yet.";
}

const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\r/g, "").replace(/\s*—\s*/g, ", ").replace(/^#+\s*/gm, "").trim().slice(0, n) : "");

/** What the model returned, bounded; null when it gave no usable brief. */
export function sanitizeEnhanced(raw: unknown): { prompt: string; added: string[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { prompt?: unknown; added?: unknown };
  const prompt = clean(r.prompt, PROMPT_MAX);
  if (prompt.length < 10) return null;
  const added = (Array.isArray(r.added) ? r.added : []).map((a) => clean(a, 80)).filter(Boolean).slice(0, 5);
  return { prompt, added };
}
