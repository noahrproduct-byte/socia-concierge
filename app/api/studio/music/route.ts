import { NextResponse } from "next/server";
import { studioRequest, requireMutate } from "@/lib/studioClips/auth";
import { readMusicAuto, setMusicAuto } from "@/lib/music/store";

export const runtime = "nodejs";

// The brand's music setting.
//   GET -> { auto }  whether SOCIA adds a track to new videos on its own
//   PUT { auto }     turn it on or off
export async function GET() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  return NextResponse.json({ auto: await readMusicAuto(r.ctx) });
}

export async function PUT(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const forbidden = requireMutate(r.ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { auto?: unknown } | null;
  if (typeof body?.auto !== "boolean") return NextResponse.json({ error: "auto must be true or false." }, { status: 400 });
  try {
    await setMusicAuto(r.ctx, body.auto);
    return NextResponse.json({ auto: body.auto });
  } catch {
    return NextResponse.json({ error: "Couldn't save that setting." }, { status: 500 });
  }
}
