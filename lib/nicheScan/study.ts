// The model calls of the niche scan: studying a batch of Reels from what can
// legally be read (each Reel's cover image, caption and published numbers),
// and writing the text and hook templates from what the studies found. Both
// answers are checked against the Reels before anything is kept
// (lib/nicheScan/playbook.ts). Server only.

import { anthropic, FAST_MODEL, MODEL, effortFor } from "../anthropic";
import { recordAiUsage } from "../aiUsage";
import { cleanWatched, keepTemplates, REEL_FORMATS, CTA_KINDS, type RawTemplate, type TextTemplate, type WatchedReel } from "./playbook";
import type { ScanReel } from "./plan";
import { reelFrames } from "./frames";

/** Hosts a Reel cover may come from: Instagram's and YouTube's own image CDNs. */
const IMAGE_HOSTS = [/(^|\.)cdninstagram\.com$/, /(^|\.)fbcdn\.net$/, /^i\d?\.ytimg\.com$/, /(^|\.)ggpht\.com$/];
const MAX_IMAGE_BYTES = 3_000_000;

/** A cover image as base64, or null when it isn't from a platform CDN, is too big or can't be read in time. */
export async function coverImage(url: string | null): Promise<{ media_type: "image/jpeg" | "image/png" | "image/webp"; data: string } | null> {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !IMAGE_HOSTS.some((re) => re.test(u.hostname))) return null;
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const media = type === "image/png" ? "image/png" : type === "image/webp" ? "image/webp" : type === "image/jpeg" || type === "image/jpg" ? "image/jpeg" : null;
    if (!media) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
    return { media_type: media, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

const watchSchema = {
  type: "object", additionalProperties: false,
  properties: {
    reels: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string" },
          format: { type: "string", enum: [...REEL_FORMATS] },
          on_screen_text: { type: "string" },
          hook: { type: "string" },
          cta_kind: { type: "string", enum: [...CTA_KINDS] },
          cta_text: { type: "string" },
          text_style: { type: "string" },
          framing: { type: "string" },
        },
        required: ["id", "format", "on_screen_text", "hook", "cta_kind", "cta_text", "text_style", "framing"],
      },
    },
  },
  required: ["reels"],
} as const;

const WATCH_SYSTEM = `You study short-form videos (Instagram Reels and YouTube Shorts) from one niche so a small business can learn what works. For each video you get its cover image when there is one, up to three frames from inside the video when they could be read, its caption or title, and the numbers its platform published. Describe only what you can see or read; never guess numbers.
For each video return:
- format: the structure, one of the given values. one_action = one satisfying action shown whole (a cheese pull, a slice lifted); process = the making step by step; pov = a point-of-view moment; share_bait = the text asks viewers to send it to someone; tag_a_friend = asks viewers to tag someone; experiment = rounds or a test; list = a list or ranking; reaction = a first bite or reaction; before_after; talking = someone talking to camera; behind_the_scenes; taste_test; comparison; other.
- on_screen_text: the words written on screen, on the cover or in the frames, exactly as written (keep the person's wording, fix nothing); when the cover and the frames show different lines, the line that carries the hook or the ask; "" when no text is readable or there is no image.
- hook: the opening line, from the on-screen text, else the caption's first line, "" when neither has one.
- cta_kind and cta_text: the ask, from the on-screen text (cover or frames) or caption ("send this to someone you'd eat this with" = send_to; "tag a friend" = tag; "comment PIZZA for the recipe" = comment_for; follow; visit = come in, order, book; save; none). cta_text is the ask as written, "" for none.
- text_style: how the on-screen text looks in a few words (for example "white bold sans, black outline, top third"), "" without visible text.
- framing: how the shot is framed in a few words (for example "overhead, tight on the food"), "" without an image.
Plain text, no em dashes.`;

