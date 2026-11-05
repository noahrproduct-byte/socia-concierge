import { describe, it, expect, vi } from "vitest";
import { VizardClipper, parseVizardQuery, vizardCreateBody } from "./vizard";
import { DEFAULT_CLIPPER_OPTIONS } from "./provider";

describe("vizard request body", () => {
  it("maps SOCIA's options onto Vizard's fields", () => {
    const b = vizardCreateBody({ kind: "youtube", url: "https://youtu.be/abc123xyz" }, { ...DEFAULT_CLIPPER_OPTIONS, maxClips: 7, lengths: ["under30", "60to90"], captions: false, clipModel: "clip_v2" });
    expect(b).toMatchObject({ videoUrl: "https://youtu.be/abc123xyz", videoType: 2, lang: "en", preferLength: [1, 3], maxClipNumber: 7, subtitleSwitch: 0, headlineSwitch: 1, ratioOfClip: 1, clipModel: "clip_v2" });
    expect(b.ext).toBeUndefined();
  });
  it("sends the extension for a remote file and auto length as [0]", () => {
    const b = vizardCreateBody({ kind: "url", url: "https://x.test/a.mov", ext: "mov" }, { ...DEFAULT_CLIPPER_OPTIONS, lengths: ["auto"] });
    expect(b).toMatchObject({ videoType: 1, ext: "mov", preferLength: [0] });
  });
});

describe("vizard query answer", () => {
  it("is processing on 1000 and on anything unknown", () => {
    expect(parseVizardQuery({ code: 1000 })).toEqual({ status: "processing" });
    expect(parseVizardQuery({})).toEqual({ status: "processing" });
  });
  it("reads the clips on 2000, with the score as a number and topics parsed", () => {
    const r = parseVizardQuery({ code: 2000, projectId: 1, videos: [{ videoId: 14015572, videoUrl: "https://cdn/v.mp4", videoMsDuration: 80400, title: "T", transcript: "hi", viralScore: "8.5", viralReason: "why", relatedTopic: "[\"ai\",\"video\"]" }, { videoId: 2 }] });
    expect(r.status).toBe("done");
    if (r.status !== "done") return;
    expect(r.clips).toHaveLength(1);
    expect(r.clips[0]).toMatchObject({ id: "14015572", videoUrl: "https://cdn/v.mp4", durationMs: 80400, title: "T", score: 8.5, scoreReason: "why", transcript: "hi", relatedTopics: ["ai", "video"] });
  });
  it("names the failure for a 4xxx code", () => {
    expect(parseVizardQuery({ code: 4007 })).toMatchObject({ status: "failed", code: "4007" });
    expect(parseVizardQuery({ code: 4002 })).toMatchObject({ status: "failed" });
  });
});

describe("VizardClipper", () => {
  it("sends the key header and returns the project id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 2000, projectId: 17861706 }), { status: 200 })) as unknown as typeof fetch;
    const c = new VizardClipper("k-123", fetchImpl);
    const r = await c.submitJob({ kind: "youtube", url: "https://youtu.be/abc123xyz" }, DEFAULT_CLIPPER_OPTIONS);
    expect(r.providerJobId).toBe("17861706");
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toContain("/project/create");
    expect((init.headers as Record<string, string>).VIZARDAI_API_KEY).toBe("k-123");
  });
  it("turns a 4007 on create into a non-retryable error and a 429 into a retryable one", async () => {
    const c1 = new VizardClipper("k", (async () => new Response(JSON.stringify({ code: 4007 }), { status: 200 })) as unknown as typeof fetch);
    await expect(c1.submitJob({ kind: "youtube", url: "u" }, DEFAULT_CLIPPER_OPTIONS)).rejects.toMatchObject({ code: "4007", retryable: false });
    const c2 = new VizardClipper("k", (async () => new Response("busy", { status: 429 })) as unknown as typeof fetch);
    await expect(c2.submitJob({ kind: "youtube", url: "u" }, DEFAULT_CLIPPER_OPTIONS)).rejects.toMatchObject({ retryable: true });
  });
  it("refuses without a key", async () => {
    const c = new VizardClipper("");
    await expect(c.getJobStatus("1")).rejects.toMatchObject({ code: "not_configured" });
  });
});
