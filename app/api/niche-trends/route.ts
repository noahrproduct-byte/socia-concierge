import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { nicheIntelSchema, type NicheIntel } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

// Niche intelligence v2: one breakout opportunity, the niche pulse, rising
// trends, and three concrete next actions — personalized with the user's own
// account context when it exists. Cached per user+niche; regenerated on
// refresh or when the cached shape is stale (pre-v2).

const SYSTEM = `You are SOCIA, an AI social media strategist. Given a content niche (and, when provided, context about the creator's own account), produce a niche intelligence briefing about what is winning on short-form social (Instagram Reels, TikTok, YouTube Shorts) in that niche right now.

Rules:
- Be specific and practical. A creator should be able to act on every item today.
- Every hook is written as the actual first line of a video, in the creator's voice.
- All percentages are your own honest market estimates of relative momentum, not measured platform data. Keep them plausible (roughly 5-40 for rising, -5 to -25 for declining). v is always 3.
- stats: small honest counts summarizing the briefing itself (how many rising formats/hooks/patterns it contains), and the single strongest momentum area. momentum_pct is that area's positive momentum estimate (never 0).
- breakout: the ONE strongest current opportunity. format is ONE word: Reel, Carousel, Story, or Video. cover_line is the short punchy text burned onto the video cover: at most 6 words, like a spoken hook fragment ("This tray feeds 30 people."), never a format description. why_moving explains the mechanism in plain words. velocity/competition/opportunity are High, Medium, or Low. audience_overlap is Strong, Moderate, or Weak.
- fit_pct and why_fits_you: ONLY meaningful when account context is provided — then judge honestly how well the breakout suits that specific account and say why in one or two sentences referencing their actual content. If NO account context is provided, set fit_pct to 0 and why_fits_you to an empty string. Never invent knowledge of their account.
- pulse: 5 rows per tab (formats, topics, hooks), each with an estimated change_pct; include at least one declining row per tab so the picture is honest.
- trends: exactly 5 additional rising trends (not the breakout), each with momentum_pct, competition (Low, Medium, or High), a one-line why, and a hook.
- actions: exactly 3 next actions, ordered by fit when account context exists, each with a short reason (why this, why now) and impact: the metric it should move, 1-2 words plus an arrow, like "Discovery ↑" or "Saves ↑".`;

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const niche = (searchParams.get("niche") || "").trim();
  const refresh = searchParams.get("refresh") === "1";
  if (!niche) return NextResponse.json({ error: "No niche set." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Personalized briefing → cache per user + niche (same table, composite key).
  const cacheKey = `${user.id}:${niche}`;
  if (!refresh) {
    try {
      const { data: cached } = await supabase
        .from("niche_trends")
        .select("data")
        .eq("niche", cacheKey)
        .maybeSingle();
      const doc = cached?.data as NicheIntel | undefined;
      if (doc && doc.v === 3 && doc.breakout) {
        return NextResponse.json({ data: doc, cached: true });
      }
    } catch {
      // cache table may not exist yet — fall through to generate
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The AI isn't connected yet — add your ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  // Account context for honest personalization (best-effort).
  let context = "";
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("brand_name, goals, niche_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    const d = (prof?.niche_detail ?? null) as {
      sub_niche?: string;
      content_style?: string;
      audience?: string;
      signals?: string[];
    } | null;
    const bits = [
      prof?.brand_name ? `Account: ${prof.brand_name}` : null,
      d?.sub_niche ? `Sub-niche: ${d.sub_niche}` : null,
      d?.content_style ? `Content style: ${d.content_style}` : null,
      d?.audience ? `Audience: ${d.audience}` : null,
      d?.signals?.length ? `Recurring content signals: ${d.signals.join("; ")}` : null,
      prof?.goals ? `Goal: ${prof.goals}` : null,
    ].filter(Boolean);
    if (bits.length) context = `\n\nCreator's account context (from analyzing their real posts):\n${bits.join("\n")}`;
  } catch {
    // fine — briefing stays account-agnostic
  }

  try {
    const params = {
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: nicheIntelSchema },
      },
      messages: [
        {
          role: "user",
          content: `Niche: ${niche}${context}\n\nProduce the full niche intelligence briefing.`,
        },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    const textBlock = res.content.find((b: { type: string }) => b.type === "text");
    const text = textBlock && "text" in textBlock ? (textBlock as { text: string }).text : "";
    const data = parseJson(text) as NicheIntel | null;
    if (!data) return NextResponse.json({ error: "Couldn't parse trends." }, { status: 502 });
    data.v = 3;
    data.trends = (data.trends ?? []).slice(0, 5);
    data.actions = (data.actions ?? []).slice(0, 3);

    // Cache (best-effort).
    try {
      await supabase
        .from("niche_trends")
        .upsert(
          { niche: cacheKey, data, updated_at: new Date().toISOString() },
          { onConflict: "niche" },
        );
    } catch {
      // ignore cache write errors
    }

    return NextResponse.json({ data, cached: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
