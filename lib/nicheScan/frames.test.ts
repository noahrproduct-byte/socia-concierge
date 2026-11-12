import { describe, expect, it } from "vitest";
import { readableVideo, youtubeId, FRAME_TIMES } from "./frames";
import { hasVideoField } from "../igCompetitorData";

describe("frames inside a Reel (2026-11-12)", () => {
  it("reads only Instagram's own video CDNs over https", () => {
    expect(readableVideo("https://scontent-atl3-1.cdninstagram.com/o1/v/x.mp4?oe=1")?.hostname).toBe("scontent-atl3-1.cdninstagram.com");
    expect(readableVideo("https://video.xx.fbcdn.net/v/x.mp4")).not.toBeNull();
    expect(readableVideo("http://scontent.cdninstagram.com/x.mp4")).toBeNull();
    expect(readableVideo("https://evil.example.com/x.mp4")).toBeNull();
    expect(readableVideo("file:///etc/passwd")).toBeNull();
    expect(readableVideo(null)).toBeNull();
  });
  it("finds the YouTube id in watch, shorts and short links", () => {
    expect(youtubeId("https://youtube.com/watch?v=gAHbOpCos0Y")).toBe("gAHbOpCos0Y");
    expect(youtubeId("https://www.youtube.com/shorts/gAHbOpCos0Y")).toBe("gAHbOpCos0Y");
    expect(youtubeId("https://youtu.be/gAHbOpCos0Y")).toBe("gAHbOpCos0Y");
    expect(youtubeId("https://www.instagram.com/reel/abc/")).toBeNull();
  });
  it("reads past the cover, where the on-screen line and the ask usually are", () => {
    expect(FRAME_TIMES[0]).toBeGreaterThan(1);
    expect(FRAME_TIMES.length).toBe(3);
  });
  it("re-reads cached accounts once when their Reels have no video link yet", () => {
    expect(hasVideoField([{ mediaType: "VIDEO", views: 1 }])).toBe(false);
    expect(hasVideoField([{ mediaType: "VIDEO", views: 1, video: null }])).toBe(true);
    expect(hasVideoField([{ mediaType: "IMAGE", views: 1 }])).toBe(true);
  });
});
