import { describe, expect, it } from "vitest";
import type { TranscriptWord } from "@/lib/transcribe/types";
import { CLIP_TYPE_BRIEF, RANKING_SCHEMA, checkPicks, pickMessage, type ClipPick, type Line } from "./pick";
import { CLIP_TYPES } from "./provider";
import { rankingBand, rankingBox, rankingMs, rankingOf, rankingOverlay, readRanking, trailerOf } from "./ranking";

const pick = (startMs: number, endMs: number, title: string, score: number): ClipPick => ({ startMs, endMs, title, score, hook: "", reason: `why ${title}`, text: title });
// Fifty seconds of speech, a sentence every 10 words.
const words: TranscriptWord[] = Array.from({ length: 100 }, (_, i) => ({ text: (i + 1) % 10 === 0 ? "end." : "word", startMs: i * 500, endMs: i * 500 + 450, confidence: null }));
const lines: Line[] = [{ startMs: 0, endMs: 1000, text: "A line." }];
const brief = { brand: "b", lines, durationMs: 60_000, examples: [], results: [], niche: null };

describe("a ranking", () => {
  const best = [pick(40_000, 50_000, "Top", 9), pick(0, 8_000, "Middle", 7), pick(20_000, 26_000, "Last", 5)];

  it("plays last place first and number one at the end", () => {
    const r = rankingOf("Ranking things", best);
    expect(r.items.map((i) => [i.rank, i.label])).toEqual([[3, "Last"], [2, "Middle"], [1, "Top"]]);
  });

  it("shows each name as its moment starts in the joined clip", () => {
    const r = rankingOf("Ranking things", best);
    expect(rankingMs(r)).toBe(24_000);
    expect(rankingOverlay(r).items.map((i) => [i.rank, i.at])).toEqual([[3, 0], [2, 6], [1, 14]]);
  });

  it("reads back only what is really a ranking", () => {
    expect(readRanking(rankingOf("Ranking things", best))?.items).toHaveLength(3);
    expect(readRanking(null)).toBeNull();
    expect(readRanking({ title: "x", items: [{ rank: 1, label: "a", startMs: 5, endMs: 1 }] })).toBeNull();
    expect(readRanking(rankingOf("x", best.slice(0, 1)))).toBeNull();
  });

  it("keeps moments short, whatever clip length the form still holds", () => {
    const opts = { maxClips: 5, lengths: ["60to90" as const], clipType: "ranking" as const };
    const raw = { clips: [{ start: 0, end: 10, title: "A", hook: "", score: 9, reason: "" }, { start: 10, end: 50, title: "Too long", hook: "", score: 8, reason: "" }] };
    const { picks, wrongLength } = checkPicks(raw, words, opts);
    expect(picks.map((p) => p.title)).toEqual(["A"]);
    expect(wrongLength).toBe(1);
  });

  it("orders by score, the highest being number one", () => {
    const opts = { maxClips: 3, lengths: ["auto" as const], clipType: "ranking" as const };
    const raw = { clips: [{ start: 0, end: 10, title: "Low", hook: "", score: 4, reason: "" }, { start: 20, end: 30, title: "High", hook: "", score: 9, reason: "" }] };
    expect(checkPicks(raw, words, opts).picks[0].title).toBe("High");
  });

  it("keeps the picture under the panel, filling it down to the bottom", () => {
    expect(rankingBand(3, 1920)).toEqual({ top: 536, height: 1384 });
    const box = rankingBox(1280, 720, 1080, 1920, 3, 0.5);
    expect(parseFloat(box.top)).toBeCloseTo((536 / 1920) * 100, 1);
    expect(parseFloat(box.height)).toBeCloseTo((1384 / 1920) * 100, 1);
  });

  it("uses a schema the structured outputs API accepts", () => {
    expect(JSON.stringify(RANKING_SCHEMA)).not.toMatch(/maxItems|minItems|maxLength|minimum|maximum/);
  });
});

describe("a trailer", () => {
  it("plays in the order it was written, not by score", () => {
    const raw = { clips: [{ start: 20, end: 25, title: "Stakes", hook: "", score: 4, reason: "", emphasis: [] }, { start: 0, end: 5, title: "Payoff", hook: "", score: 9, reason: "", emphasis: [] }] };
    const { picks } = checkPicks(raw, words, { maxClips: 6, lengths: ["auto"], clipType: "trailer" });
    expect(picks.map((p) => p.title)).toEqual(["Stakes", "Payoff"]);
    const t = trailerOf("A story", picks);
    expect(t.items.map((i) => [i.rank, i.label])).toEqual([[1, "Stakes"], [2, "Payoff"]]);
    expect(readRanking(t)?.kind).toBe("trailer");
  });
});

describe("clip types", () => {
  it("has a brief for every type that only changes what is looked for", () => {
    for (const t of CLIP_TYPES) if (t.id !== "best" && t.id !== "ranking" && t.id !== "trailer") expect(CLIP_TYPE_BRIEF[t.id].length).toBeGreaterThan(20);
  });

  it("tells the picker what to look for, and nothing extra for best moments", () => {
    const opts = { maxClips: 5, lengths: ["auto" as const] };
    expect(pickMessage({ ...brief, options: { ...opts, clipType: "takes" } })).toContain(CLIP_TYPE_BRIEF.takes);
    expect(pickMessage({ ...brief, options: { ...opts, clipType: "best" } })).not.toContain("The kind of clip wanted");
    expect(pickMessage({ ...brief, options: { ...opts, clipType: "ranking" } })).toContain("moments for one ranking, each 5 to 30 seconds");
    expect(pickMessage({ ...brief, options: opts })).toContain("Pick up to 5 clips");
  });
});
