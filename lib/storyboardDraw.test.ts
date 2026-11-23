import { describe, it, expect } from "vitest";
import { boardState, framePrompt, isFrameJob, isFramePath, isOwnFrame, keepFrames } from "./storyboardDraw";
import { cleanBeats, sanitizePlanItems } from "./planItems";
import type { PlanBeat } from "./schema";

const OWNER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const FRAME = `${OWNER}/generations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`;
const JOB = "12345678-1234-1234-1234-123456789abc";

describe("frame paths and jobs", () => {
  it("accepts only a drawing in a generations folder", () => {
    expect(isFramePath(FRAME)).toBe(true);
    expect(isFramePath(`${OWNER}/studio-inputs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`)).toBe(false);
    expect(isFramePath(`${OWNER}/generations/../x.jpg`)).toBe(false);
    expect(isFramePath("https://example.com/a.jpg")).toBe(false);
    expect(isFramePath("/dev-storyboard/1.png")).toBe(false);
  });
  it("links only the owner's own drawings", () => {
    expect(isOwnFrame(FRAME, OWNER)).toBe(true);
    expect(isOwnFrame(FRAME, OTHER)).toBe(false);
  });
  it("job ids are uuids", () => {
    expect(isFrameJob(JOB)).toBe(true);
    expect(isFrameJob("drop table")).toBe(false);
  });
});

describe("framePrompt", () => {
  it("uses the shot's own words and forbids invented text", () => {
    const p = framePrompt({ label: "The hook", show: "Selfie at chest height, walking from the doorway to your desk." }, { niche: "Software" });
    expect(p).toContain("walking from the doorway to your desk");
    expect(p).toContain("Software");
    expect(p).toMatch(/No text, no captions, no words/);
    expect(p).not.toMatch(/over the shoulder/);
  });
  it("draws a screen recording as a soft screen, so no fake writing", () => {
    expect(framePrompt({ label: "Proof", show: "Screen recording of SOCIA building the week's plan, sped up." })).toMatch(/over the shoulder, its contents soft/);
  });
});

const beat = (show: string, extra: Partial<PlanBeat> = {}): PlanBeat => ({ label: "Shot", from: 0, to: 3, show, ...extra });

describe("keepFrames", () => {
  const stored = [{ id: "item-aaaa-1", beats: [beat("A", { frame: FRAME }), beat("B", { frameJob: JOB })] }];
  it("puts back drawings an older page copy lacks", () => {
    const out = keepFrames([{ id: "item-aaaa-1", beats: [beat("A"), beat("B")] }], stored);
    expect(out[0].beats![0].frame).toBe(FRAME);
    expect(out[0].beats![1].frameJob).toBe(JOB);
  });
  it("drops the drawing of a shot whose words changed", () => {
    const out = keepFrames([{ id: "item-aaaa-1", beats: [beat("A changed", { frame: FRAME }), beat("B")] }], stored);
    expect(out[0].beats![0].frame).toBeUndefined();
    expect(out[0].beats![1].frameJob).toBe(JOB);
  });
  it("leaves other posts alone", () => {
    const out = keepFrames([{ id: "item-bbbb-2", beats: [beat("A"), beat("B")] }], stored);
    expect(out[0].beats![0].frame).toBeUndefined();
  });
});

describe("boardState", () => {
  it("counts drawn and drawing shots", () => {
    expect(boardState([beat("A", { frame: FRAME }), beat("B", { frameJob: JOB }), beat("C")])).toEqual({ drawn: 1, drawing: 1, total: 3 });
  });
});

describe("plan items keep drawings and the film example", () => {
  it("cleanBeats keeps a valid frame and job and drops junk", () => {
    const out = cleanBeats([
      { label: "One", from: 0, to: 3, show: "A", frame: FRAME, frameJob: JOB },
      { label: "Two", from: 3, to: 6, show: "B", frame: "https://evil.example/x.jpg", frameJob: "nope" },
    ])!;
    expect(out[0]).toMatchObject({ frame: FRAME, frameJob: JOB });
    expect(out[1].frame).toBeUndefined();
    expect(out[1].frameJob).toBeUndefined();
  });
  it("an edit sent back from the page keeps filmRef and filmLike", () => {
    const [item] = sanitizePlanItems([{
      day: "Tuesday", concept: "A concept", hook: "Hook", format: "Reel", rationale: "", evidence: "", predictedPerformance: "",
      filmLike: "Phone at chest height, one take.",
      filmRef: { url: "https://www.instagram.com/reel/ABC123/", platform: "instagram", account: "@shop", title: "A Reel", views: 40000, likes: null, comments: null, multiplier: 4, basis: "views", structure: "Contrarian hook" },
    }]);
    expect(item.filmLike).toBe("Phone at chest height, one take.");
    expect(item.filmRef?.url).toBe("https://www.instagram.com/reel/ABC123/");
  });
});
