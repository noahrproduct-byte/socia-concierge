import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/instagramSync";
import { NICHES } from "@/lib/niches";
import { requireUsage, recordEvent } from "@/lib/planGuard";
import { resolveContext, type Ctx } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 120;

// Reads the user's connected Instagram (profile + recent posts) and has the AI
// extract what SOCIA needs: a niche hierarchy (niche, sub-niche, content
// style, audience), an honest confidence score with the signals that support
// it, plus brand/goal/summary for onboarding. High-confidence results are
// saved automatically; ambiguous ones come back as candidates for the user to
// confirm. POST handles the manual paths: describing the niche in plain words
// or choosing one directly.

const SYSTEM = `You are SOCIA, an AI social media strategist. You are reading a creator's real Instagram profile and recent posts to work out their niche and set up their account.

Rules:
- Judge the niche from RECURRING PATTERNS in the actual post content. Content beats the bio: if the bio says "Entrepreneur" but the posts are pizza reviews, the niche is food.
- Never classify from a single post.
- signals: 3-6 short topic phrases that actually recur in the provided captions/bio. Only list things that are evidenced in the text you were given. Never invent topics.
- confidence: an honest 0-100 estimate. 85+ only when many posts clearly share one theme. 40-74 when the content points a few directions. Below 40 when you are mostly guessing.
- When confidence is below 75, provide 2-3 candidates (from the allowed niche list) with a one-line "why" each, most likely first. When confidence is 75+, candidates must be an empty array.
- sub_niche: a specific phrase like "Pizza / Italian food". content_style: how they create, like "Local food discovery Reels". audience: who it reaches, like "NYC food enthusiasts" — empty string if unclear.
- Never invent numbers. If the posts are too sparse to judge, say so plainly in the summary.`;

const extractionSchema = {
  type: "object",
  properties: {
    niche: { type: "string", enum: NICHES },
    sub_niche: { type: "string" },
    content_style: { type: "string" },
    audience: { type: "string" },
    confidence: { type: "integer" },
    signals: { type: "array", items: { type: "string" } },
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          niche: { type: "string", enum: NICHES },
          why: { type: "string" },
        },
        required: ["niche", "why"],
        additionalProperties: false,
      },
    },
    brand_name: { type: "string" },
    goal: { type: "string" },
    summary: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    best_format: { type: "string" },
  },
  required: [
    "niche",
    "sub_niche",
    "content_style",
    "audience",
    "confidence",
    "signals",
    "candidates",
    "brand_name",
    "goal",
    "summary",
    "highlights",
    "best_format",
  ],
  additionalProperties: false,
} as const;

export type Extracted = {
  niche: string;
  sub_niche: string;
  content_style: string;
  audience: string;
  confidence: number;
  signals: string[];
  candidates: { niche: string; why: string }[];
  brand_name: string;
  goal: string;
  summary: string;
  highlights: string[];
  best_format: string;
};

function parseJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
    if (s !== -1 && e > s) {
      try {
        return JSON.parse(cleaned.slice(s, e + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// Save the niche (and hierarchy detail where the columns exist) onto the
// workspace owner's profile. The detail columns are additive schema — fall
// back to the base row if they're missing.
async function saveNiche(
  supabase: Ctx["client"],
  userId: string,
  niche: string,
  detail: Record<string, unknown> | null,
  extras: Record<string, unknown> = {},
) {
  const base = {
    user_id: userId,
    niche,
    updated_at: new Date().toISOString(),
    ...extras,
  };
  const withDetail = {
    ...base,
    niche_detail: detail,
    niche_analyzed_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("profiles").upsert(withDetail, { onConflict: "user_id" });
  if (error) {
    await supabase.from("profiles").upsert(base, { onConflict: "user_id" });
  }
}

function detailOf(x: Extracted) {
  return {
    sub_niche: x.sub_niche || null,
    content_style: x.content_style || null,
    audience: x.audience || null,
    confidence: x.confidence,
    signals: x.signals,
    source: "auto" as const,
  };
}

type IgMedia = {
  caption?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // The connection read, the audit allowance and the saved niche all belong
  // to the active workspace owner. The token never leaves this function.
  const ctx = await resolveContext(supabase, user.id);

  // 1) Does the workspace have a live Instagram connection with a token?
  const conn = (await getActiveConnection(ctx.client, ctx.ownerId, "username, access_token")) as {
    username?: string;
    access_token?: string;
  } | null;

  if (!conn?.access_token) {
    return NextResponse.json({ connected: false });
  }

  // 2) Pull their real profile + recent media from Instagram.
  let profile: Record<string, unknown> = {};
  let media: IgMedia[] = [];
  try {
    const profUrl = new URL("https://graph.instagram.com/v21.0/me");
    profUrl.searchParams.set(
      "fields",
      "username,name,biography,account_type,media_count,followers_count,follows_count",
    );
    profUrl.searchParams.set("access_token", conn.access_token);

    const mediaUrl = new URL("https://graph.instagram.com/v21.0/me/media");
    mediaUrl.searchParams.set(
      "fields",
      "caption,media_type,like_count,comments_count,timestamp",
    );
    mediaUrl.searchParams.set("limit", "25");
    mediaUrl.searchParams.set("access_token", conn.access_token);

    const [pRes, mRes] = await Promise.all([fetch(profUrl), fetch(mediaUrl)]);
    if (!pRes.ok) throw new Error(`profile ${pRes.status}`);
    profile = await pRes.json();
    if (mRes.ok) {
      const mJson = await mRes.json();
      media = Array.isArray(mJson.data) ? mJson.data : [];
    }
  } catch (e) {
    console.error("IG data fetch failed:", e);
    // Token likely expired or revoked; the caller falls back to manual setup.
    return NextResponse.json({ connected: false, reason: "fetch_failed" });
  }

  const account = {
    username: (profile.username as string) || conn.username || null,
    name: (profile.name as string) || null,
    followers: (profile.followers_count as number) ?? null,
    media_count: (profile.media_count as number) ?? null,
    account_type: (profile.account_type as string) || null,
  };

  // Not enough content to classify honestly? Say so instead of guessing.
  const captioned = media.filter((m) => (m.caption || "").trim().length > 0);
  if (media.length < 3 || captioned.length < 3) {
    return NextResponse.json({
      connected: true,
      account,
      insufficient: true,
      posts: media.length,
    });
  }

  // 3) Have the AI read the account and extract the setup.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ connected: true, account, extracted: null });
  }

  // A full read of the account is one audit, counted right before the model
  // call and given back when no extraction comes out of it. Denied requests
  // answer with a 403 PlanError, the one non-200 outcome of this route
  // besides 401.
  const u = await requireUsage(ctx.client, ctx.ownerId, "account_audit");
  if (u.denied) return u.denied;

  const posts = media.slice(0, 20).map((m) => ({
    type: m.media_type,
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    caption: (m.caption || "").slice(0, 220),
  }));

  const userPrompt = `Instagram account to analyze:
Username: ${account.username ?? "(unknown)"}
Display name: ${account.name ?? "(none)"}
Bio: ${(profile.biography as string) || "(none)"}
Followers: ${account.followers ?? "(unknown)"} · Posts: ${account.media_count ?? "(unknown)"} · Type: ${account.account_type ?? "(unknown)"}

Recent posts (newest first):
${JSON.stringify(posts, null, 1)}

Allowed niches: ${NICHES.join(", ")}`;

  try {
    const params = {
      model: MODEL,
      max_tokens: 1400,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: extractionSchema } },
      messages: [{ role: "user", content: userPrompt }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    const block = res.content.find((b: { type: string }) => b.type === "text");
    const text = block && "text" in block ? (block as { text: string }).text : "";
    const extracted = parseJson(text) as Extracted | null;
    if (!extracted) {
      // The model answered but nothing readable came back: the audit did not happen.
      await u.release();
      return NextResponse.json({ connected: true, account, extracted: null });
    }
    extracted.confidence = Math.max(0, Math.min(100, Math.round(Number(extracted.confidence) || 0)));
    extracted.signals = (extracted.signals ?? []).slice(0, 6);
    extracted.candidates = (extracted.candidates ?? []).slice(0, 3);
    extracted.highlights = (extracted.highlights ?? []).slice(0, 3);

    // 4) Save automatically only when the model is genuinely confident.
    if (extracted.confidence >= 75) {
      await saveNiche(ctx.client, ctx.ownerId, extracted.niche, detailOf(extracted), {
        brand_name: extracted.brand_name || account.username,
        goals: extracted.goal,
        account_connected: true,
      });
    }
    // Product events stay attributed to the person who clicked.
    recordEvent(supabase, user.id, "free_audit_completed", { plan: u.ent.plan });

    return NextResponse.json({
      connected: true,
      account,
      extracted,
      analyzed: { posts: posts.length, bio: Boolean(profile.biography) },
      usage: u.usage,
    });
  } catch (err: unknown) {
    await u.release();
    console.error("analysis failed:", err);
    const hint = err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160);
    return NextResponse.json({ connected: true, account, extracted: null, error_hint: hint });
  }
}

// Manual paths: the user describes their niche in plain words (AI structures
// it into the same hierarchy), or picks a category directly.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Writes land on the active workspace owner's profile; the AI read is
  // charged to the owner's allowance.
  const ctx = await resolveContext(supabase, user.id);

  let body: { describe?: string; choose?: { niche?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Direct pick from the category list.
  if (body.choose?.niche) {
    const niche = NICHES.includes(body.choose.niche) ? body.choose.niche : "Other";
    await saveNiche(ctx.client, ctx.ownerId, niche, { source: "manual" });
    return NextResponse.json({ ok: true, niche });
  }

  // Plain-words description → structured hierarchy.
  const describe = (body.describe || "").trim().slice(0, 500);
  if (!describe) {
    return NextResponse.json({ error: "Describe what you'll post about." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  }

  // Structuring a description is the same AI read as a full audit; counted
  // right before the model call and given back when nothing comes out of it.
  const u = await requireUsage(ctx.client, ctx.ownerId, "account_audit");
  if (u.denied) return u.denied;

  try {
    const params = {
      model: MODEL,
      max_tokens: 900,
      system: `You are SOCIA, an AI social media strategist. The creator has described, in their own words, what they plan to post about. Convert it into a structured niche. Pick the closest niche from the allowed list, a specific sub_niche, a content_style, and an audience if implied (empty string otherwise). signals: 3-5 short topic phrases taken from their description. confidence reflects how specific their description was. candidates must be an empty array. brand_name/goal/summary/highlights/best_format: infer briefly from the description; use plain short phrases, and never invent performance numbers (highlights should describe the plan, not results).`,
      output_config: { format: { type: "json_schema", schema: extractionSchema } },
      messages: [{ role: "user", content: `What I plan to create content about: ${describe}\n\nAllowed niches: ${NICHES.join(", ")}` }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    const block = res.content.find((b: { type: string }) => b.type === "text");
    const text = block && "text" in block ? (block as { text: string }).text : "";
    const extracted = parseJson(text) as Extracted | null;
    if (!extracted) {
      await u.release();
      return NextResponse.json({ error: "Couldn't structure that. Try again." }, { status: 502 });
    }

    await saveNiche(ctx.client, ctx.ownerId, extracted.niche, {
      ...detailOf(extracted),
      source: "described",
    });
    return NextResponse.json({ ok: true, extracted, usage: u.usage });
  } catch (err) {
    await u.release();
    console.error("describe analysis failed:", err);
    return NextResponse.json({ error: "Analysis failed. Try again." }, { status: 502 });
  }
}
