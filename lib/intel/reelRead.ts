// SOCIA watching the account's own Reels (Noah, 2026-11-14: "it has to scan
// the reels from the Instagram page and see what the reels are about, how
// they're performing, what they look like"). The caption read
// (./understanding.ts) can't see a video; this one looks at each Reel's cover
// and a few frames from inside it, with its caption and its numbers, and says:
// what the account (and its product, if it has one) is about, the kinds of
// video it posts, what each kind looks like, and how each kind does. The
// numbers per kind are counted here, never by the model. The person confirms
// or changes all of it (components/brand/BrandRead.tsx) before plans use it.
import { anthropic, MODEL, effortFor } from "../anthropic";
import { recordAiUsage } from "../aiUsage";
import type { IgMediaItem } from "../instagramSync";

import { MADE, type Made, type VisualFormat, type VisualRead } from "./reelReadCore";
export { MADE, MADE_LABEL, type Made, type VisualFormat, type VisualRead } from "./reelReadCore";

type Media = IgMediaItem & { id: string };

const views = (m: IgMediaItem) => m.insights?.views ?? null;
const inter = (m: IgMediaItem) => (m.like_count ?? 0) + (m.comments_count ?? 0);
const isReel = (m: IgMediaItem) => m.media_product_type === "REELS" || m.media_type === "VIDEO";

/** Which Reels to watch: the best few by views (or interactions) and the most recent, up to `max`, own posts only. Pure. */
export function pickReels(media: IgMediaItem[], max = 10): Media[] {
  const own = media.filter((m): m is Media => Boolean(m.id) && !m.collab_owner && isReel(m));
  const score = (m: IgMediaItem) => views(m) ?? inter(m);
  const best = [...own].sort((a, b) => score(b) - score(a)).slice(0, Math.ceil(max / 2));
  const out = [...best];
  for (const m of own) {
    if (out.length >= max) break;
    if (!out.some((x) => x.id === m.id)) out.push(m);
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Each kind's numbers, counted from its Reels against the account's usual (the median of every Reel read). Pure. */
export function formatStats(ids: string[], media: IgMediaItem[]): Pick<VisualFormat, "avg" | "metric" | "multiple"> {
  const reels = media.filter((m) => m.id && isReel(m) && !m.collab_owner);
  const useViews = reels.length > 0 && reels.every((m) => views(m) != null);
  const val = (m: IgMediaItem) => (useViews ? (views(m) as number) : inter(m));
  const mine = reels.filter((m) => ids.includes(m.id!));
  if (!mine.length) return { avg: null, metric: useViews ? "views" : "interactions", multiple: null };
  const avg = Math.round(mine.reduce((n, m) => n + val(m), 0) / mine.length);
  const usual = median(reels.map(val));
  return { avg, metric: useViews ? "views" : "interactions", multiple: usual ? Math.round((avg / usual) * 10) / 10 : null };
}

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["about", "formats", "look", "limitations"],
  properties: {
    about: {
      type: "object", additionalProperties: false,
      required: ["value", "product", "confidence", "evidence"],
      properties: { value: { type: "string" }, product: { type: "string" }, confidence: { type: "integer" }, evidence: { type: "array", items: { type: "string" } } },
    },
    formats: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "made", "look", "reels"],
        properties: {
          name: { type: "string" },
          made: { type: "string", enum: [...MADE] },
          look: { type: "string" },
          reels: { type: "array", items: { type: "string" } },
        },
      },
    },
    look: { type: "string" },
    limitations: { type: "array", items: { type: "string" } },
  },
} as const;

export const REEL_READ_SYSTEM = `You watch one social media account's own Reels and say what they show. For each Reel you get its id, its caption, and images: its cover and frames from inside it. You never invent.

Answer with:
- about.value: what this account is, in one or two plain sentences a stranger would understand (for example "A pre-launch app for indoor climbers that scans a bouldering wall and suggests the moves that fit your body"). Read the bio, the captions and what the videos show. Never guess from the account's name alone: a word in a name can mean something else in the account's world.
- about.product: what it sells or makes, in a few words; "" when it sells nothing.
- about.confidence 0-100 and evidence: 1-3 short quotes or things seen in the videos that show it.
- formats: the 1-4 kinds of video the account posts, each a recurring look seen in at least two Reels. name: a short plain label ("Climber scenes", "Progress cards"). made: animated (drawn or motion graphics), filmed (real camera footage), screen (a phone or computer screen), photo (still photos), text (words on a plain background), mixed. look: one or two sentences on what it looks like: the scenes and characters, the colours, the type, where the logo sits, how the words appear. reels: the ids of the Reels of that kind, from the ids given.
- look: one sentence on what all the videos share (palette, type, logo, recurring characters); "" when they share nothing.
- limitations: what you could not tell (few Reels, frames missing, covers only).
Never state views, likes or results; those are counted elsewhere. Plain words, sentence case, no em dashes.`;

