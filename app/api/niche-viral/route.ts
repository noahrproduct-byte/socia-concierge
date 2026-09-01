import { NextResponse } from "next/server";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { anthropic } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/instagramSync";

export const runtime = "nodejs";
export const maxDuration = 300;

// Finds REAL currently-viral short-form posts in the user's niche by other
// creators, via live web search. Honesty rules:
// - every item is a real, linkable post found on the open web
// - view counts are included ONLY when the search results/pages literally
//   reported them, and the UI labels them as platform-reported
// - the "why" line is explicitly AI interpretation, never a measured stat
// Thumbnails come from public, keyless endpoints (YouTube's image CDN and
// TikTok's public oEmbed), so nothing is fabricated or scraped illegitimately.
// Cached globally per niche for 24h in niche_trends under `viral:{niche}`.

const TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_MODEL = "claude-sonnet-5"; // search+extract task; opus not needed

export type ViralItem = {
  platform: "tiktok" | "youtube" | "instagram";
  url: string;
  creator: string;
  title: string;
  views: string | null; // as reported by the platform page, else null
  thumb: string | null;
  why: string; // AI interpretation, one sentence
};

export type ViralDoc = { v: 1; niche: string; items: ViralItem[]; found_at: string };

function parseArray(text: string): unknown[] | null {
  // The model may wrap the array in prose or code fences, and search
  // citations add stray brackets — target an array of objects specifically.
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const m = /\[\s*\{[\s\S]*\}\s*\]/.exec(cleaned);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function youtubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:shorts\/|watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/.exec(url);
  return m?.[1] ?? null;
}

