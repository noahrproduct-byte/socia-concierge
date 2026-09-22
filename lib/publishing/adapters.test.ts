import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildContainerParams, igRetryable, containerStatus, publishContainer, mediaPermalink } from "../igPublish";
import { youtubeAccessToken } from "../youtubeData";
import { containerPlan, instagramAdapter, pollBudget, POLL_EVERY_MS, MIN_CALL_MS } from "./adapters/instagram";
import {
  buildYouTubeMetadata, statusFromVideo, hasWriteScope, privacyMismatchNote, resumableStartHeaders,
  storageFetchUrl, storageOrigin, readBodyWithin, youtubeAdapter,
} from "./adapters/youtube";
import { chunkRange, parseRangeHeader, isAligned, CHUNK_BYTES, CHUNK_ALIGN } from "./youtubeUpload";
import type { PublishContext } from "./adapter";
import { defaultSettings, type ContentItem, type Destination, type MediaItem, type YouTubeSettings, type InstagramSettings } from "./types";

vi.mock("../youtubeData", () => ({ youtubeAccessToken: vi.fn() }));
vi.mock("../igPublish", async (importOriginal) => {
  const real = await importOriginal<typeof import("../igPublish")>();
  return { ...real, containerStatus: vi.fn(), publishContainer: vi.fn(), mediaPermalink: vi.fn(), publishingLimit: vi.fn() };
});

const MB = 1024 * 1024;
const now = new Date("2026-09-21T12:00:00Z");
const future = "2026-09-22T18:30:00Z";
const image = (id: string): MediaItem => ({ id, kind: "image", name: `${id}.jpg`, mime: "image/jpeg", size: 2 * MB, width: 1080, height: 1350, duration: null, path: `u/${id}.jpg`, url: `https://cdn/${id}.jpg` });
const video: MediaItem = { id: "v1", kind: "video", name: "a.mp4", mime: "video/mp4", size: 40 * MB, width: 1080, height: 1920, duration: 28, path: "u/a.mp4", url: "https://cdn/a.mp4" };

