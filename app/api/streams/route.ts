import { NextResponse } from "next/server";
import { streamRequest, streamError } from "@/lib/streams/route";
import { readConnection, startWatching, streamState } from "@/lib/streams/server";
import { channelFromInput, MAX_WATCHED } from "@/lib/streams/channels";
import { twitchConfigured } from "@/lib/streams/twitch";

export const runtime = "nodejs";

// Live streams (AI Clipper):
//   GET  -> { configured, connection, watches, clips }
//   POST { channels: string[] } -> start watching these Twitch channels (links or names), up to four at once
export async function GET() {
  const r = await streamRequest();
  if (!r.ok) return r.res;
  try {
    const connection = await readConnection(r.db, r.ctx.ownerId);
    const state = connection ? await streamState(r.db, r.ctx.ownerId) : { watches: [], clips: [] };
    return NextResponse.json({ configured: twitchConfigured(), connection, ...state, maxWatched: MAX_WATCHED });
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
    const watches = await startWatching(r.db, r.ctx.ownerId, r.ctx.workspace?.id ?? null, logins as string[]);
    return NextResponse.json({ watches });
  } catch (e) {
    return streamError("streams", e);
  }
}
