// Regression tests for the editor bugs listed in docs/editor/BUGS.md. Each
// test names the bug it guards.
import { describe, it, expect } from "vitest";
import { CLEAN_STYLE, sanitizeStyle } from "./style";
import { cleanFrame, revalidateEdl, validateEdl, type ClipForEdl, type RawEdl } from "./edl";
import { OUTPUT, type Edl } from "./types";
import { can } from "@/lib/context";
import { requireMutate } from "./auth";
import { clearLocalExport, readLocalExport, writeLocalExport } from "./localDraft";

const clip = (over: Partial<ClipForEdl> & { id: string; position: number }): ClipForEdl => ({
  durationSec: 20, words: null, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -20, audioLevel: "ok", hasSpeech: false, ...over,
});
const words = [{ text: "Okay", startMs: 1000, endMs: 1300, confidence: 1 }, { text: "go", startMs: 1300, endMs: 1700, confidence: 1 }];
const short = clip({ id: "c1", position: 0, hasSpeech: true, words });
const silent = clip({ id: "c2", position: 1 });

function cut(): Edl {
  const raw: RawEdl = { segments: [{ clipId: "c1", in: 0, out: 6 }, { clipId: "c2", in: 0, out: 6, frame: { zoom: 1.4, x: 0.3, y: 0.5, path: [{ t: 0, c: 0.2, y: 0.5, s: 1.4 }, { t: 3, c: 0.8, y: 0.5, s: 1.4 }] } }], genre: "food_reel", style: CLEAN_STYLE };
  return validateEdl(raw, [short, silent], { targetSec: { min: 5, max: 30 } }).edl;
}

describe("BUG-01 the Lower caption position survives a save", () => {
  it("sanitizeStyle keeps 'lower'", () => {
    expect(sanitizeStyle(CLEAN_STYLE)?.captions.position).toBe("lower");
    expect(sanitizeStyle({ ...CLEAN_STYLE, captions: { ...CLEAN_STYLE.captions, position: "sideways" } })?.captions.position).toBe("bottom");
  });
});

describe("BUG-02 a person's save keeps what the cut had", () => {
  it("keeps the house-style genre", () => {
    const edl = cut();
    expect(edl.genre).toBe("food_reel");
    expect(revalidateEdl(edl, [short, silent]).edl.genre).toBe("food_reel");
  });
  it("keeps a moving reframe path, bounded and in order", () => {
    const edl = cut();
    expect(edl.segments[1].frame?.path).toHaveLength(2);
    const again = revalidateEdl(edl, [short, silent]).edl;
    expect(again.segments[1].frame?.path?.map((k) => k.c)).toEqual([0.2, 0.8]);
    expect(cleanFrame({ zoom: 1, x: 0.5, y: 0.5, path: [{ t: 2, c: 9, y: -1, s: 0.1 }, { t: 1, c: 0.5, y: 0.5, s: 1 }] })?.path).toEqual([{ t: 1, c: 0.5, y: 0.5, s: 1 }, { t: 2, c: 1, y: 0, s: 1 }]);
    expect(cleanFrame({ zoom: 1, x: 0.5, y: 0.5, path: [] })).toBeNull();
  });
  it("keeps captions the person turned on for a short line, and off when they turned them off", () => {
    const edl = cut();
    // Two words: SOCIA's first cut leaves captions off on its own.
    expect(edl.captions).toBeNull();
    const on = revalidateEdl({ ...edl, captions: { source: "transcript" } }, [short, silent]).edl;
    expect(on.captions).toEqual({ source: "transcript" });
    const off = revalidateEdl({ ...on, captions: null }, [short, silent]).edl;
    expect(off.captions).toBeNull();
    // Nothing to caption at all: on cannot be kept.
    const none = revalidateEdl({ ...edl, segments: [edl.segments[1]], captions: { source: "transcript" } }, [short, silent]).edl;
    expect(none.captions).toBeNull();
  });
  it("keeps the output size and fps", () => {
    const edl = cut();
    expect(revalidateEdl({ ...edl, width: 1080, height: 1080 }, [short, silent]).edl).toMatchObject({ width: 1080, height: 1080, fps: OUTPUT.fps });
  });
});

describe("BUG-26 a workspace member can make drafts in the studio", () => {
  it("every role may draft; only owners and admins publish", () => {
    expect(can({ role: "member" }, "draft")).toBe(true);
    expect(can({ role: "member" }, "publish")).toBe(false);
    expect(can({ role: "admin" }, "draft")).toBe(true);
    expect(requireMutate({ role: "member" } as never)).toBeNull();
  });
});

describe("BUG-27 an export interrupted by a reload is made again on its reserved path", () => {
  it("remembers the path and quality for under an hour, then forgets", () => {
    class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }
    (globalThis as { localStorage?: unknown }).localStorage = new Mem();
    writeLocalExport("b1", { path: "u/studio/b1/x.mp4", quality: "medium" });
    expect(readLocalExport("b1")).toEqual({ path: "u/studio/b1/x.mp4", quality: "medium" });
    expect(readLocalExport("b1", Date.now() + 2 * 3600 * 1000)).toBeNull();
    writeLocalExport("b1", { path: "u/studio/b1/x.mp4", quality: "high" });
    clearLocalExport("b1");
    expect(readLocalExport("b1")).toBeNull();
  });
});