const dest = (over: Partial<Destination> = {}): Destination => ({
  id: "d1", postId: "p1", platform: "youtube", accountId: "UC1", status: "uploading", scheduledAt: null, startedAt: null, publishedAt: null,
  externalPostId: null, externalContainerId: null, permalink: null, errorCode: null, errorMessage: null, retryCount: 0, nextRetryAt: null,
  settings: { ...defaultSettings("youtube"), title: "t", madeForKids: false }, createdAt: now.toISOString(), updatedAt: now.toISOString(), ...over,
});
const item = (media: MediaItem[], destinations: Destination[]): ContentItem => ({
  id: "p1", userId: "u1", caption: "cap", media, scheduledAt: null, status: "publishing", source: "composer", planId: null, planDay: null,
  publishedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), destinations,
});
/** A Supabase stub whose every query answers `row`. */
const supa = (row: unknown) => {
  const q: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "update"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: row, error: null });
  q.then = (res: (v: unknown) => void) => res(undefined);
  return q;
};
const ctxFor = (d: Destination, media: MediaItem[], over: Partial<PublishContext> = {}): PublishContext => ({
  supabase: supa({ ig_user_id: "ig1", access_token: "tok", scopes: ["instagram_business_content_publish"], token_expires_at: null }),
  userId: "u1", item: item(media, [d]), destination: d, budgetMs: 40_000, now, interactive: true, ...over,
});
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("Instagram container parameters", () => {
  it("a Reel sends video_url, share_to_feed, thumb_offset and the AI flag", () => {
    const p = buildContainerParams({ mediaType: "REELS", mediaUrl: "https://cdn/a.mp4", caption: "hi", shareToFeed: false, thumbOffsetMs: 1500, isAiGenerated: true });
    expect(p).toEqual({ media_type: "REELS", video_url: "https://cdn/a.mp4", share_to_feed: "false", thumb_offset: "1500", caption: "hi", is_ai_generated: "true" });
  });
  it("an image sends image_url, alt_text and positioned user_tags, never media_type", () => {
    const p = buildContainerParams({ mediaType: "IMAGE", mediaUrl: "https://cdn/i.jpg", caption: "c", altText: "a dog", userTags: [{ username: "salvo", x: 0.4, y: 0.6 }] });
    expect(p.media_type).toBeUndefined();
    expect(p.image_url).toBe("https://cdn/i.jpg");
    expect(p.alt_text).toBe("a dog");
    expect(JSON.parse(p.user_tags)).toEqual([{ username: "salvo", x: 0.4, y: 0.6 }]);
    expect(p.is_ai_generated).toBeUndefined();
  });
  it("a carousel child carries is_carousel_item and no caption; the parent lists children", () => {
    const child = buildContainerParams({ mediaType: "CAROUSEL_ITEM", mediaUrl: "https://cdn/1.jpg", altText: "one", caption: "ignored" });
    expect(child).toEqual({ image_url: "https://cdn/1.jpg", alt_text: "one", is_carousel_item: "true" });
    const parent = buildContainerParams({ mediaType: "CAROUSEL", children: ["1", "2"], caption: "album" });
    expect(parent).toEqual({ media_type: "CAROUSEL", children: "1,2", caption: "album" });
  });
  it("legacy callers keep the old behaviour (share_to_feed true, caption capped at 2200)", () => {
    const p = buildContainerParams({ mediaType: "REELS", mediaUrl: "u", caption: "x".repeat(2300) });
    expect(p.share_to_feed).toBe("true");
    expect(p.caption).toHaveLength(2200);
  });
  it("plans a carousel as N children then one parent, and a reel as a single container", () => {
    const s: InstagramSettings = { ...defaultSettings("instagram"), format: "carousel", altText: "alt" };
    const plan = containerPlan(s, [image("a"), image("b"), image("c")], "cap");
    expect(plan.children).toHaveLength(3);
    expect(plan.children.every((c) => c.mediaType === "CAROUSEL_ITEM" && c.isCarouselItem && c.altText === "alt")).toBe(true);
    expect(plan.parent.mediaType).toBe("CAROUSEL");
    expect(plan.parent.caption).toBe("cap");
    const reel = containerPlan({ ...defaultSettings("instagram"), format: "reel", coverTimestampMs: 900 }, [video], "cap");
    expect(reel.children).toEqual([]);
    expect(reel.parent).toMatchObject({ mediaType: "REELS", mediaUrl: "https://cdn/a.mp4", thumbOffsetMs: 900 });
  });
  it("only known-transient Instagram codes are retried", () => {
    expect(igRetryable(4)).toBe(true);
    expect(igRetryable(9007)).toBe(true);
    expect(igRetryable(undefined)).toBe(true);
    expect(igRetryable(190)).toBe(false);
    expect(igRetryable(100)).toBe(false);
  });
});