async function enrich(raw: Record<string, unknown>): Promise<ViralItem | null> {
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const isTikTok = host.endsWith("tiktok.com");
  const isYouTube = host.endsWith("youtube.com") || host === "youtu.be";
  const isInstagram = host.endsWith("instagram.com");
  if (!isTikTok && !isYouTube && !isInstagram) return null;

  const item: ViralItem = {
    platform: isTikTok ? "tiktok" : isInstagram ? "instagram" : "youtube",
    url,
    creator: typeof raw.creator === "string" ? raw.creator : "",
    title: typeof raw.title === "string" ? raw.title : "",
    views: typeof raw.views_reported === "string" && raw.views_reported.trim() ? raw.views_reported.trim() : null,
    thumb: null,
    why: typeof raw.why === "string" ? raw.why : "",
  };

  if (isYouTube) {
    const id = youtubeId(url);
    if (id) item.thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  } else {
    // TikTok's oEmbed is public and keyless — real thumbnail, author, title.
    try {
      const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const o = (await res.json()) as { thumbnail_url?: string; author_name?: string; title?: string };
        item.thumb = o.thumbnail_url ?? null;
        if (o.author_name) item.creator = o.author_name;
        if (o.title && !item.title) item.title = o.title.slice(0, 90);
      }
    } catch {
      // keep the item without a thumbnail — the UI shows a placeholder
    }
  }
  if (!item.creator && !item.title) return null;
  return item;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Niche context (sub-niche sharpens the search a lot).
  let niche = "";
  let subNiche = "";
  let username = "";
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("niche, niche_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    niche = prof?.niche ?? "";
    subNiche = (prof?.niche_detail as { sub_niche?: string } | null)?.sub_niche ?? "";
  } catch {
    // fall through to the generic error below if we have no niche at all
  }
  // The user's own recent captions, so "what's winning" is content they could
  // actually make — not generic niche virality.
  let ownThemes = "";
  try {
    const conn = await getActiveConnection(supabase, user.id, "username, media");
    const c = conn as { username?: string; media?: unknown } | null;
    username = c?.username ?? "";
    const media = Array.isArray(c?.media) ? (c!.media as { caption?: string }[]) : [];
    ownThemes = media
      .map((m) => (m.caption ?? "").split("\n")[0].replace(/#[\p{L}\p{N}_]+/gu, "").trim())
      .filter((t) => t.length > 3)
      .slice(0, 6)
      .join("; ")
      .slice(0, 400);
  } catch {
    // personalisation is best-effort; the niche search still works
  }
  if (!niche) {
    return NextResponse.json(
      { error: "Set your niche first so SOCIA knows what to search for." },
      { status: 400 },
    );
  }

  // Results are now tailored to this account's own content, so the cache must
  // be per user — a shared niche key would serve one user's personalised
  // picks to another.
  const cacheKey = `viral:${niche}:${user.id}`;

  // Fresh cache?
  try {
    const { data: cached } = await supabase
      .from("niche_trends")
      .select("data, updated_at")
      .eq("niche", cacheKey)
      .maybeSingle();
    const doc = cached?.data as ViralDoc | undefined;
    if (
      doc?.v === 1 &&
      doc.items?.length &&
      cached?.updated_at &&
      Date.now() - new Date(cached.updated_at).getTime() < TTL_MS
    ) {
      return NextResponse.json(doc);
    }
  } catch {
    // no cache — generate below
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: AI_UNAVAILABLE_COPY.no_key, unavailable: "no_key" },
      { status: 503 },
    );
  }

  const topic = subNiche || niche;
  const prompt = `Search the web for short-form videos (Instagram Reels, TikTok, or YouTube Shorts) about "${topic}" that are currently viral or performed exceptionally well recently (ideally within the last 60 days).

Find 4 posts from 4 DIFFERENT creators.${username ? ` Exclude anything from the account "@${username}".` : ""}
${
  ownThemes
    ? `\nThe user makes this kind of content themselves — recent posts of theirs include: ${ownThemes}.\nStrongly prefer videos this specific account could realistically remake: same subject matter, comparable production effort, no celebrity access or big budgets required. Skip anything that depends on resources a small independent business would not have.\n`
    : ""
}

STRICT HONESTY RULES:
- Only include posts you actually found via search, with their real URLs. Never invent a URL, creator, or title.
- "views_reported": include ONLY if a view count literally appeared in the search results or page you read (format like "2.1M"). Otherwise null. Never estimate.
- "why": ONE sentence of clearly interpretive analysis of why it likely performs (hook, format, framing). No invented statistics.

Output ONLY a JSON array, no other text:
[{"platform":"tiktok"|"youtube"|"instagram","url":"...","creator":"...","title":"...","views_reported":"..."|null,"why":"..."}]`;

  try {
    // Web search is a server-side tool; long turns can pause — continue them.
    type MsgParam = { role: "user" | "assistant"; content: unknown };
    const messages: MsgParam[] = [{ role: "user", content: prompt }];
    let text = "";
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await (anthropic.messages.create as any)({
        model: SEARCH_MODEL,
        max_tokens: 4000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages,
      });
      text = res.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n");
      if (res.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: res.content });
    }

    const rawItems = parseArray(text);
    if (!rawItems) {
      return NextResponse.json(
        {
          error: "Couldn't extract results from the search — try again.",
          error_hint: text.slice(-400) || "(empty model text)",
        },
        { status: 502 },
      );
    }

    const items = (
      await Promise.all(rawItems.slice(0, 6).map((r) => enrich(r as Record<string, unknown>)))
    ).filter((x): x is ViralItem => x !== null).slice(0, 4);

    if (!items.length) {
      return NextResponse.json(
        { error: "No verifiable viral posts found right now — try again later." },
        { status: 502 },
      );
    }

    const doc: ViralDoc = { v: 1, niche, items, found_at: new Date().toISOString() };
    try {
      await supabase
        .from("niche_trends")
        .upsert({ niche: cacheKey, data: doc, updated_at: new Date().toISOString() }, { onConflict: "niche" });
    } catch {
      // caching is best-effort
    }
    return NextResponse.json(doc);
  } catch (err: unknown) {
    // Say why, so the UI can state the real reason instead of rendering an
    // empty section that reads as "nothing found".
    const kind = aiFailureKind(err);
    return NextResponse.json(
      { error: AI_UNAVAILABLE_COPY[kind], unavailable: kind },
      { status: kind === "no_credit" || kind === "no_key" ? 503 : 500 },
    );
  }
}
