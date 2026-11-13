// "Make a video from a prompt or a reference". A written brief, a reference
// video, or both, become the brief SOCIA's cut follows. The reference is read
// in the browser (length, every cut, a few frames, the speech with times);
// only those facts reach the server, and the video itself is never stored.
// A model breaks the reference down into beats and a text style; this file
// bounds what comes in, turns the breakdown into the brief the editor follows,
// and maps its text style onto the cut. Pure and tested.
import { CAPCUT_FONTS, CAPCUT_STYLE, DEFAULT_STYLE, sanitizeStyle, type EdlStyle, type FontId } from "./style";
import type { ClipCard, ClipMoment, Edl, EdlBrief, EdlSegment, MomentRef, Opportunity } from "./types";

export const PROMPT_MAX = 2000;
export const REF_MAX_SEC = 180;
export const REF_MAX_FRAMES = 10;
/** base64 characters per frame: a 480 px JPEG is far below this */
export const REF_MAX_FRAME_CHARS = 350_000;
const TITLE_MAX = 70;

export type ReferenceWord = { text: string; startMs: number; endMs: number };
export type ReferenceInput = {
  name: string;
  durationSec: number;
  width: number | null;
  height: number | null;
  /** seconds where the picture changes sharply; null when the browser couldn't scan */
  cuts: number[] | null;
  frames: { t: number; jpeg: string }[];
  words: ReferenceWord[] | null;
  /** what the browser measured about its sound */
  audio: { hasAudio: boolean; level: string; audibleRatio: number | null } | null;
};

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** A reference from the browser, bounded; null when it isn't one. */
export function sanitizeReference(v: unknown): ReferenceInput | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const durationSec = num(o.durationSec, 0.5, REF_MAX_SEC);
  if (durationSec == null) return null;
  const frames = (Array.isArray(o.frames) ? o.frames : []).flatMap((f) => {
    const x = f as Record<string, unknown>;
    const t = num(x.t, 0, durationSec + 1);
    const jpeg = typeof x.jpeg === "string" && x.jpeg.length < REF_MAX_FRAME_CHARS && /^[A-Za-z0-9+/=]+$/.test(x.jpeg) ? x.jpeg : null;
    return t != null && jpeg ? [{ t: Math.round(t * 100) / 100, jpeg }] : [];
  }).slice(0, REF_MAX_FRAMES);
  if (!frames.length) return null;
  const cuts = Array.isArray(o.cuts)
    ? Array.from(new Set(o.cuts.map((c) => num(c, 0, durationSec)).filter((c): c is number => c != null).map((c) => Math.round(c * 10) / 10))).sort((a, b) => a - b).slice(0, 200)
    : null;
  const words = Array.isArray(o.words)
    ? o.words.flatMap((w) => {
      const x = w as Record<string, unknown>;
      const text = typeof x.text === "string" ? x.text.trim().slice(0, 40) : "";
      const s = num(x.startMs, 0, durationSec * 1000 + 1000), e = num(x.endMs, 0, durationSec * 1000 + 1000);
      return text && s != null && e != null ? [{ text, startMs: s, endMs: e }] : [];
    }).slice(0, 1200)
    : null;
  const a = o.audio as Record<string, unknown> | null | undefined;
  return {
    name: typeof o.name === "string" ? o.name.replace(/[^\w .\-()]/g, "").slice(0, 80) : "reference",
    durationSec: Math.round(durationSec * 10) / 10,
    width: num(o.width, 1, 10000), height: num(o.height, 1, 10000),
    cuts, frames, words: words && words.length ? words : null,
    audio: a && typeof a === "object" ? { hasAudio: Boolean(a.hasAudio), level: typeof a.level === "string" ? a.level.slice(0, 12) : "unknown", audibleRatio: num(a.audibleRatio, 0, 1) } : null,
  };
}

/** Bound a written brief; null when there is nothing to follow. */
export function cleanPrompt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.replace(/\r/g, "").trim().slice(0, PROMPT_MAX);
  return p.length >= 3 ? p : null;
}

/** Shot count and pace, measured from the cuts the browser found. */
export function shotStats(ref: Pick<ReferenceInput, "durationSec" | "cuts">): { shots: number | null; medianShotSec: number | null; firstCutSec: number | null } {
  if (!ref.cuts) return { shots: null, medianShotSec: null, firstCutSec: null };
  const edges = [0, ...ref.cuts.filter((c) => c > 0.2 && c < ref.durationSec - 0.2), ref.durationSec];
  const lens = edges.slice(1).map((e, i) => e - edges[i]).filter((l) => l > 0.05).sort((a, b) => a - b);
  const mid = Math.floor(lens.length / 2);
  const median = lens.length ? (lens.length % 2 ? lens[mid] : (lens[mid - 1] + lens[mid]) / 2) : null;
  return { shots: lens.length, medianShotSec: median != null ? Math.round(median * 10) / 10 : null, firstCutSec: edges.length > 2 ? Math.round(edges[1] * 10) / 10 : null };
}

