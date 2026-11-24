// What the video editor is told when a planned post is opened in it ("Yes,
// open the editor" on the Dashboard, "I filmed it. Open the editor" on the
// Planner): the post's own plan, written as the prompt a person would type,
// so they only drop their clips. Built from the plan's fields, never
// invented; a field the plan lacks is left out. Pure.
import type { Deliverable } from "./schema";
import { cutClean, wholeSentences } from "./cutClean";
import { PROMPT_MAX } from "./studioClips/reference";

type PlanPost = Deliverable["weeklyPlan"][number];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
/** A sentence ends with a stop, so the next part reads as its own. */
const stop = (t: string) => (t && !/[.!?:"'\u201d)]$/.test(t) ? `${t}.` : t);
const line = (t: string | null | undefined) => (t ? wholeSentences(t.replace(/\s+/g, " ").trim()) : "");

/** The planned post's title as the Planner shows it. */
export function planPostTitle(p: PlanPost): string {
  return line(p.title) || line(p.concept).split(/(?<=[.!?])\s/)[0] || `${p.day}'s video`;
}

/** The prompt for the editor: what the video is, how long, how it opens, each shot in order, how it ends and how to cut it. */
export function editorBrief(p: PlanPost): string {
  const beats = (p.beats ?? []).filter((b) => b && typeof b.show === "string" && b.show.trim());
  const seconds = beats.length ? Math.round(Math.max(...beats.map((b) => b.to))) : null;
  const parts = [
    `Make my planned ${p.format || "video"}${seconds ? `, about ${seconds} seconds` : ""}: "${planPostTitle(p)}".`,
    p.hook ? `It opens with: "${line(p.hook)}"` : "",
    beats.length
      ? `Shots in order:\n${beats.map((b) => `- ${clock(b.from)} to ${clock(b.to)}${b.label ? `, ${line(b.label)}` : ""}: ${stop(line(b.show))}${b.say ? ` Say or show: "${line(b.say)}"` : ""}`).join("\n")}`
      : line(p.concept) ? `What it shows: ${line(p.concept)}` : "",
    p.cta ? `End with: ${line(p.cta)}` : "",
    p.editing ? `How to edit it: ${line(p.editing)}` : "",
    "Use my clips for each shot; where a shot has no clip, keep going without it.",
  ].filter(Boolean);
  return cutClean(parts.join("\n"), PROMPT_MAX);
}
