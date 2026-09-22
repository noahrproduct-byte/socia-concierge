// Browser-side resumable upload of a video to a YouTube upload session.
//
// The server opens the session (adapters/youtube.ts) and hands the browser its
// URI; the file itself goes straight from the browser to YouTube in 8 MiB
// chunks (a multiple of the 256 KiB YouTube requires for every chunk but the
// last). A 308 carries the bytes YouTube has so far; a network drop or 5xx is
// followed by a progress query and a resume from where YouTube says it is.
//
// Client-safe. Pure helpers are exported for the unit tests.

export const CHUNK_ALIGN = 256 * 1024;
export const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RETRIES = 5;

export type YouTubeUploadArgs = {
  sessionUri: string;
  accessToken: string;
  blob: Blob;
  mime: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

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

async function readError(res: Response): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return j?.error?.message || `YouTube returned ${res.status}.`;
}

/** Ask the session how much it has: 308 -> offset, 200/201 -> finished, 404/410 -> gone. */
async function queryProgress(args: YouTubeUploadArgs, total: number): Promise<{ offset: number } | { done: { videoId: string } }> {
  const res = await fetch(args.sessionUri, {
    method: "PUT",
    headers: { authorization: `Bearer ${args.accessToken}`, "content-range": `bytes */${total}` },
    signal: args.signal,
  });
  if (res.status === 308) return { offset: parseRangeHeader(res.headers.get("range")) };
  if (res.status === 200 || res.status === 201) {
    const j = (await res.json().catch(() => null)) as { id?: string } | null;
    if (j?.id) return { done: { videoId: j.id } };
    throw new Error("YouTube finished the upload but returned no video id.");
  }
  if (res.status === 404 || res.status === 410) throw new Error("The YouTube upload session expired. Start the upload again.");
  throw new Error(await readError(res));
}

/** Resolves with the YouTube video id once the final chunk is accepted. */
export async function uploadToYouTube(args: YouTubeUploadArgs): Promise<{ videoId: string }> {
  const total = args.blob.size;
  if (!total) throw new Error("The video file is empty.");
  let offset = 0;
  let retries = 0;
  // Progress is reported only from a Range header YouTube sent or from
  // completion: nothing is claimed before a byte has been acknowledged.

  while (true) {
    if (args.signal?.aborted) throw abortError();
    const { start, end } = chunkRange(offset, total);
    let res: Response | null = null;
    try {
      // The browser sets Content-Length from the body; setting it by hand is not allowed.
      res = await fetch(args.sessionUri, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${args.accessToken}`,
          "content-type": args.mime || "video/*",
          "content-range": `bytes ${start}-${end}/${total}`,
        },
        body: args.blob.slice(start, end + 1),
        signal: args.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw abortError();
      res = null;
    }

    if (res && res.status === 308) {
      offset = parseRangeHeader(res.headers.get("range"));
      retries = 0;
      args.onProgress?.(offset / total);
      continue;
    }
    if (res && (res.status === 200 || res.status === 201)) {
      const j = (await res.json().catch(() => null)) as { id?: string } | null;
      if (!j?.id) throw new Error("YouTube finished the upload but returned no video id.");
      args.onProgress?.(1);
      return { videoId: j.id };
    }
    if (res && res.status === 404) throw new Error("The YouTube upload session expired. Start the upload again.");
    if (res && res.status >= 400 && res.status < 500) throw new Error(await readError(res));

    // Network error or 5xx: back off, ask where YouTube got to, resume there.
    if (++retries > MAX_RETRIES) throw new Error("The upload to YouTube kept failing. Check your connection and retry.");
    await sleep(Math.min(30000, 1000 * 2 ** (retries - 1)), args.signal);
    try {
      const p = await queryProgress(args, total);
      if ("done" in p) { args.onProgress?.(1); return p.done; }
      offset = p.offset;
      args.onProgress?.(offset / total);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      if (e instanceof Error && /expired|returned no video id/.test(e.message)) throw e;
      // The progress query itself failed; the loop retries the same chunk.
    }
  }
}

/** Fetch an already-uploaded media file back from its public URL (draft recovery). */
export async function fetchMediaBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch the media file.");
  return await res.blob();
}
