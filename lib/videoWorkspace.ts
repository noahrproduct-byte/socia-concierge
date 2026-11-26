// "Help me make a video" in the Planner (components/plan/VideoWorkspace.tsx): a
// person's own video idea, researched and made into a production plan, in
// stages so nothing is paid for before it's wanted:
//   1. research: real short videos that made a similar idea work (the Reels
//      SOCIA has read across Discover, plus YouTube Shorts by topic), the ones
//      that truly match picked by concept and structure, not by keyword, and two
//      or three directions to take it;
//   2. plan: for the direction chosen, the full production plan (hook, script,
//      shot list, editing, sound, caption), changed one part at a time after;
//   3. make: the plan goes to the video editor as its brief, with the chosen
//      Reel as the reference, or into the weekly plan.
// Types, sanitizers and the editor brief. Pure and browser-safe.
import { cutClean } from "./cutClean";
import { PROMPT_MAX } from "./studioClips/reference";

/** A real video SOCIA found for the idea. Its words are its caption or title, never claimed as what is said or shown. */
export type WsRef = {
  key: string;
  url: string;
  platform: "instagram" | "youtube";
  creator: string;
  thumb: string | null;
  views: number | null;
  /** against the creator's own median; null when there is no baseline */
  multiplier: number | null;
  basis: string;
  format: string;
  /** the post's caption or video title, as published */
  caption: string | null;
  /** why it matches the idea, from what SOCIA could read of it */
  why: string;
  /** what to take from it */
  adapt: string[];
  /** the file, for the editor's reference slot (Instagram, when official data gives it) */
  video?: string | null;
  refToken?: string | null;
};

export type WsDirection = {
  id: string;
  title: string;
  concept: string;
  hook: string;
  seconds: number;
  filming: string;
  editing: string;
  why: string;
  refKeys: string[];
  recommended: boolean;
};

export type WsShot = { from: number; to: number; film: string; angle: string; move: string; say: string; text: string; edit: string };

export type WsPlan = {
  title: string; objective: string; audience: string; seconds: number; platform: string; format: string; direction: string;
  hook: { visual: string; say: string; text: string; sound: string };
  script: string;
  shots: WsShot[];
  editing: string;
  music: string;
  voiceover: string;
  caption: string;
  hashtags: string[];
  cta: string;
  postTime: string;
};

export type WsResearch = { refs: WsRef[]; directions: WsDirection[]; note: string | null };

/** The one change a person can ask of a plan, each rewriting only its part. */
export const PLAN_CHANGES = {
  hook: "Improve the hook only: a stronger opening visual and first line. Keep everything else.",
  script: "Rewrite the script only, keeping the shots' timing.",
  engaging: "Make it more engaging: sharper hook, a turn in the middle, a reason to keep watching each scene.",
  cinematic: "Make it more cinematic: slower, more visual shots, camera movement, atmosphere.",
  simpler: "Simplify the filming: fewer shots, one location, one person with a phone.",
  shorter: "Shorten the video to about two thirds of its length, keeping the hook and the ending.",
} as const;
export type PlanChange = keyof typeof PLAN_CHANGES;
export const isPlanChange = (v: unknown): v is PlanChange => typeof v === "string" && v in PLAN_CHANGES;

const str = (v: unknown, n: number) => (typeof v === "string" ? cutClean(v.replace(/\s*[—–]\s*/g, ", ").replace(/[ \t]+/g, " ").trim(), n) : "");
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) : d);
const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter(Boolean).slice(0, n) : []);

export function sanitizeDirection(v: unknown, i: number, refKeys: Set<string>): WsDirection | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const title = str(o.title, 60), concept = str(o.concept, 300);
  if (!title || !concept) return null;
  return {
    id: str(o.id, 8) || String.fromCharCode(65 + i), title, concept,
    hook: str(o.hook, 200), seconds: num(o.seconds, 6, 90, 30), filming: str(o.filming, 300), editing: str(o.editing, 300), why: str(o.why, 300),
    refKeys: list(o.refKeys, 4, 40).filter((k) => refKeys.has(k)), recommended: o.recommended === true,
  };
}

