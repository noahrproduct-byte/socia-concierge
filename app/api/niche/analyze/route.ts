import { NextResponse } from "next/server";
import { anthropic, MODEL, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";
import { videoDurationSec, youtubeVideoId, ytConfigured } from "@/lib/youtube";
import type { NichePost } from "@/lib/nicheTrends";
import { requireFeature } from "@/lib/planGuard";
import { resolveContext } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Analysis of one niche post for the drawer. Two halves that never mix:
//   observed   the row SOCIA stored (public counts, date, baseline) plus the
//              video length read from YouTube on demand
//   read       what SOCIA can see in the real thumbnail and title, labelled
//              as a reading; then an interpretation, at most three lessons
//              and one concept for the user's own account
// Cached per workspace owner and post for a week in the shared niche_trends
// cache (the key carries the owner's id, so a guest reads through the service
// client). A "refresh" re-reads the post at most once an hour: the cache is the
// only thing between a button and an unbounded number of model calls.

const TTL_MS = 7 * 86400000;
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

export type PostAnalysis = {
  structure: {
    first_frame_subject: string; hook: string; people_visible: string; product_visible: string;
    location_reference: string; cta: string; on_screen_text: string;
  };
  interpretation: string;
  lessons: string[];
  your_version: string;
};

export type AnalyzeResponse = { durationSec: number | null; analysis: PostAnalysis | null; error?: string; kind?: string; cached: boolean };

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    structure: {
      type: "object", additionalProperties: false,
      properties: {
        first_frame_subject: { type: "string" }, hook: { type: "string" }, people_visible: { type: "string" },
        product_visible: { type: "string" }, location_reference: { type: "string" }, cta: { type: "string" }, on_screen_text: { type: "string" },
      },
      required: ["first_frame_subject", "hook", "people_visible", "product_visible", "location_reference", "cta", "on_screen_text"],
    },
    interpretation: { type: "string" },
    lessons: { type: "array", items: { type: "string" } },
    your_version: { type: "string" },
  },
  required: ["structure", "interpretation", "lessons", "your_version"],
} as const;

const fmt = (n: number | null) => (n == null ? "not published" : n.toLocaleString("en-US"));

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  let body: { post?: NichePost; refresh?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const post = body.post;
  if (!post?.url) return NextResponse.json({ error: "No post given." }, { status: 400 });

  const key = `analysis:${ctx.ownerId}:${post.url}`.slice(0, 900);
  try {
    const { data } = await ctx.client.from("niche_trends").select("data, updated_at").eq("niche", key).maybeSingle();
    const doc = data?.data as AnalyzeResponse | undefined;
    const ageMs = data?.updated_at ? Date.now() - new Date(data.updated_at).getTime() : Infinity;
    // Serve the cached reading unless it expired, or a refresh was asked for AND the cooldown has passed.
    if (doc?.analysis && ageMs < TTL_MS && (!body.refresh || ageMs < REFRESH_COOLDOWN_MS)) {
      return NextResponse.json({ ...doc, cached: true });
    }
  } catch { /* no cache */ }

  // Video length is public and cheap to read; it is observed data, not a reading.
  let durationSec: number | null = null;
  const vid = post.platform === "youtube" ? youtubeVideoId(post.url) : null;
  if (vid && ytConfigured()) durationSec = await videoDurationSec(vid).catch(() => null);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ durationSec, analysis: null, error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key", cached: false } satisfies AnalyzeResponse, { status: 503 });
  }

  // Fresh readings are part of Niche intelligence on the workspace owner's
  // plan. The cache lookup above runs first on purpose, so a reading made on a
  // paid plan stays visible.
  const g = await requireFeature(ctx.client, ctx.ownerId, "niche_intelligence");
  if (g.denied) return g.denied;

  const profile = await getProfile(ctx.client, ctx.ownerId).catch(() => null);
  const observed = [
    `Platform: ${post.platform}${post.format ? ` (${post.format})` : ""}`,
    `Creator: ${post.accountName ?? "unknown"}`,
    `Title / caption: ${post.title ?? "(none)"}`,
    `Views ${fmt(post.views)}, likes ${fmt(post.likes)}, comments ${fmt(post.comments)}`,
    post.publishedAt ? `Published ${post.publishedAt.slice(0, 10)}` : "Publish date not available",
    post.multiplier != null ? `Performance: ${post.multiplier.toFixed(1)}× the creator's own median views across recent uploads` : "Creator baseline not available",
    durationSec != null ? `Length: ${durationSec}s` : "Length not available",
    post.tags.length ? `Features detected in the title: ${post.tags.join(", ")}` : "",
    post.why ? `Web-research note (interpretive): ${post.why}` : "",
  ].filter(Boolean).join("\n");
  const account = [
    `The user's account: ${profile?.niche ?? "niche not set"}${profile?.brand_name ? `, ${profile.brand_name}` : ""}${profile?.brand_detail?.location ? `, based in ${profile.brand_detail.location}` : ""}.`,
    profile?.goals ? `Their goal: ${profile.goals}.` : "",
    brandContext(profile?.brand_detail) || "",
  ].filter(Boolean).join("\n");

  const system = `You are SOCIA, the intelligence layer of a social-media strategy product. You are shown one real public post by another creator: its observed public data and, when available, its real thumbnail image.
Rules:
- structure: describe only what is visible in the thumbnail or stated in the title. When something cannot be seen, write "Not visible from the thumbnail". people_visible and product_visible are "Yes", "No" or "Unclear". location_reference is "Yes: <what>" or "None stated". on_screen_text is the text you can read in the image or "None visible".
- interpretation: two sentences at most on why this post plausibly worked, phrased as a reading ("likely", "suggests"), never as a measured fact. Never claim causation and never mention algorithms.
- lessons: at most 3, one sentence each, specific to the user's account and niche, each tied to something in the observed data or structure.
- your_version: one concrete concept (under 40 words) the user could film for their own business this week. No invented numbers, no promises of performance.
- Plain text, no markdown, no em dashes.`;

  const text = `# Observed data\n${observed}\n\n# ${account}\n\nAnalyse the post.`;
  type Block = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };
  const withImage: Block[] = post.thumb ? [{ type: "image", source: { type: "url", url: post.thumb } }, { type: "text", text }] : [{ type: "text", text }];

  const call = async (content: Block[]) => {
    const params = {
      model: MODEL, max_tokens: 1200, system,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    const block = res.content.find((b) => b.type === "text");
    return block && "text" in block ? (JSON.parse(block.text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as PostAnalysis) : null;
  };

  try {
    let analysis: PostAnalysis | null = null;
    try {
      analysis = await call(withImage);
    } catch (e) {
      // A thumbnail Anthropic cannot fetch must not sink the whole analysis.
      if (post.thumb && !/credit|rate|overloaded|api key|authentication/i.test(String((e as Error)?.message ?? ""))) analysis = await call([{ type: "text", text }]);
      else throw e;
    }
    if (analysis) analysis.lessons = (analysis.lessons ?? []).slice(0, 3);
    const doc: AnalyzeResponse = { durationSec, analysis, cached: false };
    try {
      await ctx.client.from("niche_trends").upsert({ niche: key, data: doc, updated_at: new Date().toISOString() }, { onConflict: "niche" });
    } catch { /* caching is best-effort */ }
    return NextResponse.json(doc);
  } catch (err) {
    const kind = aiFailureKind(err);
    return NextResponse.json({ durationSec, analysis: null, error: AI_UNAVAILABLE_COPY[kind], kind, cached: false } satisfies AnalyzeResponse, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
