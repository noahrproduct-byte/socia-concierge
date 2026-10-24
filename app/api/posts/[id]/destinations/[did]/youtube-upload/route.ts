import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadItem, MissingTableError, MIGRATION_MESSAGE } from "@/lib/publishing/db";
import { uploadAccess } from "@/lib/publishing/adapters/youtube";
import { openSession, parseChunkRange, relayChunk, RELAY_CHUNK_BYTES } from "@/lib/publishing/youtubeRelay";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 60;

// PUT /api/posts/:id/destinations/:did/youtube-upload: one chunk of a YouTube
// upload (or, with `Content-Range: bytes */<total>`, "how far did YouTube
// get?"). The browser holds only the sealed handle the server gave it; the
// server checks who is asking, forwards the chunk to YouTube with the
// channel's token, and answers with YouTube's byte count or the video id.
// See lib/publishing/youtubeRelay.ts.
//
//   200 { next }       YouTube has bytes 0..next-1; send from `next`
//   200 { videoId }    the upload is finished; report it to /complete
//   410                the session expired; start the upload again
//   4xx { error }      refused; retrying the same chunk will not help
//   502 { error }      YouTube had a moment; ask again, then resume

const err = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; did: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err(401, "Not signed in.");
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return err(403, forbiddenCopy("publish"));
  const { id, did } = await params;

  const session = openSession(req.headers.get("x-upload-handle") ?? "", { destinationId: did, ownerId: ctx.ownerId });
  if (!session) return err(410, "This upload session is no longer valid. Start the upload again.");
  const range = parseChunkRange(req.headers.get("content-range"), session.total);
  if (!range) return err(400, "That chunk is not a valid part of this upload.");

  let item;
  try {
    item = await loadItem(ctx.client, id, ctx.ownerId, ctx.workspace?.id ?? null);
  } catch (e) {
    if (e instanceof MissingTableError) return err(409, MIGRATION_MESSAGE);
    throw e;
  }
  const dest = item?.destinations.find((d) => d.id === did) ?? null;
  if (!item || !dest || dest.platform !== "youtube") return err(404, "Destination not found.");
  if (dest.status !== "uploading" || dest.externalPostId) return err(409, "This destination has no upload in progress.");

  let body: ArrayBuffer | null = null;
  if (!range.query) {
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > RELAY_CHUNK_BYTES) return err(413, "That chunk is too large.");
    body = await req.arrayBuffer().catch(() => null);
    if (!body || body.byteLength !== range.end - range.start + 1) return err(400, "The chunk's size does not match its range.");
  }

  const access = await uploadAccess(ctx.client, ctx.ownerId, dest.accountId);
  if ("failure" in access) return err(409, access.failure.errorMessage ?? "Reconnect YouTube to allow uploads.");

  const media = item.media[0];
  const answer = await relayChunk({ sessionUri: session.sessionUri, token: access.auth.token, range, body, mime: media?.mime ?? "video/*" });
  switch (answer.kind) {
    case "progress": return NextResponse.json({ next: answer.next });
    case "done": return NextResponse.json({ videoId: answer.videoId });
    case "gone": return err(410, "The YouTube upload session expired. Start the upload again.");
    case "auth": return err(409, `Reconnect YouTube to allow uploads. YouTube said: ${answer.message}`);
    case "refused": return err(400, answer.message);
    case "retry": return err(502, answer.message);
  }
}
