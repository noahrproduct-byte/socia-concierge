import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getProfile, type Profile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

// Build the strategist's system prompt from the user's real profile, so the
// chat answers for *their* account and niche — not a hardcoded demo.
function buildSystem(p: Profile | null): string {
  const ctx =
    p && p.niche
      ? `The user's account:
- Niche: ${p.niche}
- Brand / handle: ${p.brand_name || "(not set)"}
- Main goal: ${p.goals || "(not set)"}
- Platforms: ${(p.platforms || []).join(", ") || "(not set)"}`
      : `The user hasn't set their niche yet. Give the best general advice you can, and when it would help, suggest they set their niche in Settings so you can tailor answers.`;

  return `You are SOCIA, an AI social media strategist embedded in the user's dashboard. Answer like a sharp, concise strategist: specific, actionable, and tailored to their niche and goals. Keep replies short — 2 to 5 sentences or a tight list. Never generic.

${ctx}${brandContext(p?.brand_detail)}`;
}

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The AI isn't connected yet — add your ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  let messages: Msg[];
  try {
    ({ messages } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The API requires the first message to be from the user.
  while (messages.length && messages[0].role === "assistant") messages.shift();
  if (!messages.length) {
    return NextResponse.json({ error: "No message to send." }, { status: 400 });
  }

  // Pull the user's profile to personalize the system prompt.
  let profile: Profile | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) profile = await getProfile(supabase, user.id);
  } catch {
    // fall back to the generic system prompt
  }

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystem(profile),
      messages,
    });
    if (res.stop_reason === "refusal") {
      return NextResponse.json({ reply: "I can't help with that one — try rephrasing." });
    }
    const block = res.content.find((b) => b.type === "text");
    const reply = block && "text" in block ? block.text : "";
    return NextResponse.json({ reply: reply || "…" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
