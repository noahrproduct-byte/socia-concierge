import { describe, it, expect } from "vitest";
import { libraryStatus, libraryLine } from "./library";
import type { StudioClip, YieldResult } from "./types";

const clip = (id: string, addedAt: string, status: StudioClip["status"] = "ready"): StudioClip =>
  ({ id, projectId: "p", position: 0, name: `${id}.mp4`, mime: "video/mp4", bytes: 1, durationSec: 10, width: 1080, height: 1920, recordedAt: null, status, error: null, facts: null, transcript: null, frames: [], expiresAt: null, reused: false, addedAt, card: { createdAt: addedAt } }) as unknown as StudioClip;

const yieldOf = (n: number, createdAt = "2026-10-02T00:00:00Z"): YieldResult => ({ opportunities: Array.from({ length: n }, (_, idx) => ({ idx })), createdAt } as unknown as YieldResult);

describe("libraryStatus", () => {
  it("is empty and not stale with no clips", () => {
    const s = libraryStatus({ clips: [], yield: null }, []);
    expect(s).toMatchObject({ usable: 0, newSinceYield: 0, hasYield: false, stale: false, posts: 0 });
    expect(libraryLine(s, 30)).toContain("kept for 30 days");
  });

  it("counts only clips whose footage is still on file", () => {
    const s = libraryStatus({ clips: [clip("a", "2026-10-01T00:00:00Z"), clip("b", "2026-10-01T00:00:00Z", "expired"), clip("c", "2026-10-01T00:00:00Z", "failed")], yield: null }, []);
    expect(s.usable).toBe(1);
    expect(libraryLine(s, null)).toBe("1 clip on file. Not understood yet.");
  });

  it("calls the library stale only when usable clips arrived after the yield", () => {
    const before = clip("a", "2026-10-01T00:00:00Z");
    const after = clip("b", "2026-10-03T00:00:00Z");
    const fresh = libraryStatus({ clips: [before], yield: yieldOf(2) }, []);
    expect(fresh.stale).toBe(false);
    const stale = libraryStatus({ clips: [before, after], yield: yieldOf(2) }, []);
    expect(stale).toMatchObject({ newSinceYield: 1, stale: true, posts: 2 });
    expect(libraryLine(stale, 30)).toBe("2 clips on file, 1 new since SOCIA last looked. 2 posts found so far.");
  });

  it("reports what became of the posts", () => {
    const s = libraryStatus({ clips: [clip("a", "2026-10-01T00:00:00Z")], yield: yieldOf(3) }, [
      { opportunityIdx: 0, title: "x", rendered: true, postId: "post" },
      { opportunityIdx: 1, title: "y", rendered: false, postId: "post2" },
    ]);
    expect(s).toMatchObject({ rendered: 1, drafted: 2 });
    expect(libraryLine(s, 30)).toBe("1 clip on file. 3 posts found, 2 drafted, 1 rendered.");
  });
});
