// app/api/rate/route.ts
//
// Content Rater API — takes a caption + post type, returns a structured scorecard.
// Requires: npm install @anthropic-ai/sdk
// Requires: ANTHROPIC_API_KEY in .env.local

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { BENCHMARKS, BENCHMARK_VERSION } from "@/lib/benchmarks";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Matches the convention already used elsewhere in this project.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

// Claude can take a few seconds. Give the route room to breathe.
export const maxDuration = 60;

type RateBody = {
  caption: string;
  postType: string;
  platform?: string;
  niche?: string;
};

export type Scorecard = {
  grade: "A" | "B" | "C" | "D" | "F";
  overallScore: number;
  hookScore: number;
  hookAnalysis: string;
  rewrittenHook: string;
  captionScore: number;
  captionAnalysis: string;
  engagementPotential: "Low" | "Medium" | "High" | "Viral Potential";
  engagementReason: string;
  hashtags: string[];
  tips: { title: string; detail: string }[];
};

const SYSTEM_PROMPT = `You are a blunt, experienced short-form social media strategist. You review content BEFORE it is posted and tell the creator exactly what is wrong with it.

Rules you must follow:
- Be harsh. Most content is mediocre. Scores of 5-6 out of 10 are normal. Reserve 9-10 for genuinely exceptional work.
- Never give generic advice. "Add more emojis" or "be more engaging" is useless. Every point must reference something specific in THIS caption.
- The hook is the first line or first 5-8 words. It is the single highest-leverage part of the post. Judge it on: specificity, curiosity gap, stakes, and whether it is instantly clear in under 3 seconds.
- Hashtags should mix a few broad tags with mostly niche-specific ones. Never suggest banned or spammy tags like #followforfollow, #like4like, or #explorepage.
- Engagement potential must be honest. Most posts are "Low" or "Medium". "Viral Potential" should be rare.
- Write tips as concrete instructions the person can act on in under two minutes.

You must respond with ONLY a valid JSON object. No markdown code fences, no preamble, no explanation outside the JSON.

${BENCHMARKS}`;

function buildUserPrompt(body: RateBody) {
  const { caption, postType, platform, niche } = body;
  return `Rate this ${postType} for ${platform || "Instagram"}${
    niche ? `, in the ${niche} niche` : ""
  }.

CAPTION:
"""
${caption}
"""

Return this exact JSON shape:

{
  "grade": "A" | "B" | "C" | "D" | "F",
  "overallScore": <integer 0-100>,
  "hookScore": <integer 0-10>,
  "hookAnalysis": "<2 sentences on why the opening works or fails, quoting the actual words used>",
  "rewrittenHook": "<a stronger version of the opening line, written out ready to use>",
  "captionScore": <integer 0-10>,
  "captionAnalysis": "<2 sentences on structure, clarity, and whether there is a real call to action>",
  "engagementPotential": "Low" | "Medium" | "High" | "Viral Potential",
  "engagementReason": "<1 sentence justifying that rating>",
  "hashtags": [<8 hashtag strings including the # symbol, mostly niche-specific>],
  "tips": [
    { "title": "<short imperative, max 6 words>", "detail": "<1-2 sentences, specific to this caption>" },
    { "title": "...", "detail": "..." },
    { "title": "...", "detail": "..." }
  ]
}`;
}

/**
 * Claude is instructed to return bare JSON, but models occasionally wrap it in
 * markdown fences or add a stray sentence. This pulls the first balanced JSON
 * object out of the text so a small formatting slip doesn't break the feature.
 */
function extractJSON(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("No JSON object found in model response");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

export async function POST(req: NextRequest) {
  // Signed-in users only — this endpoint spends real API credits.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const body = (await req.json()) as RateBody;

    if (!body?.caption || body.caption.trim().length < 10) {
      return NextResponse.json(
        { error: "Please enter a caption of at least 10 characters." },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set on the server." },
        { status: 500 }
      );
    }

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(body) }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Model returned no text content");
    }

    const scorecard = extractJSON(textBlock.text) as Scorecard;

    return NextResponse.json({ ...scorecard, benchmarkVersion: BENCHMARK_VERSION });
  } catch (err) {
    console.error("[/api/rate] failed:", err);
    return NextResponse.json(
      { error: "Could not rate this content. Please try again." },
      { status: 500 }
    );
  }
}
