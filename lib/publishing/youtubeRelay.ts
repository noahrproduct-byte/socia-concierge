// YouTube uploads without a token in the browser.
//
// YouTube's resumable protocol needs `Authorization: Bearer <token>` on every
// chunk and every status query (developers.google.com/youtube/v3/guides/
// using_resumable_upload_protocol, steps 3 and 4), so a browser that PUTs to
// the session itself must hold the channel's access token. Instead:
//
//   1. The adapter opens the session on the server and seals its URI into a
//      handle (AES-256-GCM) bound to the destination and the owner. The
//      browser gets only the handle; it can't read the URI or the token.
//   2. The browser sends each chunk (4 MiB, under Vercel's 4.5 MB request
//      limit, a multiple of the 256 KiB YouTube requires) to
//      PUT /api/posts/:id/destinations/:did/youtube-upload with the handle.
//   3. The server checks who is asking, opens the handle, and forwards the
//      chunk to YouTube with a fresh token. YouTube's answer (bytes received,
//      or the finished video id) goes back to the browser.
//
// Server only.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const CHUNK_ALIGN = 256 * 1024;
/** Every chunk but the last is exactly this size (YouTube wants one size throughout). */
export const RELAY_CHUNK_BYTES = 4 * 1024 * 1024;
/** A handle outlives any one upload run; a retry opens a new session. */
const HANDLE_TTL_MS = 24 * 60 * 60 * 1000;

export type SealedSession = {
  sessionUri: string;
  destinationId: string;
  ownerId: string;
  /** Bytes announced when the session was opened, or null when unknown. */
  total: number | null;
};

/** Only a session on YouTube's own upload endpoint is ever opened or fetched. */
export function isYouTubeSessionUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" && u.hostname === "www.googleapis.com"
      && u.pathname === "/upload/youtube/v3/videos" && Boolean(u.searchParams.get("upload_id"));
  } catch {
    return false;
  }
}

function key(): Buffer | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = k || (process.env.NODE_ENV === "production" ? null : "socia-dev-upload-key");
  return base ? createHash("sha256").update(`socia:youtube-upload-session:v1:${base}`).digest() : null;
}

/** The handle for the browser, or null when the server has no key. */
export function sealSession(s: SealedSession, now: number = Date.now()): string | null {
  const k = key();
  if (!k || !isYouTubeSessionUri(s.sessionUri)) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(JSON.stringify({ ...s, exp: now + HANDLE_TTL_MS }), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** The session behind a handle, only for the destination and owner it was made for. */
export function openSession(handle: string, expect: { destinationId: string; ownerId: string }, now: number = Date.now()): SealedSession | null {
  const k = key();
  if (!k || typeof handle !== "string" || handle.length > 4096) return null;
  try {
    const raw = Buffer.from(handle, "base64url");
    if (raw.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const j = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8")) as SealedSession & { exp: number };
    if (j.destinationId !== expect.destinationId || j.ownerId !== expect.ownerId) return null;
    if (!(j.exp > now) || !isYouTubeSessionUri(j.sessionUri)) return null;
    return { sessionUri: j.sessionUri, destinationId: j.destinationId, ownerId: j.ownerId, total: j.total ?? null };
  } catch {
    return null;
  }
}

export type ChunkRange = { query: true; total: number } | { query: false; start: number; end: number; total: number };

/**
 * `bytes <start>-<end>/<total>` (a chunk) or `bytes *\/<total>` (where did
 * YouTube get to?). A chunk starts on a 256 KiB boundary and is at most
 * RELAY_CHUNK_BYTES; only the last may be shorter than a whole multiple.
 */
export function parseChunkRange(header: string | null, sealedTotal: number | null): ChunkRange | null {
  if (!header) return null;
  const q = header.match(/^bytes \*\/(\d{1,13})$/);
  const m = header.match(/^bytes (\d{1,13})-(\d{1,13})\/(\d{1,13})$/);
  const total = Number(q?.[1] ?? m?.[3]);
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  if (sealedTotal != null && total !== sealedTotal) return null;
  if (q) return { query: true, total };
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  const length = end - start + 1;
  if (start % CHUNK_ALIGN !== 0 || end < start || end >= total || length > RELAY_CHUNK_BYTES) return null;
  if (end !== total - 1 && length % CHUNK_ALIGN !== 0) return null;
  return { query: false, start, end, total };
}

export type RelayAnswer =
  | { kind: "progress"; next: number }
  | { kind: "done"; videoId: string }
  | { kind: "gone" }
  | { kind: "auth"; message: string }
  | { kind: "refused"; message: string }
  | { kind: "retry"; message: string };

/** The next byte after a 308's `Range: bytes=0-N`; 0 when YouTube has nothing yet. */
export function nextByte(range: string | null): number {
  const m = range?.match(/bytes=(\d+)-(\d+)/i);
  return m ? Number(m[2]) + 1 : 0;
}

/** Forward one chunk (or a status query) to the session with the server's token. */
export async function relayChunk(args: {
  sessionUri: string; token: string; range: ChunkRange; body: ArrayBuffer | null; mime: string;
}): Promise<RelayAnswer> {
  if (!isYouTubeSessionUri(args.sessionUri)) return { kind: "refused", message: "That is not a YouTube upload session." };
  const r = args.range;
  const headers: Record<string, string> = { authorization: `Bearer ${args.token}` };
  if (r.query) headers["content-range"] = `bytes */${r.total}`;
  else {
    headers["content-range"] = `bytes ${r.start}-${r.end}/${r.total}`;
    headers["content-type"] = args.mime || "video/*";
  }
  let res: Response;
  try {
    res = await fetch(args.sessionUri, {
      method: "PUT", headers, body: r.query ? undefined : args.body, redirect: "manual",
      signal: AbortSignal.timeout(50_000), cache: "no-store",
    });
  } catch {
    return { kind: "retry", message: "YouTube could not be reached." };
  }
  if (res.status === 308) return { kind: "progress", next: nextByte(res.headers.get("range")) };
  const j = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
  if (res.status === 200 || res.status === 201) {
    return j?.id ? { kind: "done", videoId: j.id } : { kind: "refused", message: "YouTube finished the upload but returned no video id." };
  }
  if (res.status === 404 || res.status === 410) return { kind: "gone" };
  const message = j?.error?.message || `YouTube returned ${res.status}.`;
  if (res.status === 401 || res.status === 403) return { kind: "auth", message };
  if (res.status === 408 || res.status === 429 || res.status >= 500) return { kind: "retry", message };
  return { kind: "refused", message };
}
