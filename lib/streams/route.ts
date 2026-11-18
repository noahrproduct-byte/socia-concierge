// Request plumbing for the Live streams routes: signed in, on a plan with live
// stream clips, and the database client that may write the stream tables (the
// browser only reads them: supabase/stream-clipper.sql). Server only.
import { NextResponse } from "next/server";
import { aiRequest, isMissingTable } from "@/lib/aiStudio/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { publicMessage } from "@/lib/dbError";
import type { Ctx } from "@/lib/context";
import { STREAM_MIGRATION_HINT, WatchError, streamUsedSeconds } from "./server";
import { canUseFeature, getLimit, type Entitlements } from "@/lib/entitlements";
import type { StreamAllowance } from "./limits";
import { TwitchError } from "./twitch";

export async function streamRequest(opts: { mutate?: boolean } = {}) {
  const r = await aiRequest("stream_clipper", opts);
  if (!r.ok) return r;
  return { ...r, db: (createServiceClient() ?? r.ctx.client) as Ctx["client"] };
}

/** The one answer for anything these routes throw: SOCIA's and Twitch's own sentences pass through, the rest goes to the log. */
export function streamError(where: string, e: unknown): NextResponse {
  if (isMissingTable(e)) return NextResponse.json({ error: STREAM_MIGRATION_HINT, migration: true }, { status: 503 });
  if (e instanceof WatchError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof TwitchError) return NextResponse.json({ error: e.message, twitch: e.kind }, { status: e.kind === "auth" ? 401 : e.kind === "rate" ? 429 : 502 });
  return NextResponse.json({ error: publicMessage(where, e, "SOCIA couldn't do that just now. Try again.") }, { status: 500 });
}

/** What this person's plan allows for Live streams this month, with what they've used. */
export async function streamAllowance(db: Ctx["client"], ownerId: string, ent: Entitlements): Promise<StreamAllowance> {
  const period = ent.period;
  return {
    channels: getLimit(ent, "stream_channels"),
    hoursMonth: getLimit(ent, "stream_hours_month"),
    keepVideo: canUseFeature(ent, "stream_clip_video"),
    usedSeconds: await streamUsedSeconds(db, ownerId, period.start).catch(() => 0),
    periodStart: period.start,
    resetsOn: period.end,
  };
}
