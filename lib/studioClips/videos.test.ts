import { describe, expect, it } from "vitest";
import { videoKind, videoTitle } from "./videos";

const base = { brief: null, ideaTitle: null, clipName: null, projectTitle: null, projectDate: "2026-10-30T12:00:00Z" };

describe("Edit tab video names", () => {
  it("knows each kind of cut by its index", () => {
    expect(videoKind(0)).toBe("idea");
    expect(videoKind(4)).toBe("idea");
    expect(videoKind(-1)).toBe("edit");
    expect(videoKind(-2)).toBe("brief");
    expect(videoKind(-1000)).toBe("clip");
    expect(videoKind(-1007)).toBe("clip");
  });

  it("names an idea's cut after the idea", () => {
    expect(videoTitle({ ...base, idx: 2, ideaTitle: "Morning dough prep" })).toBe("Morning dough prep");
    expect(videoTitle({ ...base, idx: 2 })).toBe("An idea from your clips");
  });

  it("names a single-clip cut after its file", () => {
    expect(videoTitle({ ...base, idx: -1003, clipName: "IMG_4021.MOV" })).toBe("IMG 4021");
  });

  it("names a brief cut after its prompt or reference", () => {
    expect(videoTitle({ ...base, idx: -3, brief: { prompt: "A fast tour of the kitchen. Then the pizza.", referenceName: null } as never })).toBe("A fast tour of the kitchen");
    expect(videoTitle({ ...base, idx: -3, brief: { prompt: null, referenceName: "ref.mp4" } as never })).toBe("Like “ref.mp4”");
  });

  it("names the person's own edit after the project, or its date", () => {
    expect(videoTitle({ ...base, idx: -1, projectTitle: "Friday shoot" })).toBe("Your edit: Friday shoot");
    expect(videoTitle({ ...base, idx: -1 })).toBe("Your edit from Oct 30");
  });
});