/** The speech as timed lines ("0.0–2.4s: ..."), a few words per line, for the breakdown. */
export function timedSpeech(words: ReferenceWord[] | null, maxChars = 1500): string | null {
  if (!words?.length) return null;
  const lines: string[] = [];
  let cur: ReferenceWord[] = [];
  const flush = () => { if (cur.length) lines.push(`${(cur[0].startMs / 1000).toFixed(1)}–${(cur[cur.length - 1].endMs / 1000).toFixed(1)}s: ${cur.map((w) => w.text).join(" ")}`); cur = []; };
  for (const w of words) {
    if (cur.length && (w.startMs - cur[cur.length - 1].endMs > 600 || cur.length >= 10)) flush();
    cur.push(w);
  }
  flush();
  let out = "";
  for (const l of lines) { if (out.length + l.length > maxChars) break; out += `${l}\n`; }
  return out.trim();
}

// ------------------------------------------------------------ breakdown ----

export type ReferenceBreakdown = {
  summary: string;
  hook: string;
  pace: string;
  ending: string;
  beats: { start: number; end: number; shows: string; onscreen: string; spoken: string }[];
  text: { position: "top" | "middle" | "bottom" | "none"; box: "dark" | "light" | "accent" | "none"; uppercase: boolean; size: "s" | "m" | "l"; font: FontId; accent: string };
  captions: boolean;
};

export const BREAKDOWN_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string" }, hook: { type: "string" }, pace: { type: "string" }, ending: { type: "string" },
    beats: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { start: { type: "number" }, end: { type: "number" }, shows: { type: "string" }, onscreen: { type: "string" }, spoken: { type: "string" } },
        required: ["start", "end", "shows", "onscreen", "spoken"],
      },
    },
    text: {
      type: "object", additionalProperties: false,
      properties: {
        position: { type: "string", enum: ["top", "middle", "bottom", "none"] },
        box: { type: "string", enum: ["dark", "light", "accent", "none"] },
        uppercase: { type: "boolean" },
        size: { type: "string", enum: ["s", "m", "l"] },
        font: { type: "string", enum: CAPCUT_FONTS.map((f) => f.id) },
        accent: { type: "string" },
      },
      required: ["position", "box", "uppercase", "size", "font", "accent"],
    },
    captions: { type: "boolean" },
  },
  required: ["summary", "hook", "pace", "ending", "beats", "text", "captions"],
} as const;

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s*\u2014\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, n) : "");

/** The model's breakdown, bounded to the reference's own length. */
export function cleanBreakdown(raw: unknown, durationSec: number): ReferenceBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const beats = (Array.isArray(o.beats) ? o.beats : []).flatMap((b) => {
    const x = b as Record<string, unknown>;
    const start = num(x.start, 0, durationSec), end = num(x.end, 0, durationSec + 0.5);
    if (start == null || end == null || end <= start) return [];
    return [{ start: Math.round(start * 10) / 10, end: Math.round(Math.min(end, durationSec) * 10) / 10, shows: clip(x.shows, 160), onscreen: clip(x.onscreen, 120), spoken: clip(x.spoken, 200) }];
  }).sort((a, b) => a.start - b.start).slice(0, 20);
  if (!beats.length) return null;
  const t = (o.text && typeof o.text === "object" ? o.text : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  return {
    summary: clip(o.summary, 400), hook: clip(o.hook, 240), pace: clip(o.pace, 240), ending: clip(o.ending, 240), beats,
    text: {
      position: pick(t.position, ["top", "middle", "bottom", "none"] as const, "middle"),
      box: pick(t.box, ["dark", "light", "accent", "none"] as const, "dark"),
      uppercase: typeof t.uppercase === "boolean" ? t.uppercase : false,
      size: pick(t.size, ["s", "m", "l"] as const, "m"),
      font: pick(t.font, CAPCUT_FONTS.map((f) => f.id), CAPCUT_STYLE.font),
      accent: typeof t.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(t.accent) ? t.accent.toLowerCase() : "",
    },
    captions: Boolean(o.captions),
  };
}

