import { NextResponse } from "next/server";
import { streamRequest, streamError } from "@/lib/streams/route";
import { clipVideoPath, deleteClip } from "@/lib/streams/server";
import { signUrls, storageClient } from "@/lib/studioClips/storage";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";

export const runtime = "nodejs";

// One stream clip:
//   GET    -> { url } a short-lived link to its video (own or edited channels only have one)
//   DELETE -> take it off SOCIA's list (and delete SOCIA's copy of the video; the clip stays on Twitch)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await streamRequest();
  if (!r.ok) return r.res;
  try {
    const path = await clipVideoPath(r.db, r.ctx.ownerId, id);
    if (!path) return NextResponse.json({ error: "SOCIA has no video for this clip. It stays on Twitch." }, { status: 404 });
    const url = (await signUrls(r.db, [path]))[path];
    return url ? NextResponse.json({ url }) : NextResponse.json({ error: "Couldn't open the video. Try again." }, { status: 500 });
  } catch (e) {
    return streamError("streams/clips", e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await streamRequest({ mutate: true });
  if (!r.ok) return r.res;
  try {
    const gone = await deleteClip(r.db, r.ctx.ownerId, id);
    if (!gone) return NextResponse.json({ error: "That clip isn't on your list." }, { status: 404 });
    if (gone.videoPath) await storageClient(r.db).storage.from(STUDIO_BUCKET).remove([gone.videoPath]).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return streamError("streams/clips", e);
  }
}
