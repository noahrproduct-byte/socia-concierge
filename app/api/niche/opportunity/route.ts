import { NextResponse } from "next/server";
import { anthropic, MODEL, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";
import { requireFeature } from "@/lib/planGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Your version" of the opportunity the page surfaced. The evidence arrives
// already computed (real counts and medians); the model only adapts the
// observed pattern to this account. Cached per user and pattern for a week; a
// "refresh" regenerates at most once an hour so the button cannot become an
// unbounded number of model calls.

const TTL_MS = 7 * 86400000;
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

export type OpportunityConcept = { concept: string; hook: string; shots: string[] };

const schema = {
  type: "object", additionalProperties: false,
  properties: { concept: { type: "string" }, hook: { type: "string" }, shots: { type: "array", items: { type: "string" } } },
  required: ["concept", "hook", "shots"],
} as const;

type Body = { tag: string; why: string[]; example?: { title: string | null; accountName: string | null } | null; competitorName?: string | null; refresh?: boolean };

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body.tag) return NextResponse.json({ error: "No pattern given." }, { status: 400 });

  const key = `opp:${user.id}:${body.tag}`;
  try {
    const { data } = await supabase.from("niche_trends").select("data, updated_at").eq("niche", key).maybeSingle();
    const doc = data?.data as OpportunityConcept | undefined;
    const ageMs = data?.updated_at ? Date.now() - new Date(data.updated_at).getTime() : Infinity;
    if (doc?.concept && ageMs < TTL_MS && (!body.refresh || ageMs < REFRESH_COOLDOWN_MS)) {
      return NextResponse.json({ ...doc, cached: true });
    }
  } catch { /* no cache */ }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });

  // A fresh concept is part of Niche intelligence; cached ones above stay free.
  const g = await requireFeature(supabase, user.id, "niche_intelligence");
  if (g.denied) return g.denied;

  const profile = await getProfile(supabase, user.id).catch(() => null);
  const ctx = [
    `Account: ${profile?.niche ?? "niche not set"}${profile?.brand_name ? `, ${profile.brand_name}` : ""}${profile?.brand_detail?.location ? `, based in ${profile.brand_detail.location}` : ""}.`,
    profile?.goals ? `Goal: ${profile.goals}.` : "",
    brandContext(profile?.brand_detail) || "",
    `Pattern SOCIA surfaced: "${body.tag}".`,
    `Evidence (already measured, do not restate numbers you were not given):\n${(body.why ?? []).map((w) => `- ${w}`).join("\n")}`,
    body.example?.title ? `A niche example: "${body.example.title}"${body.example.accountName ? ` by ${body.example.accountName}` : ""}.` : "",
    body.competitorName ? `A competitor using it: ${body.competitorName}.` : "",
  ].filter(Boolean).join("\n");

  try {
    const params = {
      model: MODEL, max_tokens: 700,
      system: `You are SOCIA's content strategist. Adapt an observed pattern to this specific business. concept: one filmable idea in under 40 words, concrete (what is on screen from the first second to the last). hook: the spoken or on-screen first line, under 12 words. shots: 3 to 4 short shot descriptions. Never predict views, never invent facts about the business, never mention algorithms. Plain text, no markdown, no em dashes.`,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: ctx }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    const block = res.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? (JSON.parse(block.text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as OpportunityConcept) : null;
    if (!raw?.concept) throw new Error("empty");
    const doc: OpportunityConcept = { concept: raw.concept, hook: raw.hook ?? "", shots: (raw.shots ?? []).slice(0, 4) };
    try {
      await supabase.from("niche_trends").upsert({ niche: key, data: doc, updated_at: new Date().toISOString() }, { onConflict: "niche" });
    } catch { /* best effort */ }
    return NextResponse.json({ ...doc, cached: false });
  } catch (err) {
    const kind = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
