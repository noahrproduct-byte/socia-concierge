import { describe, it, expect } from "vitest";
import { cleanOptions, youtubeMinutes, YOUTUBE_RE } from "./server";
import { priceGeneration } from "@/lib/generation/server";

describe("clipper options", () => {
  it("keeps good values and replaces bad ones with the defaults", () => {
    expect(cleanOptions({ maxClips: 99, lengths: ["under30", "nope", "under30"], captions: false, lang: "fr", clipModel: "clip_v2" })).toEqual({ maxClips: 20, lengths: ["under30"], captions: false, headline: true, lang: "fr", clipModel: "clip_v2" });
    expect(cleanOptions(null)).toEqual({ maxClips: 5, lengths: ["under30", "30to60"], captions: true, headline: true, lang: "en", clipModel: "clip_v1" });
    expect(cleanOptions({ maxClips: 0, lang: "english" }).maxClips).toBe(1);
    expect(cleanOptions({ lang: "english" }).lang).toBe("en");
  });
  it("recognises YouTube links only", () => {
    for (const u of ["https://www.youtube.com/watch?v=OqLfw-TzzfI", "https://youtu.be/OqLfw-TzzfI", "https://youtube.com/shorts/abcdefgh"]) expect(YOUTUBE_RE.test(u), u).toBe(true);
    for (const u of ["https://vimeo.com/1", "https://example.com/youtube.com/watch?v=x", "not a url"]) expect(YOUTUBE_RE.test(u), u).toBe(false);
  });
  it("reads a video's length from the watch page, rounded up to the minute", async () => {
    const html = `<html>... "lengthSeconds":"754" ...</html>`;
    expect(await youtubeMinutes("https://youtu.be/x", (async () => new Response(html, { status: 200 })) as unknown as typeof fetch)).toBe(13);
    expect(await youtubeMinutes("https://youtu.be/x", (async () => new Response("nothing", { status: 200 })) as unknown as typeof fetch)).toBeNull();
    expect(await youtubeMinutes("https://youtu.be/x", (async () => new Response("", { status: 404 })) as unknown as typeof fetch)).toBeNull();
  });
});

describe("generation pricing", () => {
  it("prices only lengths the model offers", () => {
    expect(priceGeneration({ kind: "text_to_video", modelId: "hailuo-2.3-standard", durationSec: 6 })).toBeGreaterThan(0);
    expect(priceGeneration({ kind: "text_to_video", modelId: "hailuo-2.3-standard", durationSec: 7 })).toBeNull();
    expect(priceGeneration({ kind: "text_to_video", modelId: "hailuo-2.3-standard" })).toBe(priceGeneration({ kind: "text_to_video", modelId: "hailuo-2.3-standard", durationSec: 6 }));
    expect(priceGeneration({ kind: "text_to_image", modelId: "soul-2-standard" })).toBeGreaterThan(0);
    expect(priceGeneration({ kind: "text_to_image", modelId: "hailuo-2.3-standard" })).toBeNull();
  });
});
