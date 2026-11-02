import { describe, expect, it } from "vitest";
import { copyPaths, dedupeByFootage, nextPosition } from "./library";

describe("Your clips", () => {
  it("shows the same footage once, newest copy first", () => {
    const out = dedupeByFootage([
      { id: "a", fingerprint: "f1", created_at: "2026-10-01T00:00:00Z" },
      { id: "b", fingerprint: "f2", created_at: "2026-10-05T00:00:00Z" },
      { id: "c", fingerprint: "f1", created_at: "2026-10-09T00:00:00Z" },
    ]);
    expect(out.map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("copies a clip's files into the new clip's own folder", () => {
    const r = copyPaths(
      { folder: "u1/p1/c1", source: "u1/p1/c1/source.mp4", frames: [{ t: 0, path: "u1/p1/c1/frames/0.jpg" }, { t: 2, path: "u1/p1/c1/frames/1.jpg" }], audio: "u1/p1/c1/audio.wav" },
      { uploaderId: "u2", projectId: "p9", clipId: "c9" },
    );
    expect(r.source).toBe("u2/p9/c9/source.mp4");
    expect(r.frames).toEqual([{ t: 0, path: "u2/p9/c9/frames/0.jpg" }, { t: 2, path: "u2/p9/c9/frames/1.jpg" }]);
    expect(r.audio).toBe("u2/p9/c9/audio.wav");
    expect(r.pairs).toHaveLength(4);
  });

  it("never copies a path outside the clip's folder", () => {
    const r = copyPaths(
      { folder: "u1/p1/c1", source: "u1/p1/other/source.mp4", frames: [{ t: 0, path: "u1/p1/c1/../x/0.jpg" }], audio: null },
      { uploaderId: "u2", projectId: "p9", clipId: "c9" },
    );
    expect(r.pairs).toEqual([]);
    expect(r.source).toBeNull();
    expect(r.frames).toEqual([]);
  });
});

describe("clip positions", () => {
  it("puts a new clip after the highest, even after a delete left a gap", () => {
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([{ position: 0 }, { position: 2 }])).toBe(3);
  });
});