/** Study one batch of Reels; every Reel in the batch comes back, as "other" when the model skipped it. */
export async function studyBatch(ownerId: string, niche: string | null, batch: ScanReel[]): Promise<WatchedReel[]> {
  const [images, frames] = await Promise.all([
    Promise.all(batch.map((r) => coverImage(r.thumb))),
    // Frames inside the video catch the lines that land after the cover (2026-11-12, Noah: "build it").
    Promise.all(batch.map((r) => reelFrames(r).catch(() => []))),
  ]);
  type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
  const content: Block[] = [{ type: "text", text: `Niche: ${niche ?? "not set"}. ${batch.length} videos follow.` }];
  batch.forEach((r, i) => {
    const nums = [
      r.views != null ? `${r.views} views` : null, r.likes != null ? `${r.likes} likes` : null, r.comments != null ? `${r.comments} comments` : null,
      r.multiplier != null ? `${r.multiplier}× the account's usual (${r.basis})` : null,
    ].filter(Boolean).join(", ");
    content.push({ type: "text", text: `[${r.id}] ${r.platform === "youtube" ? "YouTube Short" : "Instagram Reel"} by ${r.account}${nums ? `; ${nums}` : ""}.\nCaption: ${r.caption ?? "(none)"}\n${images[i] ? "Cover image:" : "No cover image."}` });
    if (images[i]) content.push({ type: "image", source: { type: "base64", media_type: images[i]!.media_type, data: images[i]!.data } });
    for (const f of frames[i]) {
      content.push({ type: "text", text: `[${r.id}] frame ${f.at}:` });
      content.push({ type: "image", source: { type: "base64", media_type: f.media_type, data: f.data } });
    }
  });
  const res = await anthropic.messages.create({
    model: FAST_MODEL, max_tokens: 3500, system: WATCH_SYSTEM,
    output_config: { format: { type: "json_schema", schema: watchSchema }, ...effortFor(FAST_MODEL, "medium") },
    messages: [{ role: "user", content }],
  } as never) as unknown as { content: { type: string; text?: string }[] };
  recordAiUsage(ownerId, "niche_scan", res);
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as { reels?: Record<string, unknown>[] };
    rows = Array.isArray(parsed.reels) ? parsed.reels : [];
  } catch {
    rows = [];
  }
  const byId = new Map(rows.filter((r) => typeof r.id === "string").map((r) => [r.id as string, r]));
  return batch.map((r, i) => cleanWatched(r, byId.get(r.id) ?? null, frames[i].length ? "frames" : images[i] ? "cover" : "caption"));
}

const templateSchema = {
  type: "object", additionalProperties: false,
  properties: {
    texts: { type: "array", items: { type: "object", additionalProperties: false, properties: { template: { type: "string" }, reel_ids: { type: "array", items: { type: "string" } } }, required: ["template", "reel_ids"] } },
    hooks: { type: "array", items: { type: "object", additionalProperties: false, properties: { template: { type: "string" }, reel_ids: { type: "array", items: { type: "string" } } }, required: ["template", "reel_ids"] } },
  },
  required: ["texts", "hooks"],
} as const;

const TEMPLATE_SYSTEM = `You turn the on-screen text and opening lines of videos that took off in one niche into reusable templates for a small business in that niche.
Rules:
- A template keeps the shape of the real lines and puts "___" where the specific thing goes (for example from "send this to someone you'd eat this with" and "send this to the person who owes you a slice": "send this to someone you'd ___ with").
- Every template cites the ids of the videos whose line has that shape in reel_ids. Only cite a video when its own line really has that shape. A template needs at least two videos from at least two different accounts; leave out anything weaker.
- texts are built from the on-screen text; hooks from the opening lines. At most six of each. Nothing when nothing repeats.
- Never add a claim, number or promise the lines don't have. Plain text, lowercase unless the lines use capitals, no em dashes.`;

/** The text and hook templates the studied Reels support (checked by keepTemplates). */
export async function writeTemplates(ownerId: string, niche: string | null, watched: WatchedReel[]): Promise<{ texts: TextTemplate[]; hooks: TextTemplate[] }> {
  const good = watched.filter((w) => !w.weak && (w.onScreenText || w.hook));
  if (good.length < 2) return { texts: [], hooks: [] };
  const list = good.map((w) => `[${w.id}] ${w.handle ? `@${w.handle}` : w.account}${w.multiplier != null ? `, ${w.multiplier}× usual` : ""}\n  on-screen: ${w.onScreenText ?? "(none)"}\n  opening line: ${w.hook ?? "(none)"}`).join("\n");
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 2500, system: TEMPLATE_SYSTEM,
    output_config: { format: { type: "json_schema", schema: templateSchema }, ...effortFor(MODEL, "medium") },
    messages: [{ role: "user", content: `Niche: ${niche ?? "not set"}.\n\nVideos that took off:\n${list}` }],
  } as never) as unknown as { content: { type: string; text?: string }[] };
  recordAiUsage(ownerId, "niche_scan", res);
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  let parsed: { texts?: RawTemplate[]; hooks?: RawTemplate[] } = {};
  try { parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { parsed = {}; }
  return { texts: keepTemplates(parsed.texts ?? [], watched, "text"), hooks: keepTemplates(parsed.hooks ?? [], watched, "hook") };
}