type Img = { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, n) : "");

/** The model's answer kept only where it holds up: known kinds, ids that were shown, two Reels or more per kind. Pure. */
export function normalizeVisual(raw: unknown, watched: Media[], media: IgMediaItem[], now: Date): VisualRead {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const a = (r.about && typeof r.about === "object" ? r.about : {}) as Record<string, unknown>;
  const known = new Set(watched.map((m) => m.id));
  const formats: VisualFormat[] = (Array.isArray(r.formats) ? r.formats : [])
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
    .map((f) => {
      const ids = [...new Set((Array.isArray(f.reels) ? f.reels : []).filter((x): x is string => typeof x === "string" && known.has(x)))];
      const made = (MADE as readonly string[]).includes(String(f.made)) ? (f.made as Made) : "mixed";
      const ex = watched.find((m) => m.id === ids[0]);
      return { name: str(f.name, 40), made, look: str(f.look, 320), ids, ...formatStats(ids, media), example: ex ? { permalink: ex.permalink ?? null, thumb: ex.thumbnail_url ?? null } : null };
    })
    .filter((f) => f.name && f.look && f.ids.length >= 2)
    .slice(0, 4);
  const value = str(a.value, 300);
  return {
    read_at: now.toISOString(),
    reels: watched.length,
    about: value ? { value, product: str(a.product, 80) || null, confidence: Math.max(0, Math.min(100, Math.round(Number(a.confidence) || 0))), evidence: (Array.isArray(a.evidence) ? a.evidence : []).map((x) => str(x, 160)).filter(Boolean).slice(0, 3) } : null,
    formats,
    look: str(r.look, 240) || null,
    limitations: (Array.isArray(r.limitations) ? r.limitations : []).map((x) => str(x, 160)).filter(Boolean).slice(0, 3),
  };
}

/**
 * Watch the account's Reels and say what they are about and what they look
 * like. Null when there are no Reels to watch or nothing usable came back;
 * the caption read still stands without it.
 */
export async function readOwnReels(opts: { ownerId: string; handle: string | null; bio: string | null; media: IgMediaItem[]; now?: Date }): Promise<VisualRead | null> {
  const watched = pickReels(opts.media);
  if (watched.length < 2) return null;
  // Imported here so the pure parts above stay free of server-only modules.
  const [{ reelFrames }, { coverImage }] = await Promise.all([import("../nicheScan/frames"), import("../nicheScan/study")]);
  const seen = await Promise.all(
    watched.map(async (m) => {
      const [cover, frames] = await Promise.all([
        coverImage(m.thumbnail_url ?? null).catch(() => null),
        reelFrames({ platform: "instagram", url: m.permalink ?? "", video: m.media_url ?? null }).catch(() => []),
      ]);
      // The cover and two frames from inside are enough to see the look without a large request.
      const imgs: Img[] = [cover, ...frames.slice(0, 2)].filter((x): x is Img => Boolean(x)).map((x) => ({ media_type: x.media_type, data: x.data }));
      return { m, imgs, frames: frames.length };
    }),
  );
  const shown = seen.filter((s) => s.imgs.length);
  if (shown.length < 2) return null;
  const content: unknown[] = [{ type: "text", text: `Account: ${opts.handle ? `@${opts.handle}` : "unknown"}\nBio: ${opts.bio?.trim() || "(none)"}\n\nThe Reels follow, each with its id and caption, then its images.` }];
  for (const s of shown) {
    content.push({ type: "text", text: `Reel ${s.m.id}: ${str(s.m.caption ?? "", 400) || "(no caption)"}` });
    for (const img of s.imgs) content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  }
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 3000, system: REEL_READ_SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "medium") },
    messages: [{ role: "user", content }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(opts.ownerId, "account_audit", res);
  const block = res.content.find((b: { type: string }) => b.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  if (!raw) return null;
  const read = normalizeVisual(raw, shown.map((s) => s.m), opts.media, opts.now ?? new Date());
  if (seen.every((s) => !s.frames)) read.limitations = ["Only the covers could be read, not frames from inside the videos.", ...read.limitations].slice(0, 3);
  return read.about || read.formats.length ? read : null;
}
