// app/api/scorer/route.ts
//
// Video Scorer — takes frames sampled in the browser plus optional spoken/on-screen
// text and returns a real scorecard. Frames are extracted client-side with canvas so
// we never need FFmpeg on the server (which Vercel functions can't run anyway).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { BENCHMARKS, BENCHMARK_VERSION } from "@/lib/benchmarks";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export const maxDuration = 120;

type ScoreBody = {
  /** Base64 JPEG data (no data: prefix), ordered oldest → newest. */
  frames: string[];
  /** Seconds into the video each frame was taken from. */
  frameTimes: number[];
  durationSec: number;
  transcript?: string;
  caption?: string;
  niche?: string;
};

export type VideoScore = {
  overall: number;
  verdict: string;
  verdictDetail: string;
  dims: { label: "Hook" | "Script" | "Visual" | "Audio"; value: number; note: string }[];
  /** Predicted retention %, one value per second from 0 to durationSec. */
  retention: number[];
  biggestDropSec: number;
  fixes: {
    time: string;
    type: string;
    sev: "high" | "med" | "low";
    text: string;
  }[];
};

const SYSTEM = `You are a short-form video editor who reviews drafts before they are posted. You are blunt, specific and useful.

Scoring rules:
- Be harsh. Most drafts score 55-75 overall. Reserve 85+ for genuinely exceptional work.
- The first 3 seconds decide everything. Judge the hook on what is visible in the earliest frames: is there motion, a face, a clear subject, on-screen text, a reason to stay?
- Every fix must reference a specific timestamp and something you can actually see or read. Never write generic advice like "improve pacing" or "add better lighting".
- If you cannot assess a dimension (for example Audio when no transcript was provided), still score it but say plainly in the note that it was inferred from limited information.
- The retention curve should start at 100 and fall realistically. Typical short-form loses 20-35% in the first 3 seconds, then declines more gently. Make the steepest drop line up with the weakest moment you identified.

Respond with ONLY a valid JSON object. No markdown fences, no preamble.

${BENCHMARKS}`;

function extractJSON(text: string): unknown {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s === -1 || e <= s) throw new Error("No JSON found in model response");
    return JSON.parse(cleaned.slice(s, e + 1));
  }
}

export async function POST(req: NextRequest) {
  try {
    // Don't let strangers burn API credit.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set on the server." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ScoreBody;
    const { frames, frameTimes, durationSec, transcript, caption, niche } = body;

    if (!Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json(
        { error: "No frames were sent. Try a different video file." },
        { status: 400 }
      );
    }

    const seconds = Math.max(1, Math.round(durationSec));

    const imageBlocks = frames.slice(0, 10).map((data) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data,
      },
    }));

    const instructions = `Score this ${seconds}-second ${niche ? `${niche} ` : ""}short-form video.

You are looking at ${imageBlocks.length} frames sampled at these timestamps (seconds): ${frameTimes
      .slice(0, 10)
      .map((t) => t.toFixed(1))
      .join(", ")}.

${transcript ? `SPOKEN / ON-SCREEN TEXT:\n"""\n${transcript}\n"""\n` : "No transcript was provided — infer what you can from the frames and say so in the Audio and Script notes.\n"}
${caption ? `PLANNED CAPTION:\n"""\n${caption}\n"""\n` : ""}
Return this exact JSON shape:

{
  "overall": <integer 0-100>,
  "verdict": "<6 words max, e.g. 'Strong — with 2 quick wins'>",
  "verdictDetail": "<one sentence on what would move the needle most>",
  "dims": [
    { "label": "Hook",   "value": <0-100>, "note": "<one specific sentence about the opening frames>" },
    { "label": "Script", "value": <0-100>, "note": "<one specific sentence about structure and payoff timing>" },
    { "label": "Visual", "value": <0-100>, "note": "<one specific sentence about framing, lighting, text legibility>" },
    { "label": "Audio",  "value": <0-100>, "note": "<one specific sentence about clarity, music, or that it was inferred>" }
  ],
  "retention": [<${seconds + 1} integers from 100 down, one per second inclusive of 0>],
  "biggestDropSec": <integer second where the steepest fall happens>,
  "fixes": [
    { "time": "<m:ss or m:ss–m:ss>", "type": "Hook|Pacing|Text|Audio|Visual|CTA", "sev": "high|med|low", "text": "<one specific instruction referencing what is actually in the frame>" }
  ]
}

Give between 3 and 5 fixes, ordered by impact.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text", text: instructions }],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Model returned no text content");
    }

    const score = extractJSON(textBlock.text) as VideoScore;

    // Guard against a short or malformed retention array so the chart never breaks.
    if (!Array.isArray(score.retention) || score.retention.length < 2) {
      score.retention = Array.from({ length: seconds + 1 }, (_, i) =>
        Math.max(25, Math.round(100 - i * (60 / Math.max(1, seconds))))
      );
    }

    return NextResponse.json({ ...score, benchmarkVersion: BENCHMARK_VERSION });
  } catch (err) {
    console.error("[/api/scorer] failed:", err);
    return NextResponse.json(
      { error: "Could not score this video. Please try again." },
      { status: 500 }
    );
  }
}
