import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { getEntitlements, getLimit } from "@/lib/entitlements";
import { limitError } from "@/lib/planErrors";
import { deny } from "@/lib/planGuard";
import { isOwnAccount, ownAccounts } from "@/lib/ownAccounts";
import { IG_HANDLE_RE } from "@/lib/discoverStyle";
import { readStyleMemory, saveStyleMemory } from "@/lib/discoverStyleLoad";

export const runtime = "nodejs";

// "Reels to copy" (Noah, 2026-11-16): Instagram accounts a brand copies Reels
// from for their style, not as competitors (moe.dev for SOCIA). Kept on the
// brand (brand_detail.discover.copyFrom), up to the plan's competitor limit,
// and never counted against it. Discover reads them in the background
// (lib/discoverRead.ts) and finds more accounts like them.

async function guard(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return { res: crossSite } as const;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { res: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return { res: NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 }) } as const;
  const body = (await req.json().catch(() => null)) as { handle?: unknown } | null;
  const handle = typeof body?.handle === "string" ? body.handle.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").toLowerCase() : "";
  if (!IG_HANDLE_RE.test(handle)) return { res: NextResponse.json({ error: "That doesn't look like an Instagram handle." }, { status: 400 }) } as const;
  return { ctx, handle } as const;
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;
  const { ctx, handle } = g;
  if (isOwnAccount(await ownAccounts(ctx.client, ctx.ownerId), { handle })) {
    return NextResponse.json({ error: "That's one of your own accounts." }, { status: 400 });
  }
  const memory = await readStyleMemory(ctx);
  if (memory.copyFrom.includes(handle)) return NextResponse.json({ ok: true, copyFrom: memory.copyFrom });
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const limit = getLimit(ent, "competitors");
  if (memory.copyFrom.length >= limit) {
    const e = limitError(ent.plan, "competitors", limit, memory.copyFrom.length);
    return deny({ ...e, error: `${e.planName} lets you copy Reels from up to ${limit} accounts in each brand. Remove one to add another.` });
  }
  const copyFrom = [...memory.copyFrom, handle];
  const { [handle]: _promoted, ...copyFound } = memory.copyFound;
  void _promoted;
  if (!(await saveStyleMemory(ctx, { ...memory, copyFrom, copyFound }))) {
    return NextResponse.json({ error: "SOCIA couldn't save that just now. Try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, copyFrom });
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;
  const { ctx, handle } = g;
  const memory = await readStyleMemory(ctx);
  const copyFrom = memory.copyFrom.filter((h) => h !== handle);
  // Removing an account also drops what SOCIA found from it, and a found account can be removed on its own.
  const copyFound = Object.fromEntries(Object.entries(memory.copyFound).filter(([h, f]) => h !== handle && f.from !== handle));
  if (!(await saveStyleMemory(ctx, { ...memory, copyFrom, copyFound }))) {
    return NextResponse.json({ error: "SOCIA couldn't save that just now. Try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, copyFrom });
}
