// Browser-side resumable upload of a video to YouTube, through SOCIA.
//
// The server opens the YouTube session and hands the browser only a sealed
// handle (youtubeRelay.ts). Each chunk goes to SOCIA's
// /api/posts/:id/destinations/:did/youtube-upload, which forwards it with the
// channel's token, so no OAuth token ever reaches this code. Chunks are 4 MiB
// (under Vercel's request limit, a multiple of the 256 KiB YouTube requires
// for every chunk but the last). A network drop or a server-side hiccup is
// followed by a progress query and a resume from where YouTube says it is.
//
// Client-safe. Pure helpers are exported for the unit tests.

export const CHUNK_ALIGN = 256 * 1024;
export const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_RETRIES = 5;

export type YouTubeUploadArgs = {
  /** SOCIA's relay route for this destination. */
  endpoint: string;
  /** The sealed session handle from the server. */
  handle: string;
  blob: Blob;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/** The relay route for one destination. */
export const relayEndpoint = (postId: string, destinationId: string) =>
  `/api/posts/${encodeURIComponent(postId)}/destinations/${encodeURIComponent(destinationId)}/youtube-upload`;

/** The inclusive byte range of the chunk that starts at `offset`. */
export function chunkRange(offset: number, total: number, chunk = CHUNK_BYTES): { start: number; end: number; length: number } {
  if (chunk % CHUNK_ALIGN !== 0) throw new Error("Chunk size must be a multiple of 256 KiB.");
  const start = Math.max(0, Math.min(offset, total));
  const end = Math.min(total, start + chunk) - 1;
  return { start, end, length: end - start + 1 };
}

/** The next byte to send after a 308 with `Range: bytes=0-N`; 0 when YouTube has nothing yet. */
export function parseRangeHeader(range: string | null): number {
  if (!range) return 0;
  const m = range.match(/bytes=(\d+)-(\d+)/i);
  if (!m) return 0;
  return Number(m[2]) + 1;
}

export const isAligned = (n: number) => n % CHUNK_ALIGN === 0;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });

const abortError = () => {
  const e = new Error("Upload cancelled.");
  e.name = "AbortError";
  return e;
};

type RelayReply = { next?: number; videoId?: string; error?: string };

/** Worth waiting and asking again: SOCIA or YouTube had a moment, not a verdict. */
const transient = (status: number) => status === 408 || status === 429 || status >= 500;

async function send(args: YouTubeUploadArgs, range: string, body: Blob | null): Promise<{ status: number; reply: RelayReply } | null> {
  try {
    const res = await fetch(args.endpoint, {
      method: "PUT",
      headers: { "x-upload-handle": args.handle, "content-range": range, "content-type": "application/octet-stream" },
      body,
      signal: args.signal,
      credentials: "same-origin",
    });
    return { status: res.status, reply: ((await res.json().catch(() => null)) as RelayReply | null) ?? {} };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw abortError();
    return null;
  }
}

/** Resolves with the YouTube video id once the final chunk is accepted. */
export async function uploadToYouTube(args: YouTubeUploadArgs): Promise<{ videoId: string }> {
  const total = args.blob.size;
  if (!total) throw new Error("The video file is empty.");
  let offset = 0;
  let retries = 0;
  // Progress is reported only from a byte count YouTube sent or from
  // completion: nothing is claimed before a byte has been acknowledged.

  while (true) {
    if (args.signal?.aborted) throw abortError();
    const { start, end } = chunkRange(offset, total);
    const r = await send(args, `bytes ${start}-${end}/${total}`, args.blob.slice(start, end + 1));

    if (r && r.status === 200 && r.reply.videoId) { args.onProgress?.(1); return { videoId: r.reply.videoId }; }
    if (r && r.status === 200 && typeof r.reply.next === "number") {
      offset = r.reply.next;
      retries = 0;
      args.onProgress?.(offset / total);
      continue;
    }
    if (r && !transient(r.status)) throw new Error(r.reply.error || "The upload to YouTube was refused.");

    // Network error or a transient answer: back off, ask where YouTube got to, resume there.
    if (++retries > MAX_RETRIES) throw new Error("The upload to YouTube kept failing. Check your connection and retry.");
    await sleep(Math.min(30000, 1000 * 2 ** (retries - 1)), args.signal);
    const p = await send(args, `bytes */${total}`, null);
    if (p && p.status === 200 && p.reply.videoId) { args.onProgress?.(1); return { videoId: p.reply.videoId }; }
    if (p && p.status === 200 && typeof p.reply.next === "number") { offset = p.reply.next; args.onProgress?.(offset / total); continue; }
    if (p && !transient(p.status)) throw new Error(p.reply.error || "The upload to YouTube was refused.");
    // The progress query itself failed; the loop retries the same chunk.
  }
}

/** Fetch an already-uploaded media file back from its public URL (draft recovery). */
export async function fetchMediaBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch the media file.");
  return await res.blob();
}
