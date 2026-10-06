// The three model passes behind Build from Clips. Each is a single
// structured-output call on the model configured for that pass
// (lib/anthropic.ts modelFor). What comes back is a PROPOSAL: pass-2 groups
// go through validateYield, pass-3 EDLs through validateEdl, before anyone
// sees them. Images reach the model as short-lived signed URLs, never as
// bytes through this function.
import { anthropic, modelFor } from "@/lib/anthropic";
import { brandContext } from "@/lib/prompt";
import type { BrandDetail } from "@/lib/profile";
import type { ClipCard, ClipFacts, Edl, Opportunity, RegenerateDirective, Transcript } from "./types";
import { clipLabel, fmtClock } from "./types";
import type { ProposedGroup } from "./yield";
import type { RawEdl } from "./edl";

export type AccountContext = {
  niche: string | null; location: string | null; goals: string | null; brand: BrandDetail | null;
  /** measured note on what sound has worked for this account (lib/audio), when there is one */
  audio?: string | null;
};

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

type Content = ({ type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } })[];

async function structured<T>(task: Parameters<typeof modelFor>[0], system: string, content: Content, schema: unknown, maxTokens: number): Promise<{ data: T; model: string }> {
  const model = modelFor(task);
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create(params as any);
  if (res.stop_reason === "refusal") throw new AnalysisError("refusal", "The model declined this request.");
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  if (!text) throw new AnalysisError("empty", "Empty response from the model.");
  try {
    return { data: JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as T, model };
  } catch {
    throw new AnalysisError("parse", "Could not read the model's response.");
  }
}

// ------------------------------------------------------------- pass 1 ----

const CARD_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    subject: { type: "string" }, setting: { type: "string" }, action: { type: "string" },
    people: { type: "string", enum: ["none", "one", "several", "unknown"] },
    moments: { type: "array", items: { type: "object", additionalProperties: false, properties: { start: { type: "number" }, end: { type: "number" }, label: { type: "string" }, strength: { type: "string", enum: ["strong", "good", "weak"] }, why: { type: "string" } }, required: ["start", "end", "label", "strength", "why"] } },
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
Moments: 1 to 5 ranges inside the clip worth using, each with a label and a strength — "strong" (would hold attention on its own), "good" (usable), "weak" (unusable: shaky, blurry, nothing happens, badly exposed). Cover the clip; a clip with nothing usable has one weak moment spanning it.
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
  const { data, model } = await structured<CardOut>("studio_clip", system, content, CARD_SCHEMA, 1800);
  const d = Math.max(0.1, clip.durationSec);
  const moments = (data.moments ?? [])
    .map((m) => ({ ...m, start: Math.max(0, Math.min(m.start, d)), end: Math.max(0, Math.min(m.end, d)) }))
    .filter((m) => m.end > m.start)
    .slice(0, 5);
  return {
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
  moments: ${k.moments.map((m) => `${m.start.toFixed(1)}–${m.end.toFixed(1)}s ${m.strength} "${m.label}"`).join("; ")}
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
    { type: "text", text: `${accountText(acct)}

${withCards.length} clips, ${Math.round(withCards.reduce((a, c) => a + c.durationSec, 0))} seconds in total:

${withCards.map(cardText).join("\n\n")}

The images that follow are one frame from each clip, in the same order (${withCards.map((c) => clipLabel(c.position)).join(", ")}).` },
    ...withCards.filter((c) => c.frames.length).map((c) => ({ type: "image" as const, source: { type: "url" as const, url: (c.frames[Math.min(1, c.frames.length - 1)] ?? c.frames[0]).url } })),
  ];
  const { data, model } = await structured<GroupsOut>("studio_batch", system, content, GROUPS_SCHEMA, 4000);
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
    segments: { type: "array", items: { type: "object", additionalProperties: false, properties: { clipId: { type: "string" }, in: { type: "number" }, out: { type: "number" }, role: { type: "string", enum: ["opener", "body", "ending"] }, note: { type: "string" } }, required: ["clipId", "in", "out", "role", "note"] } },
    text: { type: "array", items: { type: "object", additionalProperties: false, properties: { at: { type: "number" }, end: { type: "number" }, text: { type: "string" }, role: { type: "string", enum: ["opening", "mid", "cta"] } }, required: ["at", "end", "text", "role"] } },
    enhance: { type: "array", items: { type: "object", additionalProperties: false, properties: { clipId: { type: "string" }, kind: { type: "string", enum: ["brighten", "darken", "warm", "cool", "contrast"] }, amount: { type: "string", enum: ["slight", "moderate"] }, why: { type: "string" } }, required: ["clipId", "kind", "amount", "why"] } },
    cta: { type: "string" }, music: { type: "string" }, caption: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["targetSec", "segments", "text", "enhance", "cta", "music", "caption", "notes"],
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

