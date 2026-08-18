import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { nicheTrendsSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM = `You are SOCIA, an AI social media strategist. Given a content niche, describe what is currently working best on short-form social (Instagram Reels, TikTok, YouTube Shorts) in that niche. Be specific and practical — a creator should be able to act on this today.

Rules:
- Focus on formats, hooks, and concepts that are genuinely performing, not generic advice.
- Each trend needs a concrete example hook written as the actual first line of a video.
- "momentum" is one of: "Hot", "Rising", "Steady".
- Keep it tight and useful.`;

function buildPrompt(niche: string): string {
  return `Niche: ${niche}

Produce: a one-line summary of what's hot in this niche right now; 6 specific content trends (each with a title, the format, why it works, an example hook, and momentum); the 4 strongest hook patterns; and 3 winning formats with a short note each.`;
}

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

  // Shared cache across users in the same niche — instant + cheap after first run.
  if (!refresh) {
    try {
      const { data: cached } = await supabase
        .from("niche_trends")
        .select("data")
        .eq("niche", niche)
        .maybeSingle();
      if (cached?.data) return NextResponse.json({ data: cached.data, cached: true });
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

  try {
    const params = {
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: nicheTrendsSchema },
      },
      messages: [{ role: "user", content: buildPrompt(niche) }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    const textBlock = res.content.find((b: { type: string }) => b.type === "text");
    const text = textBlock && "text" in textBlock ? (textBlock as { text: string }).text : "";
    const data = parseJson(text);
    if (!data) return NextResponse.json({ error: "Couldn't parse trends." }, { status: 502 });

    // Cache it for everyone in this niche (best-effort).
    try {
      await supabase
        .from("niche_trends")
        .upsert({ niche, data, updated_at: new Date().toISOString() }, { onConflict: "niche" });
    } catch {
      // ignore cache write errors
    }

    return NextResponse.json({ data, cached: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
