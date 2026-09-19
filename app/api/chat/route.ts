import { NextResponse } from "next/server";
import { anthropic, MODEL, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getProfile, type Profile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";

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

// The transcript the model sees is bounded: the last 30 turns, each cut to a
// sane length. Anything that is not a transcript at all is refused.
const MAX_MESSAGES = 30;
const MAX_CONTENT_CHARS = 8000;

function parseMessages(body: unknown): Msg[] | null {
  const raw = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(raw)) return null;
  const out: Msg[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown } | null)?.role;
    const content = (m as { content?: unknown } | null)?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    out.push({ role, content: content.slice(0, MAX_CONTENT_CHARS) });
  }
  return out.slice(-MAX_MESSAGES);
}

export async function POST(req: Request) {
  // Opus calls with a real budget: signed-in users only.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  }

  let messages: Msg[] | null;
  try {
    messages = parseMessages(await req.json());
  } catch {
    messages = null;
  }
  if (!messages) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

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
      // no facebook table yet — fine
    }
  } catch {
    // fall back to the generic system prompt
  }

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystem(profile, fbPage),
      messages,
    });
    if (res.stop_reason === "refusal") {
      return NextResponse.json({ reply: "I can't help with that one. Try rephrasing." });
    }
    const block = res.content.find((b) => b.type === "text");
    const reply = block && "text" in block ? block.text : "";
    return NextResponse.json({ reply: reply || "…" });
  } catch (err: unknown) {
    // Never the SDK's own message: log it here, tell the user what they can do.
    console.error("chat: model call failed:", err);
    const kind = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
