import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/instagramSync";
import { searchChannels, ytConfigured, type YtStats } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 60;

// Suggested accounts to track, in the user's real niche.
//
// Two sources, never blended:
//   YouTube  — the official Data API's channel search. Every suggestion is a
//              real channel with its real subscriber count.
//   Instagram — no public search API exists, so these come from live web
//              research and are labeled as such. SOCIA never claims a metric
//              for them; the user verifies before tracking.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SEARCH_MODEL = process.env.ANTHROPIC_SEARCH_MODEL ?? "claude-opus-5";
const TTL_MS = 24 * 60 * 60 * 1000;

export type IgSuggestion = {
  handle: string;
  why: string;
  /** Always "web_research" — never presented as platform data. */
  source: "web_research";
};

export type DiscoverDoc = {
  v: 1;
  niche: string;
  youtube: YtStats[];
  instagram: IgSuggestion[];
  found_at: string;
};

function parseJsonArray(text: string): unknown[] {
  const m = /\[\s*\{[\s\S]*\}\s*\]/.exec(text);
  if (!m) return [];
  try {
    const v = JSON.parse(m[0]);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  let niche = "";
  let subNiche = "";
  let location = "";
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("niche, niche_detail, brand_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    niche = prof?.niche ?? "";
    subNiche = (prof?.niche_detail as { sub_niche?: string } | null)?.sub_niche ?? "";
    location = (prof?.brand_detail as { location?: string } | null)?.location ?? "";
  } catch {
    /* handled below */
  }
  if (!niche) {
    return NextResponse.json(
      { error: "Set your niche first so SOCIA knows what to look for." },
      { status: 400 },
    );
  }

  let username = "";
  try {
    const conn = await getActiveConnection(supabase, user.id, "username");
    username = (conn as { username?: string } | null)?.username ?? "";
  } catch {
    /* excluding the user's own account is best-effort */
  }

  const topic = subNiche || niche;
  const cacheKey = `discover:${topic}`;

  if (!refresh) {
    try {
      const { data: cached } = await supabase
        .from("niche_trends")
        .select("data, updated_at")
        .eq("niche", cacheKey)
        .maybeSingle();
      const doc = cached?.data as DiscoverDoc | undefined;
      if (
        doc?.v === 1 &&
        cached?.updated_at &&
        Date.now() - new Date(cached.updated_at).getTime() < TTL_MS
      ) {
        return NextResponse.json(doc);
      }
    } catch {
      /* no cache — generate below */
    }
  }

  // --- YouTube: real channels from the official API ---------------------
  let youtube: YtStats[] = [];
  if (ytConfigured()) {
    try {
      youtube = await searchChannels(topic, 6);
    } catch {
      youtube = [];
    }
  }

  // --- Instagram: web research, labeled as such -------------------------
  let instagram: IgSuggestion[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    const prompt = `Search the web for real, currently-active Instagram accounts in the "${topic}" niche${
      location ? ` (the user is based in ${location}; include some local or regional accounts if they exist)` : ""
    }.

Find 6 accounts a ${topic} business would consider peers or competitors.${
      username ? ` Exclude the account "@${username}".` : ""
    }

STRICT HONESTY RULES:
- Only include accounts you actually found referenced in search results. Never invent a handle.
- Do NOT include follower counts, engagement rates, or any metric. You cannot verify them and SOCIA will not display them.
- "why": ONE short sentence on why this account is a relevant peer.

Output ONLY a JSON array, no other text:
[{"handle":"name_without_at","why":"..."}]`;

    try {
      type MsgParam = { role: "user" | "assistant"; content: unknown };
      const messages: MsgParam[] = [{ role: "user", content: prompt }];
      let text = "";
      for (let i = 0; i < 3; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = await (anthropic.messages.create as any)({
          model: SEARCH_MODEL,
          max_tokens: 2000,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
          messages,
        });
        text = res.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text: string }) => b.text)
          .join("\n");
        if (res.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: res.content });
      }
      instagram = parseJsonArray(text)
        .map((raw) => {
          const r = raw as { handle?: unknown; why?: unknown };
          const handle = typeof r.handle === "string" ? r.handle.trim().replace(/^@/, "") : "";
          if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) return null;
          if (username && handle.toLowerCase() === username.toLowerCase()) return null;
          return {
            handle: handle.toLowerCase(),
            why: typeof r.why === "string" ? r.why : "",
            source: "web_research" as const,
          };
        })
        .filter((x): x is IgSuggestion => x != null)
        .slice(0, 6);
    } catch {
      instagram = [];
    }
  }

  const doc: DiscoverDoc = {
    v: 1,
    niche: topic,
    youtube,
    instagram,
    found_at: new Date().toISOString(),
  };

  try {
    await supabase
      .from("niche_trends")
      .upsert({ niche: cacheKey, data: doc, updated_at: new Date().toISOString() }, { onConflict: "niche" });
  } catch {
    /* caching is best-effort */
  }

  return NextResponse.json(doc);
}
