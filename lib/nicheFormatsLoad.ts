// Server side of winning formats (lib/nicheFormats.ts): read the brand's
// stored, permitted examples, ask the model once to group them, keep only
// what the examples support, and cache the result per brand in niche_trends
// until a newer research run. Server only.

import type { Ctx } from "./context";
import { brandWorkspace, nicheScopeId } from "./context";
import { competitorScopeId } from "./workspaces";
import { listTracked } from "./trackedCompetitors";
import { igCompetitorRows } from "./igCompetitorData";
import { isOwnAccount, ownAccounts } from "./ownAccounts";
import { videoDurations, youtubeVideoId, ytConfigured } from "./youtube";
import { getProfile } from "./profile";
import { growthLines } from "./growth";
import { anthropic, FAST_MODEL, effortFor } from "./anthropic";
import { recordAiUsage } from "./aiUsage";
import { buildFormats, examplesFrom, formatsKey, type FormatExample, type FormatsDoc, type RawFormat } from "./nicheFormats";

export const formatsSchema = {
  type: "object", additionalProperties: false,
  properties: {
    formats: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string" }, summary: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          hooks: { type: "array", items: { type: "string" } },
          filming: { type: "array", items: { type: "string" } },
          length: { type: "string" },
          adaptations: { type: "array", items: { type: "string" } },
          example_ids: { type: "array", items: { type: "integer" } },
        },
        required: ["name", "summary", "steps", "hooks", "filming", "length", "adaptations", "example_ids"],
      },
    },
  },
  required: ["formats"],
} as const;

const SYSTEM = `You are SOCIA, the intelligence layer of a social-media strategy product. You are given real public posts from accounts in one person's niche: their titles or captions, platform and creator. Group them into repeatable content formats the person could make.
Rules:
- A format is a structure someone can film again (for example "a dish made start to finish in one take", "staff answering a customer question"), not a topic or a single post. Name it in plain words, at most six words.
- Each format cites the posts it is based on in example_ids, using the ids given. Only cite posts whose title or caption shows that structure. A format needs at least three posts from at least two different creators; leave out anything weaker. Return at most six formats, and no format when nothing repeats.
- summary: one or two sentences on what the format is. Never claim it performs well, never give numbers, never mention algorithms: SOCIA measures performance separately.
- steps: the format's beats in order, 3 to 5 short lines.
- hooks: 2 to 4 opening-line patterns abstracted from the examples, in the person's voice, never a creator's words copied.
- filming: 2 to 4 practical notes for filming it with what they have.
- length: a suggested length range in seconds for this kind of video.
- adaptations: 1 to 3 concrete ideas for the person's own account, using their niche and profile. Original versions, never copies of a creator's video.
- Plain text, sentence case, no markdown, no em dashes.`;

