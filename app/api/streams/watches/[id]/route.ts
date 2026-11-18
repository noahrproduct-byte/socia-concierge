import { NextResponse } from "next/server";
import { streamRequest, streamError } from "@/lib/streams/route";
import { stopWatching } from "@/lib/streams/server";

export const runtime = "nodejs";

// DELETE -> stop watching this channel. Its clips stay.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await streamRequest({ mutate: true });
  if (!r.ok) return r.res;
  try {
    const ok = await stopWatching(r.db, r.ctx.ownerId, id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That channel isn't being watched." }, { status: 404 });
  } catch (e) {
    return streamError("streams/watches", e);
  }
}
