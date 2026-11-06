// Instagram captions and hashtags for finished clips, in the brand's voice,
// one Claude call per job. Without an Anthropic key the clip's title stands
// in and the UI says so. Server only.
import { anthropic, FAST_MODEL } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { brandContext } from "@/lib/prompt";
import type { Profile } from "@/lib/profile";

export type ClipCaption = { caption: string; hashtags: string[] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["captions"],
  properties: {
    captions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "caption", "hashtags"],
        properties: {
          index: { type: "integer" },
          caption: { type: "string" },
          // The cap of 5 is applied below: structured outputs refuse maxItems.
          hashtags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export const brandLine = (profile: Profile | null | undefined): string =>
  [
    `Account: ${profile?.niche ?? "niche not set"}${profile?.brand_name ? ` (${profile.brand_name})` : ""}${profile?.goals ? `; goal: ${profile.goals}` : ""}.`,
    brandContext(profile?.brand_detail) || "",
  ].filter(Boolean).join("\n");

export const cleanTag = (t: string): string => t.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 40);

/** Captions for each clip, in order. Falls back to the titles when AI is not available. */
export async function writeClipCaptions(ownerId: string, brand: string, clips: { title: string | null; transcript: string | null }[]): Promise<ClipCaption[]> {
  const fallback = clips.map((c) => ({ caption: (c.title ?? "").slice(0, 2200), hashtags: [] as string[] }));
  if (!process.env.ANTHROPIC_API_KEY || !clips.length) return fallback;
  const list = clips.map((c, i) => `${i}. Title: ${c.title ?? "(none)"}\n   Transcript: ${(c.transcript ?? "").slice(0, 900)}`).join("\n");
  try {
    const res = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 4000,
      system: `You write Instagram captions for short clips cut from a longer video, in the brand's own voice. One or two plain sentences that say what the clip shows or the point it makes, written the way the person would type it, then 3 to 5 hashtags without the # sign. Sentence case, no marketing words, no emoji, no em dashes, no claims that are not in the transcript.`,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `${brand}\n\n# Clips\n${list}\n\nWrite one caption per clip, index matching.` }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    recordAiUsage(ownerId, "clipper_captions", res);
    const block = res.content.find((b: { type: string }) => b.type === "text");
    const text = block && "text" in block ? (block as { text: string }).text : "";
    const raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as { captions?: { index: number; caption: string; hashtags: string[] }[] };
    const out = [...fallback];
    for (const c of raw.captions ?? []) {
      if (typeof c.index !== "number" || !out[c.index]) continue;
      out[c.index] = { caption: String(c.caption ?? "").slice(0, 2200), hashtags: (c.hashtags ?? []).map(cleanTag).filter(Boolean).slice(0, 5) };
    }
    return out;
  } catch (e) {
    console.error("[clipper] captions failed:", (e as Error)?.message ?? e);
    return fallback;
  }
}
