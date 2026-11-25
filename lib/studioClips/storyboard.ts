// Storyboard first (components/studio/StoryboardReview.tsx): the person's mark on each shot of a planned cut,
// turned into one plain instruction for the editor's own "tell SOCIA what to change". Pure.
export type Mark = "keep" | "maybe" | "drop";

/** The person's marks as one plain instruction for the cut, or null when every shot is kept as it is. */
export function storyboardInstruction(marks: Mark[], notes: string[]): string | null {
  const drops = marks.flatMap((m, i) => (m === "drop" ? [i + 1] : []));
  const changes = marks.flatMap((m, i) => (m === "maybe" && notes[i]?.trim() ? [`Shot ${i + 1}: ${notes[i].trim().slice(0, 110)}.`] : []));
  const parts = [drops.length ? `Remove ${drops.length === 1 ? "shot" : "shots"} ${drops.join(", ")}.` : null, ...changes].filter(Boolean);
  return parts.length ? parts.join(" ").slice(0, 600) : null;
}