describe("YouTube metadata", () => {
  const base: YouTubeSettings = { ...defaultSettings("youtube"), title: " My video ", madeForKids: false, tags: ["a", " b ", ""], categoryId: "22", language: "en" };
  it("a scheduled video is uploaded private with publishAt", () => {
    const m = buildYouTubeMetadata({ ...base, privacy: "public" }, "desc", future, now);
    expect(m.status.privacyStatus).toBe("private");
    expect(m.status.publishAt).toBe(new Date(future).toISOString());
    expect(m.snippet.title).toBe("My video");
    expect(m.snippet.description).toBe("desc");
    expect(m.snippet.tags).toEqual(["a", "b"]);
    expect(m.snippet.categoryId).toBe("22");
    expect(m.snippet.defaultLanguage).toBe("en");
    expect(m.status.selfDeclaredMadeForKids).toBe(false);
  });
  it("publish-now keeps the chosen visibility and sends no publishAt", () => {
    const m = buildYouTubeMetadata({ ...base, privacy: "unlisted" }, "d", null, now);
    expect(m.status.privacyStatus).toBe("unlisted");
    expect(m.status.publishAt).toBeUndefined();
    const past = buildYouTubeMetadata({ ...base, privacy: "public" }, "d", "2020-01-01T00:00:00Z", now);
    expect(past.status.privacyStatus).toBe("public");
    expect(past.status.publishAt).toBeUndefined();
  });
  it("leaves madeForKids out when it was never chosen and adds recordingDetails only when set", () => {
    const m = buildYouTubeMetadata({ ...base, madeForKids: null, recordingDate: "2026-09-01" }, "d", null, now);
    expect("selfDeclaredMadeForKids" in m.status).toBe(false);
    expect(m.recordingDetails?.recordingDate).toBe(new Date("2026-09-01").toISOString());
    expect(buildYouTubeMetadata(base, "d", null, now).recordingDetails).toBeUndefined();
  });
  it("maps videos.list to destination statuses without inventing", () => {
    expect(statusFromVideo({ id: "x", status: { uploadStatus: "uploaded" } }, now).status).toBe("processing");
    expect(statusFromVideo({ id: "x", status: { uploadStatus: "processed", privacyStatus: "public" } }, now)).toMatchObject({ status: "published", permalink: "https://youtu.be/x" });
    expect(statusFromVideo({ id: "x", status: { uploadStatus: "processed", privacyStatus: "private", publishAt: future } }, now).status).toBe("scheduled");
    const failed = statusFromVideo({ id: "x", status: { uploadStatus: "failed", failureReason: "codec" } }, now);
    expect(failed).toMatchObject({ status: "failed", retryable: false, errorCode: "codec" });
    expect(failed.errorMessage).toContain("codec");
    const rejected = statusFromVideo({ id: "x", status: { uploadStatus: "rejected", rejectionReason: "duplicate" } }, now);
    expect(rejected.errorMessage).toContain("duplicate");
  });
  it("recognises the write scopes", () => {
    expect(hasWriteScope(["https://www.googleapis.com/auth/youtube.readonly"])).toBe(false);
    expect(hasWriteScope(["https://www.googleapis.com/auth/youtube.upload"])).toBe(true);
    expect(hasWriteScope(null)).toBe(false);
  });
  it("a processed video whose visibility is not the chosen one is published with a note", () => {
    const processed = { id: "x", status: { uploadStatus: "processed", privacyStatus: "private" } };
    const out = statusFromVideo(processed, now, "public");
    expect(out.status).toBe("published");
    expect(out.externalPostId).toBe("x");
    expect(out.errorMessage).toBe("YouTube lists this video as private, not public. Until Google completes its audit of SOCIA, uploads stay private.");
    expect(privacyMismatchNote("unlisted", "public")).toBe("YouTube lists this video as unlisted, not public.");
    expect(statusFromVideo(processed, now, "private").errorMessage).toBeNull();
    expect(statusFromVideo({ id: "x", status: { uploadStatus: "processed", privacyStatus: "public" } }, now, "public").errorMessage).toBeNull();
    // A private video with a future publishAt is YouTube's own schedule, not a mismatch.
    expect(statusFromVideo({ id: "x", status: { uploadStatus: "processed", privacyStatus: "private", publishAt: future } }, now, "public").status).toBe("scheduled");
    // Once publishAt has passed and the video is still private, the note says so.
    expect(statusFromVideo({ id: "x", status: { uploadStatus: "processed", privacyStatus: "private", publishAt: "2026-09-20T00:00:00Z" } }, now, "public").errorMessage).toContain("not public");
  });
});

describe("YouTube resumable session start", () => {
  it("sends the byte count only when the size is known", () => {
    expect(resumableStartHeaders({ mime: "video/mp4", size: 40 * MB })["x-upload-content-length"]).toBe(String(40 * MB));
    expect("x-upload-content-length" in resumableStartHeaders({ mime: "", size: null })).toBe(false);
    expect("x-upload-content-length" in resumableStartHeaders({ mime: "video/mp4", size: 0 })).toBe(false);
    expect(resumableStartHeaders({ mime: "", size: null })["x-upload-content-type"]).toBe("video/*");
  });
});

describe("YouTube thumbnail source", () => {
  it("only fetches from the project's own storage, rebuilt from the object path", () => {
    const origin = storageOrigin({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/" });
    expect(origin).toBe("https://abc.supabase.co");
    expect(storageFetchUrl({ path: "u1/a b.jpg", url: "https://evil.example/x.jpg" }, origin)).toBe("https://abc.supabase.co/storage/v1/object/public/scheduled-media/u1/a%20b.jpg");
    expect(storageFetchUrl({ path: null, url: "https://abc.supabase.co/storage/v1/object/public/scheduled-media/u1/a.jpg" }, origin)).toBe("https://abc.supabase.co/storage/v1/object/public/scheduled-media/u1/a.jpg");
    expect(storageFetchUrl({ path: null, url: "https://evil.example/x.jpg" }, origin)).toBeNull();
    expect(storageFetchUrl({ path: "u1/a.jpg", url: null }, null)).toBeNull();
    expect(storageOrigin({})).toBeNull();
  });
  it("caps the download by the real body, not the declared size", async () => {
    const small = new Response(new Uint8Array(10), { headers: { "content-length": "10" } });
    expect((await readBodyWithin(small, 50))?.byteLength).toBe(10);
    const declaredBig = new Response(new Uint8Array(10), { headers: { "content-length": String(60) } });
    expect(await readBodyWithin(declaredBig, 50)).toBeNull();
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new Uint8Array(30)); c.enqueue(new Uint8Array(30)); c.close(); },
    });
    expect(await readBodyWithin(new Response(stream), 50)).toBeNull();
  });
});

