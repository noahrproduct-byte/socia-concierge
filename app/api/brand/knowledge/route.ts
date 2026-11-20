import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext, brandWorkspace, can, forbiddenCopy, type Ctx } from "@/lib/context";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { perUserLimit } from "@/lib/rateLimit";
import { updateWorkspace } from "@/lib/workspaces";
import { currentDetail, freshDetail } from "@/lib/intel/understandLoad";
import type { BrandDetail } from "@/lib/profile";
import { sanitizeKnowledge, websiteUrl, type BrandKnowledge } from "@/lib/brandKnowledge";
import { learnFromPages, readSite } from "@/lib/brandKnowledgeLoad";

export const runtime = "nodejs";
export const maxDuration = 60;

// What SOCIA knows about the active brand's business (lib/brandKnowledge.ts).
//   GET                    -> { knowledge, website, canEdit }
//   POST { website }        -> reads the website, saves what it learned and the website
//   PUT { knowledge }       -> saves the person's own list (typed or edited)
//   DELETE                  -> forgets it
// Changing it changes the brand, so only the owner or an admin may.

async function save(ctx: Ctx, change: (d: BrandDetail) => BrandDetail): Promise<boolean> {
  const next = change(await freshDetail(ctx));
  const ws = brandWorkspace(ctx);
  if (ws) return updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
  const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? resolveContext(supabase, user.id) : null;
}

export async function GET() {
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return NextResponse.json({ knowledge: sanitizeKnowledge(d.knowledge), website: d.website ?? null, canEdit: can(ctx, "manage_workspace") });
}

const READ_FAIL: Record<string, string> = {
  blocked: "SOCIA can only read public websites. Check the address.",
  unreadable: "SOCIA couldn't open that website. Check the address, or type what you offer below.",
  empty: "That website has almost no text SOCIA can read (it may be built entirely from images or scripts). Type what you offer below.",
};

export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { website?: unknown } | null;
  const site = typeof body?.website === "string" ? websiteUrl(body.website) : null;
  if (!site) return NextResponse.json({ error: "That doesn't look like a website address." }, { status: 400 });

  // Each read fetches up to six pages and is one model call: an hourly ceiling, then the monthly AI ceiling.
  const limited = await perUserLimit(ctx.ownerId, "website_read", 6, "website reads");
  if (limited) return limited;

  const read = await readSite(site);
  if (!read.ok) return NextResponse.json({ error: READ_FAIL[read.reason] }, { status: 422 });
  try {
    const learned = await learnFromPages(ctx.ownerId, site, read.pages);
    if (!learned) return NextResponse.json({ error: "SOCIA read the website but found nothing about what you offer. Type it below." }, { status: 422 });
    if (!(await save(ctx, (d) => ({ ...d, website: site, knowledge: learned })))) {
      return NextResponse.json({ error: "SOCIA read the website but couldn't save what it learned. Try again." }, { status: 500 });
    }
    return NextResponse.json({ knowledge: learned, website: site });
  } catch (err) {
    const k = aiFailureKind(err);
    console.error("[knowledge]", (err as Error)?.message ?? err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[k], kind: k }, { status: k === "rate_limited" ? 429 : 502 });
  }
}

export async function PUT(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { knowledge?: unknown } | null;
  const prior = sanitizeKnowledge((await currentDetail(ctx).catch(() => ({}) as BrandDetail)).knowledge);
  // The person's edit keeps where the list was first read from.
  const k: BrandKnowledge | null = sanitizeKnowledge({ ...(body?.knowledge as object), source: prior?.source ?? null, updatedAt: new Date().toISOString() });
  if (!(await save(ctx, (d) => { const { knowledge: _old, ...rest } = d; void _old; return k ? { ...rest, knowledge: k } : rest; }))) {
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ knowledge: k });
}

export async function DELETE(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  if (!(await save(ctx, (d) => { const { knowledge: _old, ...rest } = d; void _old; return rest; }))) {
    return NextResponse.json({ error: "Couldn't remove it. Try again." }, { status: 500 });
  }
  return NextResponse.json({ knowledge: null });
}
