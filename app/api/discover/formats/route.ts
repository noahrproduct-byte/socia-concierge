import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { buildFormatsDoc, loadExamples, readFormatsDoc, saveFormatsDoc } from "@/lib/nicheFormatsLoad";

export const runtime = "nodejs";
export const maxDuration = 60;

// Winning formats for the active brand (lib/nicheFormats.ts). The cached
// result is served until a newer research run or a week has passed; a
// "refresh" rebuilds it at most once an hour and is for owners and admins.
// Each build is one model call, so the cache and the cooldown live here,
// never in the UI.
const TTL_MS = 7 * 86_400_000;
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const body = (await req.json().catch(() => ({}))) as { refresh?: boolean };
  if (body.refresh && !can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });

  const now = new Date();
  const { doc: cached, updatedAt } = await readFormatsDoc(ctx);
  const age = updatedAt ? now.getTime() - Date.parse(updatedAt) : Infinity;
  const { examples, runAt } = await loadExamples(ctx, now);
  const current = cached && cached.runAt === runAt && age < TTL_MS;
  if (current && (!body.refresh || age < REFRESH_COOLDOWN_MS)) return NextResponse.json({ doc: cached, cached: true });

  const g = await requireFeature(ctx.client, ctx.ownerId, "niche_intelligence");
  if (g.denied) return g.denied;
  const limited = await perUserLimit(ctx.ownerId, "niche_formats", 6, "format analyses");
  if (limited) return limited;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });

  try {
    const doc = await buildFormatsDoc(ctx, examples, runAt, now);
    await saveFormatsDoc(ctx, doc).catch(() => undefined);
    return NextResponse.json({ doc, cached: false });
  } catch (err) {
    const kind = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
