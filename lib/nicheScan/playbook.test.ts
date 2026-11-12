import { describe, expect, it } from "vitest";
import { buildPlaybook, cleanWatched, isFresh, keepTemplates, patternCount, patternOf, playbookInsights, playbookKey, playbookPrompt, readPlaybook, type WatchedReel } from "./playbook";
import { reusable, FORMAT_LABEL as LABELS } from "./playbook";
import type { ScanReel } from "./plan";

const NOW = new Date("2026-11-12T12:00:00Z");
const scan = (id: string, handle: string, multiplier: number | null, extra: Partial<ScanReel> = {}): ScanReel => ({
  id, url: `https://www.instagram.com/reel/${id}/`, platform: "instagram", account: handle, handle, thumb: null, caption: "caption",
  publishedAt: "2026-11-01T10:00:00Z", views: null, likes: 120, comments: 9, multiplier, basis: "likes and comments", proven: (multiplier ?? 0) >= 1.5, ...extra,
});
const watched = (id: string, handle: string, multiplier: number | null, raw: Record<string, unknown>, extra: Partial<ScanReel> = {}): WatchedReel =>
  cleanWatched(scan(id, handle, multiplier, extra), raw, "cover");

const SEND = { format: "share_bait", on_screen_text: "send this to someone you'd eat this with", hook: "send this to someone you'd eat this with", cta_kind: "send_to", cta_text: "send this to someone", text_style: "white bold, top", framing: "overhead" };

describe("studying a Reel", () => {
  it("keeps only known formats and asks, trims words, and never invents on-screen text without a cover", () => {
    const w = cleanWatched(scan("R1", "a", 2), { format: "dance", on_screen_text: "  hello — world ", cta_kind: "buy_now", hook: "" }, "cover");
    expect(w.format).toBe("other");
    expect(w.cta.kind).toBe("none");
    expect(w.onScreenText).toBe("hello , world");
    expect(w.hook).toBeNull();
    const caption = cleanWatched(scan("R2", "a", 2), SEND, "caption");
    expect(caption.onScreenText).toBeNull();
    expect(caption.textSeen).toBe(false);
    expect(caption.textStyle).toBeNull();
    expect(caption.format).toBe("share_bait");
  });
});

describe("a pattern needs two Reels from two accounts", () => {
  it("drops one account's habit, keeps what repeats across accounts", () => {
    expect(patternOf("x", "x", [scan("R1", "a", 2), scan("R2", "a", 3)])).toBeNull();
    expect(patternOf("x", "x", [scan("R1", "a", 2)])).toBeNull();
    const p = patternOf("x", "x", [scan("R1", "a", 2), scan("R2", "b", 3), scan("R3", "b", null)]);
    expect(p).toMatchObject({ reels: 3, accounts: 2, medianMultiplier: 2.5 });
    expect(p!.evidence[0].id).toBe("R2");
  });
});

describe("text templates", () => {
  const w = [
    watched("R1", "a", 3, SEND),
    watched("R2", "b", 2.2, { ...SEND, on_screen_text: "send this to the friend who owes you a slice" }),
    watched("R3", "b", 1.8, { ...SEND, on_screen_text: "" }),
    watched("R4", "c", 0.3, SEND, { weak: true }),
  ];
  it("keeps a template only when real, studied Reels with words from two accounts show it", () => {
    const kept = keepTemplates([
      { template: "send this to someone you'd ___ with", reel_ids: ["R1", "R2"] },
      { template: "only one account", reel_ids: ["R1", "R1"] },
      { template: "cites a Reel with no text", reel_ids: ["R1", "R3"] },
      { template: "cites a weak one", reel_ids: ["R1", "R4"] },
      { template: "cites nothing real", reel_ids: ["R9", "R8"] },
      { template: 42, reel_ids: ["R1", "R2"] },
    ], w, "text");
    expect(kept.map((k) => k.template)).toEqual(["send this to someone you'd ___ with"]);
    expect(kept[0].examples).toEqual(["send this to someone you'd eat this with", "send this to the friend who owes you a slice"]);
    expect(kept[0]).toMatchObject({ reels: 2, accounts: 2 });
  });
});

describe("the playbook", () => {
  const w = [
    watched("R1", "a", 3, SEND),
    watched("R2", "b", 2.2, { ...SEND, on_screen_text: "send this to the friend who owes you a slice" }),
    watched("R3", "c", 2, { ...SEND, format: "one_action", cta_kind: "none" }),
    watched("R4", "d", 1.9, { ...SEND, format: "one_action", cta_kind: "none" }),
    watched("R5", "e", 0.3, { ...SEND, format: "talking", cta_kind: "follow" }, { weak: true }),
    watched("R6", "f", 0.2, { ...SEND, format: "talking", cta_kind: "follow" }, { weak: true }),
  ];
  const texts = keepTemplates([{ template: "send this to someone you'd ___ with", reel_ids: ["R1", "R2"] }], w, "text");
  const p = buildPlaybook({ niche: "pizza restaurant", now: NOW, watched: w, read: w, accountsRead: 9, texts, hooks: [] });

  it("lists formats and asks that took off across accounts, and what did badly", () => {
    expect(p.formats.map((f) => f.key).sort()).toEqual(["one_action", "share_bait"]);
    expect(p.ctas.map((c) => c.key)).toEqual(["send_to"]);
    expect(p.avoid.map((a) => a.key)).toEqual(["talking"]);
    expect(p.scanned).toMatchObject({ accounts: 9, studied: 6 });
    expect(patternCount(p)).toBe(4);
  });
  it("writes a prompt block with counts and dates, never a forecast", () => {
    const text = playbookPrompt(p);
    expect(text).toMatch(/^What goes viral in this niche \(SOCIA studied 6 real Reels and Shorts from 9 accounts/);
    expect(text).toContain('Proven on-screen text: "send this to someone you\'d ___ with" (2 Reels, 2 accounts; for example "send this to someone you\'d eat this with")');
    expect(text).toContain("Never claim the video will go viral.");
    expect(text).not.toMatch(/—/);
    expect(playbookPrompt(null)).toBe("");
    expect(playbookPrompt(buildPlaybook({ niche: null, now: NOW, watched: [], read: [], accountsRead: 0, texts: [], hooks: [] }))).toBe("");
  });
  it("becomes niche findings with their evidence, and is stored under an owner-scoped key", () => {
    const drafts = playbookInsights(p);
    expect(drafts.every((d) => d.category === "niche" && d.producer === "niche_scan" && d.posts.length > 0)).toBe(true);
    expect(drafts.some((d) => d.title.includes("send this to someone"))).toBe(true);
    expect(playbookKey("u1:w1")).toBe("u1:w1:playbook:v1");
    expect(readPlaybook(p)).toBe(p);
    expect(readPlaybook({ v: 2 })).toBeNull();
    expect(isFresh(p, new Date(NOW.getTime() + 6 * 86_400_000))).toBe(true);
    expect(isFresh(p, new Date(NOW.getTime() + 8 * 86_400_000))).toBe(false);
  });
});

describe("scan review fixes (2026-11-12)", () => {
  it("drops a template nobody could reuse, like a bare number", () => {
    expect(reusable("___ million")).toBe(false);
    expect(reusable("___")).toBe(false);
    expect(reusable("pov: ___")).toBe(true);
    expect(reusable("send this to someone you'd ___ with")).toBe(true);
  });
  it("uses neutral labels for formats every niche shares", () => {
    expect(LABELS.reaction).toBe("a reaction");
    expect(LABELS.taste_test).not.toMatch(/taste|bite/);
  });
});
