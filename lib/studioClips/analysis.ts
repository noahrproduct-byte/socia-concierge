// The three model passes behind Build from Clips. Each is a single
// structured-output call on the model configured for that pass
// (lib/anthropic.ts modelFor). What comes back is a PROPOSAL: pass-2 groups
// go through validateYield, pass-3 EDLs through validateEdl, before anyone
// sees them. Images reach the model as short-lived signed URLs, never as
// bytes through this function.
import { anthropic, modelFor, effortFor } from "@/lib/anthropic";
import { recordAiUsage, type AiFeature } from "@/lib/aiUsage";
import { brandContext } from "@/lib/prompt";
import type { BrandDetail } from "@/lib/profile";
import type { ClipCard, ClipFacts, Edl, Opportunity, RegenerateDirective, Transcript } from "./types";
import { clipLabel, fmtClock } from "./types";
import type { ProposedGroup } from "./yield";
import type { RawEdl } from "./edl";
import { BREAKDOWN_SCHEMA, shotStats, timedSpeech, type ReferenceInput } from "./reference";
import { CARD_DETAIL, editFrames } from "./teach";

export type AccountContext = {
  niche: string | null; location: string | null; goals: string | null; brand: BrandDetail | null;
  /** measured note on what sound has worked for this account (lib/audio), when there is one */
  audio?: string | null;
  /** how this account's earlier Content Studio posts did against its median (lib/studioClips/learn.ts) */
  learned?: string | null;
  /** The workspace owner whose plan pays for these calls (AI usage records). */
  ownerId?: string;
};

/** The Learn block for passes 2 and 3, with how to use it. */
const learnedText = (acct: AccountContext): string => (acct.learned
  ? `\n\n# How this account's earlier Content Studio posts did\n${acct.learned}\nUse this: favour what beat the median and avoid what fell short. When a pattern rests on only a few posts, treat it as a hint, never a rule. Don't repeat a post's topic just because it did well.`
  : "");

export type ClipInput = {
  id: string;
  position: number;
  name: string;
  durationSec: number;
  recordedAt: string | null;
  facts: ClipFacts | null;
  transcript: Transcript | null;
  /** signed keyframe URLs in time order */
  frames: { t: number; url: string }[];
  card: ClipCard | null;
};

export class AnalysisError extends Error {
  constructor(public kind: "refusal" | "empty" | "parse", message: string) {
    super(message);
    this.name = "AnalysisError";
  }
}

const HONESTY = `Rules you never break:
- Say only what is visible in the frames, present in the transcript, or given as a measurement. "unknown" is a valid answer.
- Timestamps are seconds inside the clip they refer to; never outside its duration.
- No invented facts about views, trends, music tracks or what an audience "will" do.`;

/** Words grouped into short timestamped lines, so the model sees WHEN things are said. */
export function transcriptLines(t: Transcript, maxChars = 1800): string {
  if (!t.words.length) return t.text.slice(0, maxChars);
  const lines: string[] = [];
  let cur: string[] = [];
  let curStart = t.words[0].startMs;
  for (const w of t.words) {
    if (cur.length && (w.startMs - curStart > 6000 || /[.!?]$/.test(cur[cur.length - 1]))) {
      lines.push(`[${fmtClock(curStart / 1000)}] ${cur.join(" ")}`);
      cur = [];
      curStart = w.startMs;
    }
    cur.push(w.text);
  }
  if (cur.length) lines.push(`[${fmtClock(curStart / 1000)}] ${cur.join(" ")}`);
  const out = lines.join("\n");
  return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
}

