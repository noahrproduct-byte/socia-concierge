// The creative brief's shape and its pure helpers (lib/generation/brief.ts
// writes it): browser-safe, so the AI Studio page can tidy and rebuild a brief
// without loading the Claude client.
import type { GenerationKind } from "@/lib/credits/config";

export type BriefShot = { shot: string; seconds: number; how: string };

export type CreativeBrief = {
  concept: string;
  hook: string;
  openingShot: string;
  buildUp: string;
  payoff: string;
  cta: string;
  /** Seconds for the finished post. An AI clip is cut to the model's lengths when made. */
  durationSec: number;
  kind: GenerationKind;
  onScreenText: string[];
  /** What is said, when the post has a voice; "" when it doesn't. */
  script: string;
  checklist: string[];
  shots: BriefShot[];
  /** For the generator: subject, setting, light, camera, motion; no text in frame. */
  prompt: string;
  caption: string;
};

export const BRIEF_FORMAT = "9:16 vertical, for Reels, TikTok and Shorts";

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, n) : "");
const list = (v: unknown, max: number, n: number) => (Array.isArray(v) ? v.map((x) => clean(x, n)).filter(Boolean).slice(0, max) : []);

/** The model's answer as a brief: trimmed, capped, every field present. Null when the core beats are missing. Pure. */
export function cleanBrief(raw: unknown, fallbackKind: GenerationKind): CreativeBrief | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const b: CreativeBrief = {
    concept: clean(r.concept, 300), hook: clean(r.hook, 120),
    openingShot: clean(r.openingShot, 400), buildUp: clean(r.buildUp, 400), payoff: clean(r.payoff, 400), cta: clean(r.cta, 160),
    durationSec: Math.min(30, Math.max(5, Math.round(Number(r.durationSec) || 15))),
    kind: r.kind === "text_to_image" ? "text_to_image" : r.kind === "text_to_video" ? "text_to_video" : fallbackKind,
    onScreenText: list(r.onScreenText, 3, 120),
    script: clean(r.script, 900),
    checklist: list(r.checklist, 6, 160),
    shots: (Array.isArray(r.shots) ? r.shots : []).slice(0, 6).map((s) => {
      const x = (s ?? {}) as Record<string, unknown>;
      return { shot: clean(x.shot, 200), seconds: Math.min(15, Math.max(1, Math.round(Number(x.seconds) || 3))), how: clean(x.how, 300) };
    }).filter((s) => s.shot),
    prompt: clean(r.prompt, 1200),
    caption: typeof r.caption === "string" ? r.caption.trim().slice(0, 2200) : "",
  };
  if (!b.hook || !b.openingShot || !b.payoff) return null;
  if (!b.prompt) b.prompt = promptFromBrief(b);
  return b;
}

/**
 * The generator prompt rebuilt from the brief's visual beats, after the person
 * edits them: no AI call, so editing never costs anything. Pure.
 */
export function promptFromBrief(b: Pick<CreativeBrief, "openingShot" | "buildUp" | "payoff" | "kind">): string {
  const beats = [b.openingShot, b.buildUp, b.payoff].map((x) => x.trim().replace(/[.\s]+$/, "")).filter(Boolean);
  const tail = b.kind === "text_to_image"
    ? "A single still, vertical 9:16, natural light, shallow depth of field, no text or logos in the frame."
    : "Vertical 9:16, natural light, smooth handheld camera, realistic motion, no text or logos in the frame.";
  return `${beats.join(". Then ")}. ${tail}`.slice(0, 1200);
}