export async function opportunityEdl(opp: Opportunity, clips: ClipInput[], acct: AccountContext, variant?: EdlVariant): Promise<{ raw: RawEdl; model: string }> {
  const used = clips.filter((c) => (variant ? true : opp.clipIds.includes(c.id)) && c.card);
  const previous = variant
    ? `\n\nThe previous cut (${variant.previous.segments.reduce((a, s) => a + (s.out - s.in), 0).toFixed(1)}s): ${variant.previous.segments.map((s) => `${clipLabel(used.find((c) => c.id === s.clipId)?.position ?? 0)} ${s.in.toFixed(1)}–${s.out.toFixed(1)}s`).join("; ")}${variant.previous.text[0] ? `; opening line "${variant.previous.text[0].text}"` : ""}.\nChange requested: ${DIRECTIVE_TEXT[variant.directive]}`
    : "";
  const system = `You are cutting ONE short-form vertical post (1080×1920) from the clips given, as an edit decision list another editor could follow exactly. ${HONESTY}
- segments: in order; each has a clip id and clip-relative in/out seconds that lie INSIDE that clip's usable moments; the first segment is the opener (the strongest attention-holding moment or the spoken hook); the last is the ending. 3 to 8 segments.
- targetSec: a sensible length for this footage, typically 15–30 seconds; never longer than the footage supports.
- text: 1 to 3 on-screen lines (opening line, optional mid-point line, optional CTA line) with output-relative at/end seconds. Short, plain, in the brand's voice.
- enhance: only for clips whose MEASUREMENTS say they are darker, brighter, cooler or warmer than the others, or low in contrast. These are checked against the numbers afterwards; unsupported ones are dropped.
- cta: a closing ask that fits the goal, or "". caption: a post caption in the brand's voice (with the ask when there is one).
- music: one sentence recommending a style, tempo range and level ("keep it low under speech"); NEVER a specific song or artist. When a measured note on what sound has worked for this account is given, the recommendation must agree with it.
- notes: anything the editor must know (e.g. "cut away before the pan shakes at 7s").`;
  const content: Content = [
    { type: "text", text: `${accountText(acct)}${acct.audio ? `\nWhat sound has worked for this account (measured from its past posts): ${acct.audio}` : ""}

The post: "${opp.title}" — ${opp.angle}${opp.cta ? ` Suggested ask: "${opp.cta}".` : ""}
Chosen moments: ${opp.moments.map((m) => `${clipLabel(used.find((c) => c.id === m.clipId)?.position ?? 0)} ${m.start.toFixed(1)}–${m.end.toFixed(1)}s`).join("; ")}.
${opp.opener ? `Opener candidate: ${clipLabel(used.find((c) => c.id === opp.opener!.clipId)?.position ?? 0)} ${opp.opener.start.toFixed(1)}–${opp.opener.end.toFixed(1)}s (${opp.opener.why}).` : "No opener was identified; choose the strongest available moment."}${previous}

Clips${variant?.directive === "different_clips" ? " (every clip in the project; the post's own clips are listed first)" : ""}:

${used.map((c) => `${cardText(c)}\n  measurements: ${factsText(c.facts)}${c.transcript?.words.length ? `\n  transcript:\n${transcriptLines(c.transcript, 900).split("\n").map((l) => `    ${l}`).join("\n")}` : ""}`).join("\n\n")}

The images that follow are one frame from each clip, in the same order (${used.map((c) => clipLabel(c.position)).join(", ")}).` },
    ...used.filter((c) => c.frames.length).map((c) => ({ type: "image" as const, source: { type: "url" as const, url: (c.frames[Math.min(1, c.frames.length - 1)] ?? c.frames[0]).url } })),
  ];
  const { data, model } = await structured<RawEdl>("studio_edl", system, content, EDL_SCHEMA, 3000);
  return { raw: data, model };
}
