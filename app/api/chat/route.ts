import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// The strategist persona. It's told the account context so replies feel like
// they come from a tool that already knows the user's numbers.
const SYSTEM = `You are SOCIA, an AI social media strategist embedded in the user's dashboard. You already know their account (context below). Answer like a sharp, concise strategist: specific, actionable, and backed by their numbers. Keep replies short — 2 to 5 sentences or a tight list. Never generic.

ACCOUNT CONTEXT (demo account):
- @tonys.slice.house — family-run pizza restaurant in Austin
- ~12,500 followers, growing ~3%/month
- Best performers: Reels that open on a face + spoken hook in the first 1.5s; cheese-pull and dough-tossing clips
- Weak: static menu photos, and posts that open on the logo
- Audience most active Tuesday & Thursday at 7PM
- Currently posts ~2x/week; competitors post 4–5x/week`;

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

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
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
