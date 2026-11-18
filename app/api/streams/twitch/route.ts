import { NextResponse } from "next/server";
import { can } from "@/lib/context";
import { streamRequest, streamError } from "@/lib/streams/route";
import { removeConnection } from "@/lib/streams/server";

export const runtime = "nodejs";

// DELETE -> disconnect Twitch: its tokens are deleted and every channel stops being watched. Clips stay.
export async function DELETE() {
  const r = await streamRequest();
  if (!r.ok) return r.res;
  if (!can(r.ctx, "connect")) return NextResponse.json({ error: "Only the owner or an Admin can disconnect Twitch." }, { status: 403 });
  try {
    await removeConnection(r.db, r.ctx.ownerId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return streamError("streams/twitch", e);
  }
}