describe("YouTube complete()", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.mocked(youtubeAccessToken).mockResolvedValue({ token: "tok", channelId: "UC1", scopes: ["https://www.googleapis.com/auth/youtube.upload"] });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the video id when the confirmation call fails, so the row is polled instead of re-uploaded", async () => {
    fetchMock.mockResolvedValueOnce(json(503, { error: { code: 503, message: "Backend Error", errors: [{ reason: "backendError" }] } }));
    const out = await youtubeAdapter.complete!(ctxFor(dest(), [video]), { externalPostId: "vid1" });
    expect(out).toMatchObject({ status: "failed", retryable: true, externalPostId: "vid1" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await youtubeAdapter.complete!(ctxFor(dest(), [video]), { externalPostId: "vid1" })).toMatchObject({ status: "failed", retryable: true, externalPostId: "vid1" });
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 401, message: "Invalid Credentials", errors: [{ reason: "authError" }] } }));
    const auth = await youtubeAdapter.complete!(ctxFor(dest(), [video]), { externalPostId: "vid1" });
    expect(auth).toMatchObject({ status: "failed", retryable: false, externalPostId: "vid1" });
  });
  it("not_found and channel_mismatch stay id-less and final", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [] }));
    const missing = await youtubeAdapter.complete!(ctxFor(dest(), [video]), { externalPostId: "vid1" });
    expect(missing).toMatchObject({ status: "failed", retryable: false, errorCode: "not_found" });
    expect(missing.externalPostId).toBeUndefined();
    fetchMock.mockResolvedValueOnce(json(200, { items: [{ id: "vid1", snippet: { channelId: "UC-other" }, status: { uploadStatus: "processed" } }] }));
    const other = await youtubeAdapter.complete!(ctxFor(dest(), [video]), { externalPostId: "vid1" });
    expect(other).toMatchObject({ status: "failed", retryable: false, errorCode: "channel_mismatch" });
    expect(other.externalPostId).toBeUndefined();
  });
  it("passes the chosen privacy through so an audit-private upload is published with the note", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [{ id: "vid1", snippet: { channelId: "UC1" }, status: { uploadStatus: "processed", privacyStatus: "private" } }] }));
    const out = await youtubeAdapter.complete!(ctxFor(dest(), [video]), { externalPostId: "vid1" });
    expect(out).toMatchObject({ status: "published", externalPostId: "vid1", permalink: "https://youtu.be/vid1" });
    expect(out.errorMessage).toContain("YouTube lists this video as private, not public.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("never opens a second session for a destination that already holds a video id", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [{ id: "vid1", snippet: { channelId: "UC1" }, status: { uploadStatus: "uploaded" } }] }));
    const out = await youtubeAdapter.publish(ctxFor(dest({ externalPostId: "vid1", status: "scheduled" }), [video]));
    expect(out).toMatchObject({ status: "processing", externalPostId: "vid1" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/youtube/v3/videos?part=");
  });
});