export function sanitizePlan(v: unknown): WsPlan | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const h = (o.hook ?? {}) as Record<string, unknown>;
  const shots = (Array.isArray(o.shots) ? o.shots : []).flatMap((s) => {
    const x = (s ?? {}) as Record<string, unknown>;
    const film = str(x.film, 240);
    return film ? [{ from: num(x.from, 0, 120, 0), to: num(x.to, 0, 120, 0), film, angle: str(x.angle, 80), move: str(x.move, 80), say: str(x.say, 240), text: str(x.text, 80), edit: str(x.edit, 160) }] : [];
  }).slice(0, 14);
  const title = str(o.title, 80);
  if (!title || !shots.length) return null;
  return {
    title, objective: str(o.objective, 200), audience: str(o.audience, 160), seconds: num(o.seconds, 6, 90, 30), platform: str(o.platform, 30) || "Instagram",
    format: str(o.format, 30) || "Reel", direction: str(o.direction, 80),
    hook: { visual: str(h.visual, 240), say: str(h.say, 200), text: str(h.text, 80), sound: str(h.sound, 120) },
    script: str(o.script, 1500), shots, editing: str(o.editing, 800), music: str(o.music, 300), voiceover: str(o.voiceover, 300),
    caption: str(o.caption, 1200), hashtags: list(o.hashtags, 5, 40).map((t) => (t.startsWith("#") ? t : `#${t}`).replace(/\s+/g, "")),
    cta: str(o.cta, 160), postTime: str(o.postTime, 120),
  };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * The plan as the video editor's prompt: what to make, the opening, each shot in order, how to cut it and the sound.
 * Never the reference's link, numbers or caption: the reference itself travels in the editor's reference slot.
 */
export function editorPromptOf(p: WsPlan): string {
  const parts = [
    `Make my ${p.format.toLowerCase()}, about ${Math.round(p.seconds)} seconds: "${p.title}". ${p.direction ? `Direction: ${p.direction}.` : ""}`.trim(),
    [p.hook.visual && `Open on: ${p.hook.visual}`, p.hook.text && `On screen first: "${p.hook.text}"`, p.hook.say && `First words: "${p.hook.say}"`].filter(Boolean).join(" "),
    `Shots in order:\n${p.shots.map((s) => `- ${clock(s.from)} to ${clock(s.to)}: ${s.film}${s.text ? ` On screen: "${s.text}".` : ""}${s.edit ? ` Edit: ${s.edit}` : ""}`).join("\n")}`,
    p.script && `The words, as written:\n${p.script}`,
    p.editing && `How to edit it: ${p.editing}`,
    p.music && `Music: ${p.music}`,
    "Use my clips for each shot; where a shot has no clip, keep going without it.",
  ].filter(Boolean);
  return cutClean(parts.join("\n"), PROMPT_MAX);
}

/** The plan as a copyable filming brief. */
export function briefText(p: WsPlan): string {
  return [
    `${p.title} (${p.format}, about ${Math.round(p.seconds)} s, ${p.platform})`,
    p.objective && `Goal: ${p.objective}`,
    `Hook: ${[p.hook.visual, p.hook.text && `text "${p.hook.text}"`, p.hook.say && `say "${p.hook.say}"`].filter(Boolean).join("; ")}`,
    p.script && `Script:\n${p.script}`,
    `Shots:\n${p.shots.map((s) => `${clock(s.from)}-${clock(s.to)} ${s.film}${s.angle ? ` [${s.angle}${s.move ? `, ${s.move}` : ""}]` : ""}${s.say ? ` Say: "${s.say}"` : ""}${s.text ? ` Text: "${s.text}"` : ""}`).join("\n")}`,
    p.editing && `Editing: ${p.editing}`,
    p.caption && `Caption:\n${p.caption}${p.hashtags.length ? `\n${p.hashtags.join(" ")}` : ""}`,
  ].filter(Boolean).join("\n\n");
}

/** The plan as one post of the weekly plan, on the day chosen (lib/planItems.ts sanitizes it on save). */
export function planItemOf(p: WsPlan, day: string): Record<string, unknown> {
  return {
    day, concept: p.objective ? `${p.title}. ${p.objective}` : p.title, hook: p.hook.say || p.hook.text || p.hook.visual, format: p.format,
    rationale: p.direction ? `Your own idea, made as: ${p.direction}.` : "Your own idea.", evidence: "Researched in Help me make a video.", predictedPerformance: "Your idea",
    title: p.title, audience: p.audience, platform: p.platform, direction: p.editing, cta: p.cta, editing: p.editing,
    beats: p.shots.map((s) => ({ label: s.film.split(/[.,]/)[0].slice(0, 40), from: s.from, to: s.to, show: s.film, ...(s.say || s.text ? { say: s.say || s.text } : {}) })),
    source: "own",
  };
}
