import { describe, expect, it } from "vitest";
import { applyOptParam, optedOut, OPT_OUT_KEY } from "./analyticsOptOut";

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe("don't count me", () => {
  it("?dont-count-me saves the flag and the browser stops being counted", () => {
    const s = memoryStore();
    expect(applyOptParam("?dont-count-me", s)).toBe("out");
    expect(s.m.get(OPT_OUT_KEY)).toBe("1");
    expect(optedOut(s)).toBe(true);
  });

  it("?count-me clears it", () => {
    const s = memoryStore();
    s.setItem(OPT_OUT_KEY, "1");
    expect(applyOptParam("?utm_source=x&count-me", s)).toBe("in");
    expect(optedOut(s)).toBe(false);
  });

  it("other visits change nothing and are counted", () => {
    const s = memoryStore();
    expect(applyOptParam("?utm_source=ig", s)).toBeNull();
    expect(optedOut(s)).toBe(false);
  });

  it("blocked storage never breaks the page", () => {
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(applyOptParam("?dont-count-me", throwing)).toBeNull();
    expect(optedOut(throwing)).toBe(false);
  });
});