/** The brand's permitted examples: YouTube results from the last research run, and Instagram posts read through Business Discovery. */
export async function loadExamples(ctx: Ctx, now: Date): Promise<{ examples: FormatExample[]; runAt: string | null }> {
  const cwid = await competitorScopeId(ctx.client, ctx.workspace?.id);
  const scoped = <T>(q: T): T => (cwid ? ((q as unknown as { eq: (c: string, v: string) => T }).eq("workspace_id", cwid)) : q);
  const [contentRes, runRes, tracked, accountsRes, mine] = await Promise.all([
    scoped(ctx.client.from("discovered_content")
      .select("content_url, platform, account_name, account_handle, title, thumbnail_url, views, likes, comments, published_at, multiplier, data_source")
      .eq("user_id", ctx.ownerId)).limit(200).then((r: { data: unknown }) => r, () => ({ data: [] })),
    scoped(ctx.client.from("discovery_runs").select("ran_at").eq("user_id", ctx.ownerId)).maybeSingle().then((r: { data: unknown }) => r, () => ({ data: null })),
    listTracked<{ platform: string; handle: string }>(ctx.client, ctx.ownerId, "platform, handle", { workspaceId: cwid }).catch(() => []),
    scoped(ctx.client.from("discovered_accounts").select("platform, handle").eq("user_id", ctx.ownerId)).limit(40).then((r: { data: unknown }) => r, () => ({ data: [] })),
    ownAccounts(ctx.client, ctx.ownerId).catch(() => null),
  ]);
  const content = (contentRes.data ?? []) as Record<string, unknown>[];
  const accounts = (accountsRes.data ?? []) as { platform: string; handle: string | null }[];
  const igHandles = [
    ...tracked.filter((t) => t.platform === "instagram").map((t) => t.handle),
    ...accounts.filter((a) => a.platform === "instagram" && a.handle).map((a) => a.handle!),
  ].slice(0, 8);
  // Cached Business Discovery reads (6 h); a stale one is refreshed the way the Discover page does.
  const ig = igHandles.length ? await igCompetitorRows(ctx.client, ctx.ownerId, igHandles).catch(() => ({ competitors: [] })) : { competitors: [] };
  const ytIds = content.map((r) => (typeof r.content_url === "string" ? youtubeVideoId(r.content_url) : null)).filter((x): x is string => Boolean(x));
  const durations = ytIds.length && ytConfigured() ? await videoDurations(ytIds.slice(0, 100)).catch(() => new Map<string, number>()) : new Map<string, number>();
  const examples = examplesFrom({
    content, instagram: ig.competitors, durations, now,
    isOwn: (h) => (mine ? isOwnAccount(mine, { handle: h.replace(/^@/, ""), name: h }) : false),
  });
  return { examples, runAt: ((runRes.data as { ran_at?: string } | null)?.ran_at) ?? null };
}

/** One model call over the examples; the result is checked against them before it is kept. */
export async function buildFormatsDoc(ctx: Ctx, examples: FormatExample[], runAt: string | null, now: Date): Promise<FormatsDoc> {
  const base = { v: 1 as const, builtAt: now.toISOString(), runAt, examplesRead: examples.length, fromYouTube: examples.filter((e) => e.platform === "youtube").length, fromInstagram: examples.filter((e) => e.platform === "instagram").length };
  if (examples.length < 3) return { ...base, formats: [], unassigned: examples.length };

  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const who = [
    `Niche: ${profile?.niche ?? "not set"}${profile?.brand_name ? `; account: ${profile.brand_name}` : ""}${profile?.brand_detail?.location ? `; based in ${profile.brand_detail.location}` : ""}.`,
    ...growthLines(profile?.brand_detail?.growth),
  ].join("\n");
  const list = examples.map((e) => `[${e.id}] ${e.platform === "youtube" ? "YouTube" : "Instagram"}, ${e.account}: ${e.title.replace(/\s+/g, " ")}`).join("\n");
  const res = await anthropic.messages.create({
    model: FAST_MODEL, max_tokens: 4000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: formatsSchema }, ...effortFor(FAST_MODEL, "medium") },
    messages: [{ role: "user", content: `# The person\n${who}\n\n# Posts in their niche\n${list}\n\nGroup these into repeatable formats.` }],
  } as never) as unknown as { content: { type: string; text?: string }[] };
  recordAiUsage(ctx.ownerId, "niche_formats", res);
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as { formats?: RawFormat[] };
  const { formats, unassigned } = buildFormats(parsed.formats ?? [], examples);
  return { ...base, formats, unassigned };
}

export async function readFormatsDoc(ctx: Ctx): Promise<{ doc: FormatsDoc | null; updatedAt: string | null }> {
  try {
    const { data } = await ctx.client.from("niche_trends").select("data, updated_at").eq("niche", formatsKey(nicheScopeId(ctx))).maybeSingle();
    const doc = data?.data as FormatsDoc | undefined;
    return { doc: doc?.v === 1 ? doc : null, updatedAt: (data?.updated_at as string | undefined) ?? null };
  } catch {
    return { doc: null, updatedAt: null };
  }
}

export async function saveFormatsDoc(ctx: Ctx, doc: FormatsDoc): Promise<void> {
  await ctx.client.from("niche_trends").upsert({ niche: formatsKey(nicheScopeId(ctx)), data: doc, updated_at: doc.builtAt }, { onConflict: "niche" });
}