describe("Instagram poll budget", () => {
  it("bounds each call by what is left and stops waiting when a sleep plus a call no longer fit", () => {
    expect(pollBudget(0, 40_000)).toEqual({ callTimeoutMs: 20_000, callFits: true, waitAgain: true });
    expect(pollBudget(30_000, 40_000)).toEqual({ callTimeoutMs: 10_000, callFits: true, waitAgain: true });
    expect(pollBudget(32_000, 40_000).waitAgain).toBe(false);
    expect(pollBudget(36_000, 40_000)).toMatchObject({ callTimeoutMs: 4_000, callFits: false, waitAgain: false });
    expect(pollBudget(45_000, 40_000).callTimeoutMs).toBe(1);
    expect(POLL_EVERY_MS + MIN_CALL_MS).toBe(9_000);
  });

  const igDest = (over: Partial<Destination> = {}) =>
    dest({ platform: "instagram", accountId: "ig1", status: "processing", externalContainerId: "c1", settings: { ...defaultSettings("instagram"), format: "image" }, ...over });
  beforeEach(() => {
    vi.mocked(containerStatus).mockReset();
    vi.mocked(publishContainer).mockReset();
    vi.mocked(mediaPermalink).mockReset();
  });

  it("returns processing without a call when the budget cannot hold one, and without sleeping when a wait would not fit", async () => {
    vi.mocked(containerStatus).mockResolvedValue({ ok: true, value: { status_code: "IN_PROGRESS" } });
    const none = await instagramAdapter.poll(ctxFor(igDest(), [image("a")], { budgetMs: 3_000 }));
    expect(none).toMatchObject({ status: "processing", externalContainerId: "c1" });
    expect(containerStatus).not.toHaveBeenCalled();
    const started = Date.now();
    const one = await instagramAdapter.poll(ctxFor(igDest(), [image("a")], { budgetMs: 6_000 }));
    expect(one).toMatchObject({ status: "processing", externalContainerId: "c1" });
    expect(containerStatus).toHaveBeenCalledTimes(1);
    expect(vi.mocked(containerStatus).mock.calls[0][2]).toBeInstanceOf(AbortSignal);
    expect(Date.now() - started).toBeLessThan(POLL_EVERY_MS);
  });
  it("a PUBLISHED container never writes explicit nulls over a stored id or permalink", async () => {
    vi.mocked(containerStatus).mockResolvedValue({ ok: true, value: { status_code: "PUBLISHED" } });
    const unknown = await instagramAdapter.poll(ctxFor(igDest(), [image("a")]));
    expect(unknown).toMatchObject({ status: "published", externalContainerId: "c1" });
    expect("externalPostId" in unknown).toBe(false);
    expect("permalink" in unknown).toBe(false);
    vi.mocked(containerStatus).mockClear();
    const known = await instagramAdapter.poll(ctxFor(igDest({ externalPostId: "m1", permalink: "https://instagram.com/p/x" }), [image("a")]));
    expect(known).toMatchObject({ status: "published", externalPostId: "m1", permalink: "https://instagram.com/p/x" });
    expect(containerStatus).not.toHaveBeenCalled();
  });
  it("a FINISHED container is published with a bounded call and the permalink key only when known", async () => {
    vi.mocked(containerStatus).mockResolvedValue({ ok: true, value: { status_code: "FINISHED" } });
    vi.mocked(publishContainer).mockResolvedValue({ ok: true, value: { id: "m9" } });
    vi.mocked(mediaPermalink).mockResolvedValue(null);
    const out = await instagramAdapter.poll(ctxFor(igDest(), [image("a")]));
    expect(out).toMatchObject({ status: "published", externalPostId: "m9", externalContainerId: "c1" });
    expect("permalink" in out).toBe(false);
    expect(vi.mocked(publishContainer).mock.calls[0][3]).toBeInstanceOf(AbortSignal);
  });
});

describe("YouTube resumable chunk math", () => {
  it("chunks are 8 MiB, a multiple of 256 KiB, and the last one is shorter", () => {
    expect(isAligned(CHUNK_BYTES)).toBe(true);
    expect(CHUNK_BYTES % CHUNK_ALIGN).toBe(0);
    const total = 20 * MB + 123;
    expect(chunkRange(0, total)).toEqual({ start: 0, end: 8 * MB - 1, length: 8 * MB });
    expect(chunkRange(8 * MB, total)).toEqual({ start: 8 * MB, end: 16 * MB - 1, length: 8 * MB });
    expect(chunkRange(16 * MB, total)).toEqual({ start: 16 * MB, end: total - 1, length: 4 * MB + 123 });
  });
  it("a 308 Range header resumes at the byte after the last received", () => {
    expect(parseRangeHeader("bytes=0-524287")).toBe(524288);
    expect(parseRangeHeader(null)).toBe(0);
    expect(parseRangeHeader("garbage")).toBe(0);
  });
});
