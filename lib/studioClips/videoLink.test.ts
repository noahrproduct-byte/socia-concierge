import { describe, expect, it } from "vitest";
import { parseVideoLink, unstudiedWhy } from "./videoLink";

describe("a pasted video link from any platform", () => {
  it("knows Instagram Reels and posts", () => {
    expect(parseVideoLink("https://www.instagram.com/reel/C9xYzAbCdEf/?igsh=abc")).toEqual({ platform: "instagram", link: "https://www.instagram.com/reel/C9xYzAbCdEf/", id: "C9xYzAbCdEf" });
    expect(parseVideoLink("instagram.com/p/C9xYzAbCdEf")?.platform).toBe("instagram");
  });
  it("knows TikTok videos and share links", () => {
    expect(parseVideoLink("https://www.tiktok.com/@salvos.pizza/video/7312345678901234567?is_from_webapp=1")).toEqual({ platform: "tiktok", link: "https://www.tiktok.com/@salvos.pizza/video/7312345678901234567", id: "7312345678901234567", handle: "salvos.pizza" });
    expect(parseVideoLink("https://vm.tiktok.com/ZMabc123/")?.platform).toBe("tiktok");
    expect(parseVideoLink("https://www.tiktok.com/t/ZTabc123/")?.platform).toBe("tiktok");
    expect(parseVideoLink("https://www.tiktok.com/@salvos.pizza")).toBeNull();
  });
  it("knows YouTube Shorts and videos", () => {
    expect(parseVideoLink("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toEqual({ platform: "youtube", link: "https://www.youtube.com/shorts/dQw4w9WgXcQ", id: "dQw4w9WgXcQ" });
    expect(parseVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")?.id).toBe("dQw4w9WgXcQ");
    expect(parseVideoLink("https://youtu.be/dQw4w9WgXcQ")?.platform).toBe("youtube");
  });
  it("knows Facebook videos and Reels", () => {
    expect(parseVideoLink("https://www.facebook.com/salvospizza/videos/1234567890123/")?.platform).toBe("facebook");
    expect(parseVideoLink("https://www.facebook.com/reel/1234567890123")?.id).toBe("1234567890123");
  });
  it("turns down anything else", () => {
    expect(parseVideoLink("https://example.com/video.mp4")).toBeNull();
    expect(parseVideoLink("not a link")).toBeNull();
    expect(parseVideoLink("https://evil.com/?u=tiktok.com/@a/video/123456789")).toBeNull();
  });
  it("says why a TikTok can't be studied and what to do", () => {
    expect(unstudiedWhy("tiktok")).toMatch(/TikTok doesn't let apps download its videos.*upload the file/);
  });
});
