import { NextResponse } from "next/server";
import { streamRequest, streamError, streamAllowance } from "@/lib/streams/route";
import { readConnection, startWatching, streamState } from "@/lib/streams/server";
import { channelFromInput, MAX_WATCHED } from "@/lib/streams/channels";
import { twitchConfigured } from "@/lib/streams/twitch";

export const runtime = "nodejs";

// Live streams (AI Clipper):
//   GET  -> { configured, connection, watches, clips, allowance }
//   POST { channels: string[] } -> start watching these Twitch channels (links or names), within the plan
export async function GET() {
  const r = await streamRequest();
  if (!r.ok) return r.res;
  try {
    const connection = await readConnection(r.db, r.ctx.ownerId);
    const state = connection ? await streamState(r.db, r.ctx.ownerId) : { watches: [], clips: [] };
    const allowance = await streamAllowance(r.db, r.ctx.ownerId, r.ent);
    return NextResponse.json({ configured: twitchConfigured(), connection, ...state, allowance, maxWatched: MAX_WATCHED });
  } catch (e) {
    return streamError("streams", e);
  }
}

export async function POST(req: Request) {
  const r = await streamRequest({ mutate: true });
  if (!r.ok) return r.res;
  const body = (await req.json().catch(() => null)) as { channels?: unknown } | null;
  const raw = Array.isArray(body?.channels) ? body!.channels.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, MAX_WATCHED + 1) : [];
  const logins = raw.map(channelFromInput);
  const bad = raw.filter((_, i) => !logins[i]);
  if (bad.length) return NextResponse.json({ error: `That isn't a Twitch channel: ${bad[0].slice(0, 80)}. Paste a link like twitch.tv/name, or the name.` }, { status: 400 });
  try {
    const watches = await startWatching(r.db, r.ctx.ownerId, r.ctx.workspace?.id ?? null, logins as string[], await streamAllowance(r.db, r.ctx.ownerId, r.ent));
    return NextResponse.json({ watches });
  } catch (e) {
    return streamError("streams", e);
  }
}
