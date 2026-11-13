// BUG-10: an unsaved edit survives a reload.
import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from "./localDraft";
import type { Edl } from "./types";

const base: Edl = { version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 10 }, segments: [{ id: "s1", clipId: "c1", in: 0, out: 3, role: "opener", note: "" }], text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [] };

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

describe("local draft", () => {
  beforeEach(() => { (globalThis as { localStorage?: unknown }).localStorage = new Mem(); });
  it("offers back an edit that differs from the server's, once", () => {
    const edited = { ...base, caption: "typed before the tab closed" };
    writeLocalDraft("b1", edited);
    expect(readLocalDraft("b1", base)).toEqual(edited);
    clearLocalDraft("b1");
    expect(readLocalDraft("b1", base)).toBeNull();
  });
  it("drops a copy that equals the saved cut, a stale one, or an empty one", () => {
    writeLocalDraft("b2", base);
    expect(readLocalDraft("b2", base)).toBeNull();
    writeLocalDraft("b3", { ...base, caption: "old" });
    expect(readLocalDraft("b3", base, Date.now() + 8 * 24 * 3600 * 1000)).toBeNull();
    writeLocalDraft("b4", { ...base, segments: [] });
    expect(readLocalDraft("b4", base)).toBeNull();
  });
  it("is safe without storage", () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    expect(() => writeLocalDraft("b5", base)).not.toThrow();
    expect(readLocalDraft("b5", base)).toBeNull();
  });
});
