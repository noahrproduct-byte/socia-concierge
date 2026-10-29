import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isYouTubeSessionUri, nextByte, openSession, parseChunkRange, relayChunk, sealSession, RELAY_CHUNK_BYTES, CHUNK_ALIGN } from "./youtubeRelay";

const URI = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc123";
const MB = 1024 * 1024;
const s = { sessionUri: URI, destinationId: "d1", ownerId: "o1", total: 10 * MB };

describe("the sealed upload handle", () => {
  it("opens only for the destination and owner it was sealed for", () => {
    const h = sealSession(s)!;
    expect(h).toBeTruthy();
    expect(h).not.toContain("abc123");
    expect(openSession(h, { destinationId: "d1", ownerId: "o1" })).toEqual(s);
    expect(openSession(h, { destinationId: "d1", ownerId: "someone-else" })).toBeNull();
    expect(openSession(h, { destinationId: "other-destination", ownerId: "o1" })).toBeNull();
  });

  it("refuses a tampered, foreign or expired handle", () => {
    const h = sealSession(s, 1_000)!;
    const flipped = Buffer.from(h, "base64url");
    flipped[flipped.length - 1] ^= 1;
    expect(openSession(flipped.toString("base64url"), { destinationId: "d1", ownerId: "o1" }, 2_000)).toBeNull();
    expect(openSession("not-a-handle", { destinationId: "d1", ownerId: "o1" })).toBeNull();
    expect(openSession(h, { destinationId: "d1", ownerId: "o1" }, 2_000)).not.toBeNull();
    expect(openSession(h, { destinationId: "d1", ownerId: "o1" }, 1_000 + 25 * 60 * 60 * 1000)).toBeNull();
  });

  it("is never made for anything but YouTube's upload endpoint", () => {
    expect(isYouTubeSessionUri(URI)).toBe(true);
    for (const bad of [
      "http://www.googleapis.com/upload/youtube/v3/videos?upload_id=x",
      "https://evil.example/upload/youtube/v3/videos?upload_id=x",
      "https://www.googleapis.com.evil.example/upload/youtube/v3/videos?upload_id=x",
      "https://www.googleapis.com/upload/drive/v3/files?upload_id=x",
      "https://www.googleapis.com/upload/youtube/v3/videos",
    ]) {
      expect(isYouTubeSessionUri(bad)).toBe(false);
      expect(sealSession({ ...s, sessionUri: bad })).toBeNull();
    }
  });
});

describe("chunk ranges the relay accepts", () => {
  const total = 10 * MB + 5;
  it("accepts aligned 4 MiB chunks, a short last chunk, and a status query", () => {
    expect(parseChunkRange(`bytes 0-${4 * MB - 1}/${total}`, total)).toEqual({ query: false, start: 0, end: 4 * MB - 1, total });
    expect(parseChunkRange(`bytes ${8 * MB}-${total - 1}/${total}`, total)).toMatchObject({ query: false });
    expect(parseChunkRange(`bytes */${total}`, total)).toEqual({ query: true, total });
    expect(parseChunkRange(`bytes */${total}`, null)).toEqual({ query: true, total });
  });
  it("refuses oversize, misaligned, out-of-range or mismatched chunks", () => {
    expect(parseChunkRange(`bytes 0-${RELAY_CHUNK_BYTES}/${total}`, total)).toBeNull();
    expect(parseChunkRange(`bytes 1-${CHUNK_ALIGN}/${total}`, total)).toBeNull();
    expect(parseChunkRange(`bytes 0-${CHUNK_ALIGN + 9}/${total}`, total)).toBeNull();
    expect(parseChunkRange(`bytes 0-${total}/${total}`, total)).toBeNull();
    expect(parseChunkRange(`bytes 0-${CHUNK_ALIGN - 1}/${total + 1}`, total)).toBeNull();
    expect(parseChunkRange("bytes 0-1/0", null)).toBeNull();
    expect(parseChunkRange(null, total)).toBeNull();
  });
});

describe("relayChunk", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
  afterEach(() => vi.unstubAllGlobals());
  const range = { query: false as const, start: 0, end: CHUNK_ALIGN - 1, total: 2 * CHUNK_ALIGN };

  it("adds the server's token and maps YouTube's answers", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 308, headers: { range: `bytes=0-${CHUNK_ALIGN - 1}` } }));
    expect(await relayChunk({ sessionUri: URI, token: "srv-token", range, body: new ArrayBuffer(CHUNK_ALIGN), mime: "video/mp4" })).toEqual({ kind: "progress", next: CHUNK_ALIGN });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URI);
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer srv-token");
    expect((init!.headers as Record<string, string>)["content-range"]).toBe(`bytes 0-${CHUNK_ALIGN - 1}/${2 * CHUNK_ALIGN}`);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "vid9" }), { status: 200 }));
    expect(await relayChunk({ sessionUri: URI, token: "t", range, body: null, mime: "" })).toEqual({ kind: "done", videoId: "vid9" });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await relayChunk({ sessionUri: URI, token: "t", range, body: null, mime: "" })).kind).toBe("gone");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Invalid Credentials" } }), { status: 401 }));
    expect(await relayChunk({ sessionUri: URI, token: "t", range, body: null, mime: "" })).toEqual({ kind: "auth", message: "Invalid Credentials" });
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    expect((await relayChunk({ sessionUri: URI, token: "t", range, body: null, mime: "" })).kind).toBe("retry");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await relayChunk({ sessionUri: URI, token: "t", range, body: null, mime: "" })).kind).toBe("retry");
  });

  it("sends a status query with no body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 308 }));
    expect(await relayChunk({ sessionUri: URI, token: "t", range: { query: true, total: 99 }, body: null, mime: "" })).toEqual({ kind: "progress", next: 0 });
    expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>)["content-range"]).toBe("bytes */99");
    expect(fetchMock.mock.calls[0][1]!.body).toBeUndefined();
  });

  it("never sends the token anywhere but YouTube", async () => {
    expect((await relayChunk({ sessionUri: "https://evil.example/x?upload_id=1", token: "t", range, body: null, mime: "" })).kind).toBe("refused");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads YouTube's Range header", () => {
    expect(nextByte("bytes=0-524287")).toBe(524288);
    expect(nextByte(null)).toBe(0);
  });
});