function factsText(f: ClipFacts | null): string {
  if (!f) return "No measurements available.";
  const v = f.visual, a = f.audio;
  const parts: string[] = [];
  if (v) {
    parts.push(`picture: ${v.brightness} brightness (median luma ${v.medianLuma.toFixed(2)}), ${v.contrast} contrast, ${v.warmth} colour${v.clippedHighlights ? ", blown highlights" : ""}${v.crushedShadows ? ", crushed shadows" : ""}${v.sceneCuts ? `, ${v.sceneCuts.length} scene change${v.sceneCuts.length === 1 ? "" : "s"}${v.sceneCuts.length ? ` at ${v.sceneCuts.slice(0, 8).map((t) => t.toFixed(1)).join(", ")}s` : ""}` : ""}`);
  }
  if (a) {
    parts.push(a.hasAudio
      ? `sound: ${a.level} level${a.rmsDb != null ? ` (${a.rmsDb} dBFS)` : ""}, audible ${Math.round((a.audibleRatio ?? 0) * 100)}% of the time${a.silences.length ? `, pauses at ${a.silences.slice(0, 6).map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s`).join(", ")}` : ""}`
      : "sound: no audio track");
  }
  return parts.join("; ") || "No measurements available.";
}

const accountText = (acct: AccountContext): string => [
  acct.niche ? `The account: ${acct.niche}${acct.location ? ` in ${acct.location}` : ""}.` : acct.location ? `The account is in ${acct.location}.` : "",
  acct.goals ? `Its goal: ${acct.goals}` : "",
  brandContext(acct.brand) || "",
].filter(Boolean).join("\n");

type Content = ({ type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } | { type: "base64"; media_type: "image/jpeg"; data: string } })[];

// ------------------------------------------------------ reference video ----

/**
 * A reference video broken down from what the browser measured: its frames,
 * its cut times and its speech with times. Structure and style only; the
 * breakdown describes what is seen and heard, it never guesses results.
 */
export async function breakDownReference(ref: ReferenceInput, acct: AccountContext): Promise<{ raw: unknown; model: string }> {
  const stats = shotStats(ref);
  const speech = timedSpeech(ref.words);
  const system = `You break down a short-form vertical video (a Reel, TikTok or Short) so an editor can recreate its structure, pacing and on-screen text style with different footage. Describe only what the frames, cut times and speech show; when something can't be seen in the frames given, say "not visible" rather than guess. Never comment on how well it performed.
- summary: one sentence on what the video is and how it's built.
- hook: what happens in the first 2 seconds and why it holds attention.
- pace: how often it cuts and how that changes (use the measured cut times).
- ending: how it ends (a reveal, a question, an ask, a loop).
- beats: 3 to 10 in order, covering the whole video, each with start/end seconds, what it shows (shot type and action, not who), the on-screen text exactly as written in the frames ("" when none) and what is said ("" when nothing).
- text: the on-screen text style as seen in the frames: where it sits, its background (dark box, light box, a coloured box = accent, or none), capitals or not, size relative to the frame, the closest font from the list (bebas = tall condensed bold, anton = heavy condensed, montserrat = wide geometric bold, poppins = rounded, tiktok = plain sans), and accent as #rrggbb only when a coloured box or text colour is clearly visible, else "".
- captions: true when word-by-word subtitles of the speech are on screen.`;
  const content: Content = [
    { type: "text", text: `${accountText(acct)}

The reference: ${ref.durationSec}s, ${ref.width ?? "?"}×${ref.height ?? "?"}.
Cuts measured at: ${ref.cuts ? (ref.cuts.length ? ref.cuts.map((c) => `${c}s`).join(", ") : "none found") : "not measured"}${stats.shots ? ` (${stats.shots} shots, median ${stats.medianShotSec}s)` : ""}.
Sound: ${ref.audio ? `${ref.audio.hasAudio ? `level ${ref.audio.level}` : "no sound"}` : "not measured"}.
${speech ? `Speech with times:\n${speech}` : "No speech was transcribed."}

The images that follow are frames at ${ref.frames.map((f) => `${f.t}s`).join(", ")}.` },
    ...ref.frames.map((f) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.jpeg } })),
  ];
  const { data, model } = await structured<unknown>("studio_edl", system, content, BREAKDOWN_SCHEMA, 6000, { ownerId: acct.ownerId, feature: "clip_edl" });
  return { raw: data, model };
}

async function structured<T>(task: Parameters<typeof modelFor>[0], system: string, content: Content, schema: unknown, maxTokens: number, usage: { ownerId?: string; feature: AiFeature }): Promise<{ data: T; model: string }> {
  const model = modelFor(task);
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    output_config: { format: { type: "json_schema", schema }, ...effortFor(model) },
    messages: [{ role: "user", content }],
  };
  // An answer cut off at the budget is asked for again with more room by the client (lib/anthropic.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create(params as any);
  recordAiUsage(usage.ownerId, usage.feature, res);
  if (res.stop_reason === "refusal") throw new AnalysisError("refusal", "The model declined this request.");
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  if (!text) throw new AnalysisError("empty", "Empty response from the model.");
  try {
    return { data: JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as T, model };
  } catch {
    // Why it couldn't be read goes to the log (never the content): the stop reason and the length.
    console.error(`[studio] ${usage.feature}: unreadable response, stop ${res.stop_reason}, ${text.length} chars`);
    throw new AnalysisError("parse", res.stop_reason === "max_tokens" ? "The answer was too long to finish. Try a shorter reference or a shorter brief." : "SOCIA's answer came back incomplete. Try again.");
  }
}

// ------------------------------------------------------------- pass 1 ----

const CARD_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    subject: { type: "string" }, setting: { type: "string" }, action: { type: "string" },
    people: { type: "string", enum: ["none", "one", "several", "unknown"] },
    moments: { type: "array", items: { type: "object", additionalProperties: false, properties: { start: { type: "number" }, end: { type: "number" }, label: { type: "string" }, strength: { type: "string", enum: ["strong", "good", "weak"] }, why: { type: "string" }, sound: { type: "boolean" } }, required: ["start", "end", "label", "strength", "why", "sound"] } },
    speech: { type: "object", additionalProperties: false, properties: { present: { type: "boolean" }, summary: { type: "string" }, hookLine: { type: "string" } }, required: ["present", "summary", "hookLine"] },
    quality: { type: "object", additionalProperties: false, properties: { visual: { type: "string", enum: ["ok", "dark", "bright", "low_contrast", "mixed", "unknown"] }, audio: { type: "string", enum: ["ok", "quiet", "loud", "noisy", "silent", "unknown"] }, notes: { type: "array", items: { type: "string" } } }, required: ["visual", "audio", "notes"] },
    tags: { type: "array", items: { type: "string" } },
    openerCandidate: { type: "boolean" },
  },
  required: ["subject", "setting", "action", "people", "moments", "speech", "quality", "tags", "openerCandidate"],
} as const;

type CardOut = Omit<ClipCard, "model" | "createdAt" | "speech"> & { speech: { present: boolean; summary: string; hookLine: string } };

export async function clipCard(clip: ClipInput, acct: AccountContext): Promise<ClipCard> {
  const system = `You describe one raw video clip for a social media strategist who will later combine clips into posts. ${HONESTY}
Moments: walk through the frames in time order and list what really happens, as an editor logging footage would. Up to 12 moments, each one specific action with exact times read from the frames, usually 1 to 6 seconds, never a whole scene ("the wheel cuts the first line across the pizza, 12.4 to 13.6", not "cutting the pizza, 11 to 22"). Each has a label and a strength: "strong" (would hold attention on its own), "good" (usable), "weak" (unusable). Cover the clip; a clip with nothing usable has one weak moment spanning it.
Log these whenever they happen: one unbroken move from start to finish, kept as one moment (a pizza coming out of the oven, past the lens and into the box); the same action repeated, one moment per repeat; the clean look at the finished thing, before hands or shadows cross it; a logo, sign or shop name readable straight on. Mark as "weak" any stretch where nothing happens, or an arm or hand covers the subject, or a shadow falls across half of it.
sound: true when the sound of this action is part of the appeal of watching it (cutting, slicing, sizzling, pouring, chopping, crunching), false otherwise. Never true for talking or background noise.
Phone footage moves, and that is how short-form video looks: a handheld walk-through, a pan along a counter, a POV shot or a camera following the action is "good" or "strong", never weak because it moves. Still frames from a moving camera look softer than the video plays, so do not call a moment blurry from motion blur in a frame. "weak" is only for footage nobody could use: the lens covered or pointed at nothing, the subject can't be made out at all, far too dark or blown out, or an accidental recording.
speech.present is true only when the transcript contains speech. hookLine is the one spoken line that could open a post, or "" when there is none.
openerCandidate is true only when the first three seconds would stop a scroll or a hook line is spoken early.
quality reflects the measurements and what the frames show; notes are short and concrete.`;
  const content: Content = [
    { type: "text", text: `${clipLabel(clip.position)} ("${clip.name}"), ${Math.round(clip.durationSec)} seconds.${clip.recordedAt ? ` File timestamp: ${clip.recordedAt.slice(0, 16).replace("T", " ")} (a hint about order, not a fact about the content).` : ""}
Measurements: ${factsText(clip.facts)}
${clip.transcript ? (clip.transcript.words.length ? `Transcript with timestamps:\n${transcriptLines(clip.transcript)}` : "Transcript: no speech was found.") : "No transcript is available for this clip (do not guess what is said)."}
${accountText(acct)}
The ${clip.frames.length} images that follow are frames at ${clip.frames.map((f) => `${f.t.toFixed(1)}s`).join(", ")}, in that order.` },
    ...clip.frames.map((f) => ({ type: "image" as const, source: { type: "url" as const, url: f.url } })),
  ];
  const { data, model } = await structured<CardOut>("studio_clip", system, content, CARD_SCHEMA, 3000, { ownerId: acct.ownerId, feature: "clip_card" });
  const d = Math.max(0.1, clip.durationSec);
  const moments = (data.moments ?? [])
    .map((m) => ({ ...m, start: Math.max(0, Math.min(m.start, d)), end: Math.max(0, Math.min(m.end, d)) }))
    .filter((m) => m.end > m.start)
    .slice(0, 12);
  return {
    detail: CARD_DETAIL,
    subject: data.subject ?? "", setting: data.setting ?? "", action: data.action ?? "",
    people: data.people ?? "unknown",
    moments: moments.length ? moments : [{ start: 0, end: d, label: "whole clip", strength: "weak", why: "no usable moment was identified" }],
    speech: { present: Boolean(data.speech?.present && clip.transcript?.words.length), summary: data.speech?.summary ?? "", hookLine: data.speech?.hookLine?.trim() || null },
    quality: { visual: data.quality?.visual ?? "unknown", audio: data.quality?.audio ?? "unknown", notes: (data.quality?.notes ?? []).slice(0, 4) },
    tags: (data.tags ?? []).slice(0, 8),
    openerCandidate: Boolean(data.openerCandidate),
    model,
    createdAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------- pass 2 ----

const GROUPS_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string" },
    groups: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      title: { type: "string" }, angle: { type: "string" },
      clipIds: { type: "array", items: { type: "string" } },
      moments: { type: "array", items: { type: "object", additionalProperties: false, properties: { clipId: { type: "string" }, start: { type: "number" }, end: { type: "number" } }, required: ["clipId", "start", "end"] } },
      opener: { type: "object", additionalProperties: false, properties: { clipId: { type: "string" }, start: { type: "number" }, end: { type: "number" }, why: { type: "string" } }, required: ["clipId", "start", "end", "why"] },
      cta: { type: "string" },
    }, required: ["title", "angle", "clipIds", "moments", "opener", "cta"] } },
    unusable: { type: "array", items: { type: "object", additionalProperties: false, properties: { clipId: { type: "string" }, reason: { type: "string" } }, required: ["clipId", "reason"] } },
  },
  required: ["summary", "groups", "unusable"],
} as const;

type GroupsOut = { summary: string; groups: { title: string; angle: string; clipIds: string[]; moments: { clipId: string; start: number; end: number }[]; opener: { clipId: string; start: number; end: number; why: string }; cta: string }[]; unusable: { clipId: string; reason: string }[] };

const cardText = (c: ClipInput): string => {
  const k = c.card!;
  return `${clipLabel(c.position)} · id ${c.id} · ${Math.round(c.durationSec)}s${c.recordedAt ? ` · file time ${c.recordedAt.slice(0, 16).replace("T", " ")}` : ""}
  subject: ${k.subject}; setting: ${k.setting}; action: ${k.action}; people: ${k.people}; tags: ${k.tags.join(", ") || "—"}
  moments: ${k.moments.map((m) => `${m.start.toFixed(1)}–${m.end.toFixed(1)}s ${m.strength}${m.sound ? ", sound worth hearing" : ""} "${m.label}"`).join("; ")}
  speech: ${k.speech.present ? `${k.speech.summary}${k.speech.hookLine ? ` · hook line: "${k.speech.hookLine}"` : ""}` : "none"}
  quality: picture ${k.quality.visual}, sound ${k.quality.audio}${k.quality.notes.length ? ` (${k.quality.notes.join("; ")})` : ""}; opener candidate: ${k.openerCandidate ? "yes" : "no"}`;
};

export async function batchGroups(clips: ClipInput[], acct: AccountContext): Promise<{ summary: string; groups: ProposedGroup[]; unusable: { clipId: string; reason: string }[]; model: string }> {
  const withCards = clips.filter((c) => c.card);
  const system = `You plan short-form posts (vertical video, 8–60 seconds) from a batch of raw clips, each described by a card. ${HONESTY}
Group clips that belong together — same subject, same story, same session (file times help) — into posts. A clip belongs to at most ONE post. Reference moments by clip id with start/end seconds copied from the cards; do not invent ranges. Skip weak moments.
Do not force a number of posts: if the footage only supports one post, propose one; if none, propose none. Rank the strongest post first. Titles are short and concrete ("Making a pepperoni pizza"), angles one sentence. opener: the single best moment to open with and why (clipId "" when there is none). cta: a natural closing ask that fits the account's goal, or "".
unusable: clips that should not be used at all, with a plain reason.`;
  const content: Content = [
    { type: "text", text: `${accountText(acct)}${learnedText(acct)}

${withCards.length} clips, ${Math.round(withCards.reduce((a, c) => a + c.durationSec, 0))} seconds in total:

${withCards.map(cardText).join("\n\n")}

The images that follow are one frame from each clip, in the same order (${withCards.map((c) => clipLabel(c.position)).join(", ")}).` },
    ...withCards.filter((c) => c.frames.length).map((c) => ({ type: "image" as const, source: { type: "url" as const, url: (c.frames[Math.min(1, c.frames.length - 1)] ?? c.frames[0]).url } })),
  ];
  const { data, model } = await structured<GroupsOut>("studio_batch", system, content, GROUPS_SCHEMA, 4000, { ownerId: acct.ownerId, feature: "clip_batch" });
  const groups: ProposedGroup[] = (data.groups ?? []).map((g) => ({
    title: g.title, angle: g.angle, clipIds: g.clipIds ?? [], moments: g.moments ?? [],
    opener: g.opener?.clipId ? g.opener : null,
    cta: g.cta?.trim() || null,
  }));
  return { summary: data.summary ?? "", groups, unusable: data.unusable ?? [], model };
}

// ------------------------------------------------------------- pass 3 ----

const EDL_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    targetSec: { type: "object", additionalProperties: false, properties: { min: { type: "number" }, max: { type: "number" } }, required: ["min", "max"] },
    segments: { type: "array", items: { type: "object", additionalProperties: false, properties: { clipId: { type: "string" }, in: { type: "number" }, out: { type: "number" }, role: { type: "string", enum: ["opener", "body", "ending"] }, note: { type: "string" }, transition: { type: "string", enum: ["cut", "fade", "zoom", "whip"] }, sound: { type: "boolean" } }, required: ["clipId", "in", "out", "role", "note", "transition", "sound"] } },
    text: { type: "array", items: { type: "object", additionalProperties: false, properties: { at: { type: "number" }, end: { type: "number" }, text: { type: "string" }, role: { type: "string", enum: ["opening", "mid", "cta"] } }, required: ["at", "end", "text", "role"] } },
    enhance: { type: "array", items: { type: "object", additionalProperties: false, properties: { clipId: { type: "string" }, kind: { type: "string", enum: ["brighten", "darken", "warm", "cool", "contrast"] }, amount: { type: "string", enum: ["slight", "moderate"] }, why: { type: "string" } }, required: ["clipId", "kind", "amount", "why"] } },
    cta: { type: "string" }, music: { type: "string" }, caption: { type: "string" },
    endCard: { type: "object", additionalProperties: false, properties: { location: { type: "string" }, cta: { type: "string" } }, required: ["location", "cta"] },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["targetSec", "segments", "text", "enhance", "cta", "music", "caption", "endCard", "notes"],
} as const;

const DIRECTIVE_TEXT: Record<RegenerateDirective, string> = {
  faster: "Faster pace: more segments, each 1.5–3 seconds, cut on the action; same story.",
  energetic: "More energetic: open on the most striking moment, quicker cuts, short punchy text lines.",
  professional: "More professional: calmer pacing, fewer and plainer text lines, no hype words, a clean CTA.",
  shorter: "Shorter: aim for about 60% of the previous cut's length; keep only the strongest moments.",
  different_hook: "A different hook: open on a different moment than the previous cut and write a different opening line.",
  different_clips: "Use different footage: prefer clips and moments the previous cut did not use, where the material allows; keep the story coherent.",
};

export type EdlVariant = { directive: RegenerateDirective; previous: Edl };

/**
 * How a cut from the person's own brief is made, on top of the general rules.
 * Learned from a 2-second, one-clip "POV: you walk into work on Halloween"
 * cut made from three clips (2026-11-02): use all of the footage, cut at a
 * short-form pace, and carry the idea in a few text beats.
 */
export const BRIEF_CUT_RULES = `How to cut from this brief:
- Use EVERY clip listed at least once, each at its best moment, unless the brief says to leave one out. Handheld movement, panning and walking point-of-view shots are normal phone footage; never drop a clip for that.
- Length: 10 to 20 seconds unless the brief gives a length (set targetSec to match). Never shorter than the footage allows.
- Pace: for a POV, busy, rush, behind-the-scenes or day-in-the-life brief, cut every 1 to 2.5 seconds so it feels fast, and let the last shot run 2 to 3 seconds. Otherwise 1.5 to 4 seconds a cut. 4 to 10 segments.
- Order tells the story: start where the brief starts (walking in, the first moment), build through the busiest moments, then the payoff (the finished thing, the fullest shot), and end on the brand when a logo or sign is in the footage.
- Text: the person's own lines when the brief gives them (keep "POV: …" when they wrote it), on screen from 0 for the first; otherwise the text rule below. No numbers or claims the clips don't show.`;

export async function opportunityEdl(opp: Opportunity, clips: ClipInput[], acct: AccountContext, variant?: EdlVariant, brief?: string | null, retry?: string | null): Promise<{ raw: RawEdl; model: string }> {
  const used = clips.filter((c) => (variant ? true : opp.clipIds.includes(c.id)) && c.card);
  const previous = variant
    ? `\n\nThe previous cut (${variant.previous.segments.reduce((a, s) => a + (s.out - s.in), 0).toFixed(1)}s): ${variant.previous.segments.map((s) => `${clipLabel(used.find((c) => c.id === s.clipId)?.position ?? 0)} ${s.in.toFixed(1)}–${s.out.toFixed(1)}s`).join("; ")}${variant.previous.text[0] ? `; opening line "${variant.previous.text[0].text}"` : ""}.\nChange requested: ${DIRECTIVE_TEXT[variant.directive]}`
    : "";
  const system = `You are cutting ONE short-form vertical post (1080×1920) from the clips given, as an edit decision list another editor could follow exactly. ${HONESTY}
- segments: in order; each has a clip id and clip-relative in/out seconds inside that clip, preferring the chosen moments; the first segment is the opener (the strongest attention-holding moment or the spoken hook); the last is the ending. 3 to 10 segments.
- Edit the way the owner taught you, from a cut they approved:
  - Choose shots from what you can see happening in the frames and the moments, with exact in and out points. Each segment starts when its action starts and ends when it's done. Leave out anything where nothing happens, a hand or arm covers the subject, or a shadow falls across half of it.
  - Open on the best unbroken move, already moving, with the subject in frame from the first frame. Don't chop it: one move can run up to 5 seconds, longer than the other shots.
  - A repeated action becomes several short hits of 1 to 2 seconds, each showing it further along.
  - Then a clean look at the finished thing for 1.5 to 2 seconds.
  - End on the brand: a logo, sign or shop name readable straight on, 2.5 to 3.5 seconds. Without one, end on the finished thing.
  - sound: true on segments where the real sound of the action should be heard over the music (cutting, sizzling, pouring). false everywhere else.
  - Use every clip given unless one truly has nothing usable, and tell a small story in order: arriving or the setup, the work, then the payoff.
  - Start each segment when its action starts and end it before the camera drifts onto nothing (skip the second of plain wall or closed door before the reveal).
  - Pace to the brief: for a POV, a rush, "how busy", a day in the life or anything energetic, 6 to 10 segments of 0.8 to 2.5 seconds each; calmer posts, fewer and longer.
  - End on the strongest, most satisfying image and let it run 2.5 to 4 seconds.
  - Handheld movement is fine; it's how short-form looks.
- transition: "fade" (a short soft dissolve) on every join. Use "cut", "zoom" or "whip" only when the brief asks for them by name.
- targetSec: a sensible length for this footage, typically 10–30 seconds; never longer than the footage supports, and never much shorter than it allows when the clips are good.
- text: 1 or 2 on-screen lines with output-relative at/end seconds, the way a person types their own: lowercase, a few words, a relatable reaction to what's on screen that makes someone smile or nod ("when it comes out looking like this", then "and you still have to share it"). The first is up from 0 through the opening shot; the second runs across the middle. Never an offer, a slogan, a price or an ask, and never "POV" unless the shot really is that person's point of view. When the brief gives its own lines, use those. No line of text on the last shot. When someone talks to camera, the captions carry their words: add no reaction lines, only a short opening line when the brief asks for one.
- endCard: the big ending in the middle of the frame. location: the place, spelled out as people say it ("Nashville, Tennessee"), from the brand's location; with more than one location or a neighborhood, the city or metro area people know; "" when the brand notes give no location. cta: the ask in 2 or 3 words in capitals that fit the goal ("ORDER NOW", "BOOK TODAY", "COME TRY IT"); "" when the brief says no ask. Leave both "" when the footage isn't the brand's own business (someone else's speech, event or shop), and when someone talks to camera unless the brief asks for an ending. SOCIA adds the website itself.
- enhance: only for clips whose MEASUREMENTS say they are darker, brighter, cooler or warmer than the others, or low in contrast. These are checked against the numbers afterwards; unsupported ones are dropped.
- cta: a closing ask that fits the goal, or "". caption: a post caption in the brand's voice (with the ask when there is one).
- music: one sentence recommending a style, tempo range and level ("keep it low under speech"); NEVER a specific song or artist. When a measured note on what sound has worked for this account is given, the recommendation must agree with it.
- notes: anything the editor must know (e.g. "cut away before the pan shakes at 7s").`;
  const content: Content = [
    { type: "text", text: `${accountText(acct)}${acct.audio ? `\nWhat sound has worked for this account (measured from its past posts): ${acct.audio}` : ""}${learnedText(acct)}

${brief ? `${BRIEF_CUT_RULES}\n\n` : ""}${brief ? `The brief for this video. Follow it closely: its length, order, pace, on-screen lines and ending win over the general rules below, except the honesty rules. Where it asks for footage the clips don't have, say so in notes and use the nearest real moment.\n"""\n${brief.trim()}\n"""\n\n` : ""}The post: "${opp.title}" — ${opp.angle}${opp.cta ? ` Suggested ask: "${opp.cta}".` : ""}
Chosen moments: ${opp.moments.map((m) => `${clipLabel(used.find((c) => c.id === m.clipId)?.position ?? 0)} ${m.start.toFixed(1)}–${m.end.toFixed(1)}s`).join("; ")}.
${opp.opener ? `Opener candidate: ${clipLabel(used.find((c) => c.id === opp.opener!.clipId)?.position ?? 0)} ${opp.opener.start.toFixed(1)}–${opp.opener.end.toFixed(1)}s (${opp.opener.why}).` : "No opener was identified; choose the strongest available moment."}${previous}

Clips${variant?.directive === "different_clips" ? " (every clip in the project; the post's own clips are listed first)" : ""}:

${used.map((c) => `${cardText(c)}\n  measurements: ${factsText(c.facts)}${c.transcript?.words.length ? `\n  transcript:\n${transcriptLines(c.transcript, 4000).split("\n").map((l) => `    ${l}`).join("\n")}` : ""}`).join("\n\n")}

Frames from the clips follow, each labelled with its clip and time. Use them to see what's really on screen at the times you choose.${retry ? `\n\n${retry}` : ""}` },
    ...editFrames(used).flatMap(({ clipId, frames }) => frames.flatMap((f) => [
      { type: "text" as const, text: `${clipLabel(used.find((c) => c.id === clipId)?.position ?? 0)} at ${f.t.toFixed(1)}s:` },
      { type: "image" as const, source: { type: "url" as const, url: f.url } },
    ])),
  ];
  const { data, model } = await structured<RawEdl>("studio_edl", system, content, EDL_SCHEMA, brief ? 6000 : 4000, { ownerId: acct.ownerId, feature: "clip_edl" });
  return { raw: data, model };
}
