// The eight things a starter strategy needs from the person (Noah's brief,
// 2026-11-18). Most are asked at onboarding already (Growth Profile, Creator
// Routine) and the creators they admire live on Discover; this says which are
// answered, with the answer, so nobody is asked twice. Pure and browser-safe.

import type { GrowthProfile } from "../growth";
import { MAIN_GOALS, ON_CAMERA, VIDEO_MAKERS } from "../growth";
import { CONTENT_FORMATS, NO_CAMERA_FORMATS, WEEKDAYS } from "../routine";

export type StarterQuestionId = "about" | "audience" | "goal" | "formats" | "style" | "post_days" | "filming" | "admired";

export type StarterQuestion = { id: StarterQuestionId; question: string; answer: string | null };

const label = (list: readonly { id: string; label: string }[], id: string | undefined) => list.find((o) => o.id === id)?.label ?? null;

/** How they like to appear: on camera, faceless or AI-made, from what they already said. */
export function styleAnswer(g: GrowthProfile | null | undefined): string | null {
  const parts: string[] = [];
  const cam = label(ON_CAMERA, g?.personality?.on_camera);
  if (cam) parts.push(`On camera: ${cam.toLowerCase()}`);
  const maker = label(VIDEO_MAKERS, g?.resources?.video_maker);
  if (maker && g?.resources?.video_maker !== "me") parts.push(maker);
  const fm = g?.routine?.formats ?? [];
  if (!parts.length && fm.length && fm.every((f) => NO_CAMERA_FORMATS.includes(f))) parts.push("Faceless or AI-generated videos");
  return parts.length ? parts.join("; ") : null;
}

export function starterQuestions(g: GrowthProfile | null | undefined, opts: { niche?: string | null; admired?: string[] } = {}): StarterQuestion[] {
  const r = g?.routine;
  const about = g?.focus ?? g?.niche_path?.specific ?? g?.business?.offer ?? g?.creator?.topics ?? null;
  const formats = (r?.formats ?? []).map((f) => (f === "other" && r?.formats_other ? r.formats_other : label(CONTENT_FORMATS, f))).filter(Boolean);
  const filming = (r?.filming ?? []).map((s) => WEEKDAYS.find((d) => d.id === s.day)?.name).filter(Boolean);
  return [
    { id: "about", question: "What is your account about?", answer: about },
    { id: "audience", question: "Who is your target audience?", answer: g?.audience?.who ?? null },
    { id: "goal", question: "What is your main growth goal?", answer: label(MAIN_GOALS, g?.main_goal) },
    { id: "formats", question: "What type of videos do you want to create?", answer: formats.length ? formats.join(", ") : null },
    { id: "style", question: "Do you prefer on-camera, faceless, or AI-generated content?", answer: styleAnswer(g) },
    { id: "post_days", question: "How many days per week can you post?", answer: r?.post_days ? `${r.post_days} ${r.post_days === 1 ? "day" : "days"} a week` : null },
    { id: "filming", question: "Which days are available for filming?", answer: filming.length ? filming.join(", ") : null },
    { id: "admired", question: "Are there creators or competitors whose content you admire?", answer: opts.admired?.length ? opts.admired.map((h) => `@${h.replace(/^@/, "")}`).join(", ") : null },
  ];
}

export const unanswered = (qs: StarterQuestion[]) => qs.filter((q) => !q.answer);
