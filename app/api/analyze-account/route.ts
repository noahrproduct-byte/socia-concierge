import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { NICHES } from "@/lib/niches";

export const runtime = "nodejs";
export const maxDuration = 120;

// Reads the user's connected Instagram (profile + recent posts) and has the AI
// extract what SOCIA needs: niche, brand, likely goal, and a readout of how the
// content is doing. Saves the extracted profile so the rest of the app is
// personalized without the user filling out forms.

const SYSTEM = `You are SOCIA, an AI social media strategist. You are reading a creator's real Instagram profile and recent posts to set up their account. Extract, honestly and specifically:
- their niche (pick the single closest from the allowed list)
- their brand or account name
- the goal they most likely have, in a short phrase
- a two-sentence plain-words summary of the account, written TO the creator ("You post...")
- three short highlights about what their content is doing (what performs, cadence, formats)
Never invent numbers. If the posts are too sparse to judge, say so plainly in the summary.`;

const extractionSchema = {
  type: "object",
  properties: {
    niche: { type: "string", enum: NICHES },
    brand_name: { type: "string" },
    goal: { type: "string" },
    summary: { type: "string" },
    highlights: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
    best_format: { type: "string" },
  },
  required: ["niche", "brand_name", "goal", "summary", "highlights", "best_format"],
  additionalProperties: false,
} as const;

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

  // 1) Do they have a live Instagram connection with a token?
  const { data: conn } = await supabase
    .from("instagram_connections")
    .select("username, access_token")
    .eq("user_id", user.id)
    .maybeSingle();

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
    // Token likely expired or revoked; the wizard falls back to manual setup.
    return NextResponse.json({ connected: false, reason: "fetch_failed" });
  }

  const account = {
    username: (profile.username as string) || conn.username || null,
    name: (profile.name as string) || null,
    followers: (profile.followers_count as number) ?? null,
    media_count: (profile.media_count as number) ?? null,
    account_type: (profile.account_type as string) || null,
  };

  // 3) Have the AI read the account and extract the setup.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ connected: true, account, extracted: null });
  }

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
${posts.length ? JSON.stringify(posts, null, 1) : "(no recent posts available)"}

Allowed niches: ${NICHES.join(", ")}`;

  try {
    const params = {
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: extractionSchema } },
      messages: [{ role: "user", content: userPrompt }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    const block = res.content.find((b: { type: string }) => b.type === "text");
    const text = block && "text" in block ? (block as { text: string }).text : "";
    const extracted = parseJson(text) as {
      niche: string;
      brand_name: string;
      goal: string;
      summary: string;
      highlights: string[];
      best_format: string;
    } | null;

    // 4) Save what we learned so the whole app is personalized.
    if (extracted) {
      await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          niche: extracted.niche,
          brand_name: extracted.brand_name || account.username,
          goals: extracted.goal,
          account_connected: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    }

    return NextResponse.json({ connected: true, account, extracted });
  } catch (err: unknown) {
    console.error("analysis failed:", err);
    return NextResponse.json({ connected: true, account, extracted: null });
  }
}
