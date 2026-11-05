// Whether what a YouTube keyword search returned is really in the brand's
// niche. The search matches words, not meaning: "climbing app" brings back a
// panda climbing a tree, a Roblox tower and the biggest channels that ever
// used the word. Before any of it is stored, a model reads each channel and
// video against the brand's niche and keeps only the ones a business or
// creator in that niche would study. It judges relevance only: every number
// stays the platform's own. Server only.
//
// It fails closed: when the check cannot run, nothing unchecked is kept.

import { anthropic, FAST_MODEL, effortFor } from "./anthropic";
import { recordAiUsage } from "./aiUsage";

export type NicheCheckItem = {
  /** Its position in the list, as the model cites it. */
  id: string;
  kind: "channel" | "video";
  /** The channel's name (for a video, the channel that posted it). */
  name: string;
  /** A video's title, or a channel's own description. */
  text: string | null;
};

const SYSTEM = `You decide which YouTube channels and videos belong to one brand's niche. A keyword search found them, and keyword searches match words, not meaning.
Keep an item only when it is made by a business or creator in this niche, for this brand's kind of audience, about the niche's own subject: the kind of account or video this brand would study and could make its own version of.
Leave out everything else, including: a different meaning of the same word (a game, an animal, a toy, a home design), news and TV channels, film and series trailers, compilations and meme channels, general entertainment or gaming channels that touched the subject once, and content in a language the brand's audience does not use.
When an item gives too little to tell, leave it out.
Return the ids of the items to keep, and nothing else.`;

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { keep: { type: "array", items: { type: "string" } } },
  required: ["keep"],
} as const;

const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** The list the model reads: one line per item, with its id. */
export function nicheCheckPrompt(facts: string, items: NicheCheckItem[]): string {
  const lines = items.map((i) => `${i.id} | ${i.kind} | ${clip(i.name, 80) || "(no name)"}${i.text ? ` | ${clip(i.text, 200)}` : ""}`);
  return `# The brand\n${facts}\n\n# What the search found\n${lines.join("\n")}`;
}

/** The ids the model kept, limited to ids that were actually listed. */
export function parseNicheVerdict(text: string, items: NicheCheckItem[]): Set<string> {
  const listed = new Set(items.map((i) => i.id));
  let keep: unknown = null;
  try {
    keep = (JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as { keep?: unknown }).keep;
  } catch {
    keep = null;
  }
  return new Set((Array.isArray(keep) ? keep : []).filter((v): v is string => typeof v === "string" && listed.has(v)));
}

/**
 * The ids of the items that are in the niche, or null when the check could not
 * run (no key, the model failed or refused): the caller then keeps none.
 */
export async function checkNiche(ownerId: string, facts: string, items: NicheCheckItem[]): Promise<Set<string> | null> {
  if (!items.length) return new Set();
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await anthropic.messages.create({
      model: FAST_MODEL, max_tokens: 2000, system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(FAST_MODEL) },
      messages: [{ role: "user", content: nicheCheckPrompt(facts, items) }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    recordAiUsage(ownerId, "competitor_research", res);
    if (res.stop_reason === "refusal") return null;
    const block = res.content.find((b) => b.type === "text");
    return parseNicheVerdict(block && "text" in block ? block.text : "", items);
  } catch {
    return null;
  }
}