/** The breakdown as the instructions the cut follows (stored with the build, shown back to the person). */
export function referenceBrief(b: ReferenceBreakdown, durationSec: number, stats: ReturnType<typeof shotStats>): string {
  const lines = [
    `Recreate the structure, pacing and on-screen text style of a reference video, using only these clips (never its footage).`,
    `Reference: ${durationSec}s${stats.shots ? `, ${stats.shots} shots, a cut about every ${stats.medianShotSec}s` : ""}${stats.firstCutSec ? `, first cut at ${stats.firstCutSec}s` : ""}. ${b.summary}`,
    `Hook: ${b.hook}`,
    `Pace: ${b.pace}`,
    `Beats, in order:`,
    ...b.beats.map((x) => `- ${x.start}–${x.end}s: ${x.shows}${x.onscreen ? `. On screen: "${x.onscreen}"` : ""}${x.spoken ? `. Said: "${x.spoken}"` : ""}`),
    `Ending: ${b.ending}`,
    `Match its length (within about 20%), its number of shots where the footage allows, and put on-screen lines at the same moments in the same pattern, rewritten for this account's own content. Reuse a line word for word only when it is generic ("wait for it", "part 2").`,
  ];
  return lines.join("\n").slice(0, 3000);
}

/** The reference's text style applied to a cut; the brand's colour stays unless the reference shows a clear one. */
export function referenceStyle(b: ReferenceBreakdown, base: EdlStyle | undefined): EdlStyle {
  const s = sanitizeStyle(base) ?? DEFAULT_STYLE;
  return {
    ...s,
    font: b.text.font,
    accent: b.text.accent || s.accent,
    textBox: b.text.box,
    captions: { ...s.captions, position: b.text.position === "none" ? s.captions.position : b.text.position, size: b.text.size, box: b.text.box !== "none", uppercase: b.text.uppercase },
  };
}

// ----------------------------------------------------------- the post ----

export type BriefClip = { id: string; position: number; durationSec: number; card: ClipCard | null };

