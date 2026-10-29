import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadToYouTube, relayEndpoint, CHUNK_BYTES } from "./youtubeUpload";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("the browser uploader", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("talks only to SOCIA, carries no token, and resumes where YouTube got to", async () => {
    const blob = new Blob([new Uint8Array(CHUNK_BYTES + 10)]);
    const endpoint = relayEndpoint("p1", "d1");
    fetchMock
      .mockResolvedValueOnce(ok({ next: CHUNK_BYTES }))
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(ok({ next: CHUNK_BYTES }))
      .mockResolvedValueOnce(ok({ videoId: "vid1" }));
    const progress: number[] = [];
    const run = uploadToYouTube({ endpoint, handle: "sealed", blob, onProgress: (f) => progress.push(f) });
    await vi.runAllTimersAsync();
    expect(await run).toEqual({ videoId: "vid1" });

    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe("/api/posts/p1/destinations/d1/youtube-upload");
      const h = init!.headers as Record<string, string>;
      expect(Object.keys(h).map((k) => k.toLowerCase())).not.toContain("authorization");
      expect(h["x-upload-handle"]).toBe("sealed");
    }
    const ranges = fetchMock.mock.calls.map(([, i]) => (i!.headers as Record<string, string>)["content-range"]);
    expect(ranges).toEqual([
      `bytes 0-${CHUNK_BYTES - 1}/${CHUNK_BYTES + 10}`,
      `bytes ${CHUNK_BYTES}-${CHUNK_BYTES + 9}/${CHUNK_BYTES + 10}`,
      `bytes */${CHUNK_BYTES + 10}`,
      `bytes ${CHUNK_BYTES}-${CHUNK_BYTES + 9}/${CHUNK_BYTES + 10}`,
    ]);
    expect(progress.at(-1)).toBe(1);
  });

  it("stops on a refusal instead of retrying it", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "This upload session is no longer valid." }), { status: 410 }));
    await expect(uploadToYouTube({ endpoint: "/x", handle: "h", blob: new Blob([new Uint8Array(5)]) })).rejects.toThrow("no longer valid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
