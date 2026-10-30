import { describe, it, expect } from "vitest";
import { buildFormats, examplesFrom, formatInsights, formatsEvidence, FORMATS_PRODUCER, type FormatsDoc, type RawFormat } from "./nicheFormats";
import { growthBriefing } from "./intel/overview";
import { cleanDraft, type StoredInsight } from "./intel/insight";
import { buildUserPrompt } from "./prompt";

const now = new Date("2026-10-29T12:00:00Z");
const day = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const yt = (i: number, account: string, mult: number) => ({
  content_url: `https://youtube.com/watch?v=vid${String(i).padStart(4, "0")}`, platform: "youtube", data_source: "youtube_api",
  account_name: account, title: `Pizza video ${i}`, thumbnail_url: null, views: 1000, likes: 10, comments: 2, published_at: day(i), multiplier: mult,
});
const raw = (name: string, ids: number[]): RawFormat => ({ name, summary: "A dish start to finish.", steps: ["Dough", "Bake"], hooks: ["Watch this"], filming: ["One angle"], length: "30 s", adaptations: ["Film the Friday special"], example_ids: ids });

const ex = examplesFrom({ now, instagram: [], content: [yt(1, "A", 2.5), yt(2, "B", 1.8), yt(3, "A", 1.4), yt(4, "C", 0.6), yt(5, "B", 0.9), yt(6, "C", 0.8)] });
const { formats, unassigned } = buildFormats([raw("One-take build", [0, 1, 2]), raw("Staff answers", [3, 4, 5])], ex);
const doc: FormatsDoc = { v: 1, builtAt: now.toISOString(), runAt: day(0), examplesRead: ex.length, fromYouTube: ex.length, fromInstagram: 0, formats, unassigned };

describe("formatInsights", () => {
  const drafts = formatInsights(doc);
  it("turns only leading formats into valid findings", () => {
    expect(drafts.map((d) => d.title)).toEqual(['"One-take build" leads in your niche']);
    expect(drafts.every((d) => cleanDraft(d) !== null)).toBe(true);
  });
  it("caps confidence, keeps a stable fingerprint, and marks the cross-account leap as a hypothesis", () => {
    const d = drafts[0];
    expect(d.producer).toBe(FORMATS_PRODUCER);
    expect(d.category).toBe("niche");
    expect(d.confidence).toBeLessThanOrEqual(60);
    expect(d.fingerprint).toBe("niche:format:one-take-build");
    expect(d.explanations.some((e) => e.type === "hypothesis" && /other accounts' results/.test(e.text))).toBe(true);
    expect(d.recommendation?.action).toMatch(/^Make one "One-take build" post this week/);
  });
});

const stored = (): StoredInsight => ({ ...formatInsights(doc)[0], id: "x", status: "active", createdAt: day(1), updatedAt: day(1), lastSeenAt: day(0) });

describe("connected readers", () => {
  it("adds a sourced briefing line from a leading format", () => {
    const b = growthBriefing({ brandName: "A", niche: null, growth: null, sample: { facts: [], posts: [] }, works: [], insights: [stored()], goalLine: null });
    const line = b.lines.find((l) => l.source.startsWith("Discover"));
    expect(line?.text).toBe('In your niche, "One-take build" posts are doing best: a median 1.8x their creators\' usual across 3 examples.');
  });

  it("gives the plan writer the format with its basis and asks it to cite and adapt", () => {
    const block = formatsEvidence([stored()]);
    expect(block).toMatch(/One-take build.*3 examples from 2 accounts/);
    const prompt = buildUserPrompt({ competitors: "", recentPosts: "", audienceWindows: "", brandVoice: "", clientHandle: "salvos", goal: "", niche: "Pizza", platform: "instagram" } as never, null, { postsBlock: "", competitorsBlock: "", outcomesBlock: "", formatsBlock: block, used: {} as never });
    expect(prompt).toMatch(/# Formats that lead in this niche/);
    expect(prompt).toMatch(/never copied/);
  });
});