/** A short title for the build: the prompt's first sentence, or the reference's summary. */
export function titleFor(prompt: string | null, ref: ReferenceBreakdown | null): string {
  const src = (prompt ?? "").trim() || (ref ? `Like the reference: ${ref.summary}` : "");
  const first = src.split(/\n+/)[0]?.split(/(?<=[.!?])\s+/)[0]?.replace(/^["'“”]+|["'“”.]+$/g, "").trim() ?? "";
  if (!first) return "Your video";
  return first.length <= TITLE_MAX ? first : `${first.slice(0, TITLE_MAX - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * The brief as an Opportunity over every understood clip: every non-weak
 * moment is on offer, the strongest early moment of an opener clip opens,
 * and the evidence counts what is really there.
 */
export function opportunityFromBrief(title: string, angle: string, clips: BriefClip[], idx: number): Opportunity {
  const carded = clips.filter((c) => c.card);
  const moments: MomentRef[] = [];
  for (const c of carded) {
    const usable = c.card!.moments.filter((m) => m.strength !== "weak" && m.end > m.start);
    // A brief is about the person's own footage: every clip they gave is in
    // play. A clip whose moments were all marked weak (a handheld pan, a POV
    // walk) still offers its best one; a clip with no moments at all, the whole clip.
    const best = usable.length ? null : bestMoment(c.card!.moments);
    const offer = usable.length ? usable : best ? [best] : c.durationSec > 0 ? [{ start: 0, end: c.durationSec }] : [];
    for (const m of offer) moments.push({ clipId: c.id, start: m.start, end: m.end });
  }
  const clipIds = [...new Set(moments.map((m) => m.clipId))];
  const openerClip = carded.find((c) => c.card!.openerCandidate && c.card!.moments.some((m) => m.strength !== "weak"));
  let opener: Opportunity["opener"] = null;
  if (openerClip) {
    const m = [...openerClip.card!.moments].filter((x) => x.strength !== "weak").sort((a, b) => (a.strength === b.strength ? a.start - b.start : a.strength === "strong" ? -1 : 1))[0];
    if (m) opener = { clipId: openerClip.id, start: m.start, end: m.end, why: openerClip.card!.speech.hookLine ? `a hook line is spoken early: "${openerClip.card!.speech.hookLine}"` : "flagged as a scroll-stopping opening" };
  }
  const usableSec = moments.reduce((a, m) => a + (m.end - m.start), 0);
  return {
    idx, title, angle, clipIds, moments, opener, cta: null,
    evidence: { clips: clipIds.length, usableSec: Math.round(usableSec * 10) / 10, distinctMoments: moments.length, hasOpener: Boolean(opener), hasSpeech: carded.some((c) => c.card!.speech.present) },
    strength: usableSec >= 15 && moments.length >= 3 ? "strong" : "possible",
  };
}

// ---- the length and coverage a brief build must reach ----------------------

/** A brief build's length unless the brief says otherwise: short-form, 10 to 20 seconds. */
export const BRIEF_LENGTH = { min: 10, max: 20 } as const;
/** The shortest cut SOCIA keeps from a brief: 10 seconds, or most of the footage when there is less. */
export const briefFloorSec = (footageSec: number): number => Math.min(BRIEF_LENGTH.min, Math.round(footageSec * 0.6 * 10) / 10);
/** A clip added to fill a brief cut runs this long (seconds): a quick beat, not a held shot. */
export const FILL_SEC = { min: 1.2, max: 2.5 } as const;
const MIN_CUT = 0.8;
const RANK: Record<ClipMoment["strength"], number> = { strong: 3, good: 2, weak: 1 };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A clip's best moment: the strongest, then the longest. */
export function bestMoment(moments: ClipMoment[]): ClipMoment | null {
  const ok = moments.filter((m) => m.end > m.start);
  return ok.sort((a, b) => RANK[b.strength] - RANK[a.strength] || (b.end - b.start) - (a.end - a.start))[0] ?? null;
}

export type FillClip = { id: string; position: number; durationSec: number; moments: ClipMoment[] };

/**
 * After the model's cut is validated: every clip the person gave is used, and
 * the cut reaches `minSec`. A clip the cut left out gets its best moment
 * (FILL_SEC long, from the middle of the moment) just before the ending shot;
 * then, while still short, each cut runs on into its clip. Nothing is
 * invented: every added second is real footage. Returns which clips were added.
 */
export function fillCut(segments: EdlSegment[], clips: FillClip[], minSec: number): { segments: EdlSegment[]; added: string[] } {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const used = new Set(segments.map((s) => s.clipId));
  const out = segments.map((s) => ({ ...s }));
  const added: string[] = [];
  for (const c of [...clips].sort((a, b) => a.position - b.position)) {
    if (used.has(c.id) || c.durationSec < MIN_CUT) continue;
    const m = bestMoment(c.moments) ?? { start: 0, end: c.durationSec };
    const span = Math.max(0, Math.min(m.end, c.durationSec) - m.start);
    const len = Math.min(c.durationSec, Math.max(FILL_SEC.min, Math.min(FILL_SEC.max, span)));
    const start = Math.max(0, Math.min(c.durationSec - len, m.start + Math.max(0, (span - len) / 2)));
    const seg: EdlSegment = { id: "", clipId: c.id, in: r2(start), out: r2(start + len), role: "body", note: "Added so every clip you gave is in the cut." };
    if (out.length >= 2) out.splice(out.length - 1, 0, seg); else out.push(seg);
    used.add(c.id);
    added.push(c.id);
  }
  let total = out.reduce((a, s) => a + (s.out - s.in), 0);
  for (const s of out) {
    if (total >= minSec) break;
    const clip = byId.get(s.clipId);
    if (!clip) continue;
    const room = Math.max(0, Math.min(clip.durationSec, s.out + FILL_SEC.max) - s.out);
    const more = Math.min(room, minSec - total);
    s.out = r2(s.out + more);
    total += more;
  }
  out.forEach((s, i) => { s.id = `s${i + 1}`; s.role = i === 0 ? "opener" : out.length >= 3 && i === out.length - 1 ? "ending" : "body"; });
  return { segments: out, added };
}

/** Brief builds take -2, -3, …, down to BRIEF_IDX_MIN (-1 is the person's own edit; -1000 and below are single clips). */
export const BRIEF_IDX_MIN = -999;
export const isBriefIdx = (idx: number) => idx <= -2 && idx >= BRIEF_IDX_MIN;
export function nextBriefIdx(existing: number[]): number {
  const used = existing.filter(isBriefIdx);
  const next = Math.min(-1, ...used) - 1;
  if (next < BRIEF_IDX_MIN) throw new Error("This project has reached its limit of videos made from a brief. Start a new project.");
  return next;
}

/** The brief as the cut's instructions: the person's words first, then the reference breakdown. */
export function briefText(b: EdlBrief): string {
  return [b.prompt ? `The person's own words:\n"""\n${b.prompt}\n"""` : null, b.reference].filter(Boolean).join("\n\n");
}
export const withBrief = (edl: Edl, brief: EdlBrief | null | undefined): Edl => (brief ? { ...edl, brief } : edl);
