import { describe, it, expect } from "vitest";
import {
  planChunks, chunkRange, buildPostInfo, statusFromFetch, describeFailReason, permalinkFor, canUpload, canPublishDirect, parseTikTokJson,
  MIN_CHUNK, MAX_CHUNK, INBOX_NOTE,
} from "./adapters/tiktok";
import { defaultSettings } from "./types";

const MB = 1024 * 1024;

describe("TikTok chunk plan follows the Content Posting API rules", () => {
  it("sends a small file whole as one chunk", () => {
    const p = planChunks(3 * MB);
    expect(p).toEqual({ videoSize: 3 * MB, chunkSize: 3 * MB, totalChunks: 1 });
    expect(chunkRange(p, 0)).toEqual({ start: 0, end: 3 * MB - 1 });
  });
  it("splits a large file into 64 MB chunks and lets the last one absorb the remainder", () => {
    const size = 150 * MB;
    const p = planChunks(size);
    expect(p.chunkSize).toBe(MAX_CHUNK);
    expect(p.totalChunks).toBe(2);
    expect(chunkRange(p, 0)).toEqual({ start: 0, end: 64 * MB - 1 });
    expect(chunkRange(p, 1)).toEqual({ start: 64 * MB, end: size - 1 });
    expect(chunkRange(p, 1).end - chunkRange(p, 1).start + 1).toBeLessThan(128 * MB);
  });
  it("never produces a chunk under the 5 MB minimum except a whole small file", () => {
    for (const size of [MIN_CHUNK + 1, 40 * MB, 64 * MB, 65 * MB, 500 * MB]) {
      const p = planChunks(size);
      for (let i = 0; i < p.totalChunks; i++) {
        const { start, end } = chunkRange(p, i);
        expect(end - start + 1).toBeGreaterThanOrEqual(Math.min(MIN_CHUNK, size));
      }
      expect(chunkRange(p, p.totalChunks - 1).end).toBe(size - 1);
    }
  });
});

describe("TikTok post_info", () => {
  it("maps SOCIA settings onto TikTok's inverted flags", () => {
    const s = { ...defaultSettings("tiktok"), allowComments: false, allowDuet: true, allowStitch: false, brandContent: true, aiGenerated: true, coverTimestampMs: 1234.7 };
    const p = buildPostInfo(s, "hello", "PUBLIC_TO_EVERYONE");
    expect(p).toMatchObject({
      title: "hello", privacy_level: "PUBLIC_TO_EVERYONE", disable_comment: true, disable_duet: false, disable_stitch: true,
      brand_content_toggle: true, brand_organic_toggle: false, is_aigc: true, video_cover_timestamp_ms: 1234,
    });
  });
  it("omits the cover timestamp when none was chosen and caps the caption at 2200", () => {
    const p = buildPostInfo(defaultSettings("tiktok"), "x".repeat(3000), "SELF_ONLY");
    expect("video_cover_timestamp_ms" in p).toBe(false);
    expect(p.title.length).toBe(2200);
  });
});

describe("TikTok status mapping never invents", () => {
  it("stays processing while TikTok is still working", () => {
    expect(statusFromFetch({ status: "PROCESSING_UPLOAD" }, "p1", true, "socia").status).toBe("processing");
    expect(statusFromFetch({}, "p1", true, "socia").status).toBe("processing");
  });
  it("treats inbox delivery as done, with the note telling the person to finish in the app", () => {
    const o = statusFromFetch({ status: "SEND_TO_USER_INBOX" }, "p1", false, "socia");
    expect(o.status).toBe("published");
    expect(o.externalContainerId).toBe("p1");
    expect(o.externalPostId).toBeNull();
    expect(o.errorMessage).toBe(INBOX_NOTE);
  });
  it("publishes a direct post with the public id and permalink", () => {
    const o = statusFromFetch({ status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["7345678901234567890"] }, "p1", true, "socia");
    expect(o.status).toBe("published");
    expect(o.externalPostId).toBe("7345678901234567890");
    expect(o.permalink).toContain("https://www.tiktok.com/@socia/video/");
    expect(permalinkFor(null, "1")).toBeNull();
    expect(permalinkFor("@x", "1")).toBe("https://www.tiktok.com/@x/video/1");
  });
  it("fails with TikTok's reason and is not retried", () => {
    const o = statusFromFetch({ status: "FAILED", fail_reason: "duration_check_failed" }, "p1", true, null);
    expect(o.status).toBe("failed");
    expect(o.retryable).toBe(false);
    expect(o.errorCode).toBe("duration_check_failed");
    expect(o.errorMessage).toBe(describeFailReason("duration_check_failed"));
    expect(describeFailReason("something_new")).toContain("something_new");
  });
});

describe("TikTok int64 ids survive parsing", () => {
  it("keeps every digit of publicaly_available_post_id", () => {
    const j = parseTikTokJson<{ status: string; publicaly_available_post_id: unknown[] }>(
      '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7345678901234567890, 12]},"error":{"code":"ok"}}',
    );
    expect(j?.data?.publicaly_available_post_id).toEqual(["7345678901234567890", "12"]);
    expect(parseTikTokJson('{"data":{"publish_id":"v_inbox.abc"},"error":{"code":"ok"}}')?.data).toEqual({ publish_id: "v_inbox.abc" });
    expect(parseTikTokJson("not json")).toBeNull();
    expect(parseTikTokJson("")).toBeNull();
  });
});

describe("TikTok scope checks", () => {
  it("uploads with either posting scope, posts directly only with video.publish", () => {
    expect(canUpload(["user.info.basic"])).toBe(false);
    expect(canUpload(["video.upload"])).toBe(true);
    expect(canUpload(["video.publish"])).toBe(true);
    expect(canUpload(null)).toBe(true); // pre-scope-tracking row: the publisher tries
    expect(canPublishDirect(["video.upload"])).toBe(false);
    expect(canPublishDirect(["video.upload", "video.publish"])).toBe(true);
  });
});
