// The request Content ideas (components/plan/ContentIdeas.tsx) sends to Ask SOCIA for each choice,
// in the person's own words where they gave any. Pure.

export const IDEAS_MAX = 600;
export type IdeasMode = "idea" | "video";

/** The request sent for each choice, in the person's own words where they gave any. */
export function contentIdeasQuestion(mode: IdeasMode, text: string): string {
  const t = text.replace(/\s+/g, " ").trim().slice(0, IDEAS_MAX);
  if (mode === "idea") {
    return t
      ? `Give me one strong video idea for this week about ${t}. Base it on my own results, my competitors and what's working in my niche now, show the real videos it comes from, and tell me why it's worth testing.`
      : "Give me one strong video idea for this week. Base it on my own results, my competitors and what's working in my niche now, show the real videos it comes from, and tell me why it's worth testing.";
  }
  return `Help me make this video: ${t}. Find real short videos that did well with an idea like this, inside or outside my niche, and show me the directions I could take. Then write the hook, the script, the shots and the caption for the one I choose.`;
}

