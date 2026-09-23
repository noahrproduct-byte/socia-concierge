import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getProfile, type Profile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";
import { requireUsage } from "@/lib/planGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

// Build the strategist's system prompt from the user's real profile, so the
// chat answers for *their* account and niche — not a hardcoded demo.
function buildSystem(p: Profile | null, fbPage: string | null): string {
  let ctx =
    p && p.niche
      ? `The user's account:
- Niche: ${p.niche}
- Brand / handle: ${p.brand_name || "(not set)"}
- Main goal: ${p.goals || "(not set)"}
- Platforms: ${(p.platforms || []).join(", ") || "(not set)"}`
      : `The user hasn't set their niche yet. Give the best general advice you can, and when it would help, suggest they set their niche in Settings so you can tailor answers.`;
  if (fbPage) {
    ctx += `\n- Facebook Page connected: "${fbPage}". When advice concerns Facebook, use Facebook-native formats and terminology (Page posts, Reels on Facebook, Stories, link posts) rather than Instagram-only concepts.`;
  }

  return `You are SOCIA, an AI social media strategist embedded in the user's dashboard. Answer like a sharp, concise strategist: specific, actionable, and tailored to their niche and goals. Keep replies short — 2 to 5 sentences or a tight list. Never generic.

${ctx}${brandContext(p?.brand_detail)}`;
}

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  // Signed-in users only: this endpoint spends real API credits and counts
  // against the Ask SOCIA allowance.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "The AI isn't connected yet. Add your ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  let messages: Msg[];
  try {
    ({ messages } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The API requires the first message to be from the user.
  while (messages.length && messages[0].role === "assistant") messages.shift();
  if (!messages.length) {
    return NextResponse.json({ error: "No message to send." }, { status: 400 });
  }

  // Pull the user's profile (+ connected Facebook Page) to personalize the system prompt.
  let profile: Profile | null = null;
  let fbPage: string | null = null;
  try {
    profile = await getProfile(supabase, user.id);
    try {
      const { data: fb } = await supabase
        .from("facebook_connections")
        .select("page_name, connection_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (fb?.connection_status === "connected") fbPage = fb.page_name ?? null;
    } catch {
      // no facebook table yet, fine
    }
  } catch {
    // fall back to the generic system prompt
  }

  // One question per unit of the Ask SOCIA allowance; counted right before
  // the model is called, and given back when the call produces no answer.
  const u = await requireUsage(supabase, user.id, "ask_socia");
  if (u.denied) return u.denied;

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystem(profile, fbPage),
      messages,
    });
    if (res.stop_reason === "refusal") {
      await u.release();
      return NextResponse.json({ reply: "I can't help with that one. Try rephrasing." });
    }
    const block = res.content.find((b) => b.type === "text");
    const reply = block && "text" in block ? block.text : "";
    if (!reply) {
      await u.release();
      return NextResponse.json({ error: "SOCIA returned nothing. Try again." }, { status: 502 });
    }
    return NextResponse.json({ reply, usage: u.usage });
  } catch (err: unknown) {
    await u.release();
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
