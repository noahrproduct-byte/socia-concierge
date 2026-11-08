import { describe, it, expect } from "vitest";
import { cleanOptions, measureSourceMinutes, YOUTUBE_RE } from "./server";
import { priceGeneration } from "@/lib/generation/server";
import { transcriptionLanguage } from "./provider";

describe("clipper options", () => {
  it("keeps good values and replaces bad ones with the defaults", () => {
    expect(cleanOptions({ maxClips: 99, lengths: ["under30", "nope", "under30"], captions: false, lang: "fr", clipModel: "clip_v2" })).toEqual({ maxClips: 20, lengths: ["under30"], captions: false, headline: true, lang: "fr", clipModel: "clip_v2", clipType: "best" });
    expect(cleanOptions(null)).toEqual({ maxClips: 5, lengths: ["under30", "30to60"], captions: true, headline: true, lang: "en", clipModel: "clip_v1", clipType: "best" });
    expect(cleanOptions({ maxClips: 0, lang: "english" }).maxClips).toBe(1);
    expect(cleanOptions({ lang: "english" }).lang).toBe("en");
    expect(cleanOptions({ clipType: "nope" }).clipType).toBe("best");
    expect(cleanOptions({ clipType: "takes", maxClips: 12 })).toMatchObject({ clipType: "takes", maxClips: 12 });
    expect(cleanOptions({ clipType: "ranking", maxClips: 12 }).maxClips).toBe(5);
    expect(cleanOptions({ clipType: "ranking", maxClips: 1 }).maxClips).toBe(3);
    expect(cleanOptions({ clipType: "trailer", maxClips: 20 }).maxClips).toBe(8);
  });
  it("asks for the language chosen, English by default, and only detects when told to", () => {
    expect(transcriptionLanguage("en")).toBe("en");
    expect(transcriptionLanguage("ur")).toBe("ur");
    expect(transcriptionLanguage("")).toBe("en");
    expect(transcriptionLanguage(undefined)).toBe("en");
    expect(transcriptionLanguage("auto")).toBeNull();
    expect(cleanOptions({ lang: "auto" }).lang).toBe("auto");
    expect(cleanOptions({}).lang).toBe("en");
  });
  it("keeps the uploaded file's name for the job list, cleaned and short", () => {
    expect(cleanOptions({ sourceName: "  Talk\u0000 one.mp4 " }).sourceName).toBe("Talk one.mp4");
    expect(cleanOptions({ sourceName: "x".repeat(300) }).sourceName).toHaveLength(120);
    expect(cleanOptions({}).sourceName).toBeUndefined();
    expect(cleanOptions({ sourceName: 7 }).sourceName).toBeUndefined();
  });
  it("recognises YouTube links only", () => {
    for (const u of ["https://www.youtube.com/watch?v=OqLfw-TzzfI", "https://youtu.be/OqLfw-TzzfI", "https://youtube.com/shorts/abcdefgh"]) expect(YOUTUBE_RE.test(u), u).toBe(true);
    for (const u of ["https://vimeo.com/1", "https://example.com/youtube.com/watch?v=x", "not a url"]) expect(YOUTUBE_RE.test(u), u).toBe(false);
  });
});

describe("pricing a clip job from the video's real length", () => {
  const fake = (seconds: number | null, readable = true) => ({ youtube: async () => seconds, file: async () => seconds, readable: async () => readable });
  const svc = { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://storage.example/x.mp4" }, error: null }) }) } };

  it("rounds the measured length up to the minute, whatever the person typed", async () => {
    expect(await measureSourceMinutes(svc, { kind: "upload", url: "u/clipper-sources/a.mp4", path: "u/clipper-sources/a.mp4" }, fake(754))).toBe(13);
    expect(await measureSourceMinutes(svc, { kind: "youtube", url: "https://youtu.be/OqLfw-TzzfI" }, fake(60))).toBe(1);
  });

  it("refuses a video it can't measure instead of trusting a typed length", async () => {
    await expect(measureSourceMinutes(svc, { kind: "youtube", url: "https://youtu.be/OqLfw-TzzfI" }, fake(null))).rejects.toMatchObject({ code: "no_length" });
    await expect(measureSourceMinutes(svc, { kind: "url", url: "https://cdn.example.com/talk.mp4" }, fake(null))).rejects.toMatchObject({ code: "no_length" });
  });

  it("refuses links it may not read, and videos over the limit instead of pricing them at the cap", async () => {
    await expect(measureSourceMinutes(svc, { kind: "url", url: "https://10.0.0.5/talk.mp4" }, fake(60, false))).rejects.toMatchObject({ code: "bad_link" });
    await expect(measureSourceMinutes(svc, { kind: "upload", url: "u/clipper-sources/a.mp4", path: "u/clipper-sources/a.mp4" }, fake(601 * 60))).rejects.toMatchObject({ code: "too_long" });
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
