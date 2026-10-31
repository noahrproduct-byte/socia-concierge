import { NextResponse } from "next/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { can, forbiddenCopy } from "@/lib/context";
import { studioRequest, requireMutate } from "@/lib/studioClips/auth";
import { sanitizeStyle } from "@/lib/studioClips/style";
import { changePresets, readPresets } from "@/lib/studioClips/styleStore";

export const runtime = "nodejs";

// The brand's video style (Editor V2). GET reads the preset and templates;
// POST changes them: the brand preset is for owners and admins, templates
// for anyone who may edit videos.
export async function GET() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  return NextResponse.json(await readPresets(r.ctx));
}

export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const style = sanitizeStyle(b?.style);
  const w = Number(b?.width), h = Number(b?.height);
  let saved = null;
  if (b?.action === "brand") {
    if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
    if (!style) return NextResponse.json({ error: "Invalid style." }, { status: 400 });
    saved = await changePresets(ctx, { action: "brand", style, width: w, height: h });
  } else if (b?.action === "template") {
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!style || !name) return NextResponse.json({ error: "Give the template a name." }, { status: 400 });
    saved = await changePresets(ctx, { action: "template", name, style, width: w, height: h });
  } else if (b?.action === "delete_template" && typeof b.id === "string") {
    saved = await changePresets(ctx, { action: "delete_template", id: b.id });
  } else {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  return saved ? NextResponse.json(saved) : NextResponse.json({ error: "Couldn't save the style. Try again." }, { status: 500 });
}
