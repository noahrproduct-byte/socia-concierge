import { describe, it, expect } from "vitest";
import { publishReadiness, type ContentCheck } from "./readiness";
import { newDraft, seedDestinations, type PickerAccount } from "./composer";
import { defaultSettings, type MediaItem, type InstagramSettings, type YouTubeSettings } from "./types";

const MB = 1024 * 1024;
const video = (o: Partial<MediaItem> = {}): MediaItem => ({ id: "v1", kind: "video", name: "a.mp4", mime: "video/mp4", size: 40 * MB, width: 1080, height: 1920, duration: 28, path: "u/p/a.mp4", url: "https://x/a.mp4", ...o });
const future = new Date(Date.now() + 3600_000).toISOString();
const accounts: PickerAccount[] = [
  { platform: "instagram", accountId: "1", label: "@salvo", handle: "salvo", avatar: null, status: "connected", suspended: false, scopes: null },
  { platform: "youtube", accountId: "UC1", label: "Discipline Theory", handle: null, avatar: null, status: "connected", suspended: false, scopes: ["https://www.googleapis.com/auth/youtube"] },
];
const noChecks: ContentCheck[] = [];

function draftWith(enable: string[], mut: (d: ReturnType<typeof newDraft>) => void = () => {}) {
  const d = newDraft();
  d.destinations = seedDestinations(accounts);
  d.media = [video()];
  d.masterCaption = "The goal was never money.";
  d.schedule = { mode: "later", at: future, sameForAll: true };
  for (const k of enable) { const dd = d.destinations.find((x) => x.key === k); if (dd) dd.enabled = true; }
  mut(d);
  return d;
}

describe("publishReadiness", () => {
  it("is 0% with nothing selected and lists the required destination fix", () => {
    const d = newDraft();
    d.destinations = seedDestinations(accounts);
    const r = publishReadiness(d, accounts, noChecks);
    expect(r.percent).toBe(0);
    expect(r.destinations).toBe(0);
    expect(r.required.map((f) => f.id)).toContain("no-destination");
    expect(r.canPublish).toBe(false);
  });

  it("is 100% when the one enabled destination is fully ready", () => {
    const d = draftWith(["instagram:1"]);
    (d.destinations.find((x) => x.key === "instagram:1")!.settings as InstagramSettings).format = "reel";
    const r = publishReadiness(d, accounts, noChecks);
    expect(r.requiredTotal).toBe(2); // has-destination + this destination
    expect(r.requiredPassed).toBe(2);
    expect(r.percent).toBe(100);
    expect(r.required).toHaveLength(0);
    expect(r.canPublish).toBe(true);
    expect(r.buckets.find((b) => b.id === "technical")).toMatchObject({ done: 1, total: 1, ok: true });
  });

  it("counts a blocked destination against the percent and surfaces the required fix", () => {
    // YouTube with no title is blocked.
    const d = draftWith(["instagram:1", "youtube:UC1"], (dd) => {
      (dd.destinations.find((x) => x.key === "youtube:UC1")!.settings as YouTubeSettings).title = "";
      (dd.destinations.find((x) => x.key === "youtube:UC1")!.settings as YouTubeSettings).madeForKids = false;
    });
    const r = publishReadiness(d, accounts, noChecks);
    expect(r.destinations).toBe(2);
    expect(r.requiredTotal).toBe(3); // has-destination + 2
    expect(r.requiredPassed).toBe(2); // instagram ok, youtube blocked
    expect(r.percent).toBe(67);
    expect(r.required.some((f) => f.field === "title" && f.platform === "youtube")).toBe(true);
    expect(r.canPublish).toBe(false);
  });

  it("keeps warnings and content warns as suggestions, never required", () => {
    const d = draftWith(["youtube:UC1"], (dd) => {
      const s = dd.destinations.find((x) => x.key === "youtube:UC1")!.settings as YouTubeSettings;
      s.title = "A good title"; s.madeForKids = false;
    });
    const checks: ContentCheck[] = [
      { id: "hook", label: "Hook line", value: "9 words", tone: "good" },
      { id: "cta", label: "Call to action", value: "not found", tone: "warn" },
    ];
    const r = publishReadiness(d, accounts, checks);
    expect(r.required).toHaveLength(0);
    expect(r.suggested.some((f) => f.id === "content:cta")).toBe(true);
    expect(r.percent).toBe(100);
    expect(r.buckets.find((b) => b.id === "content")).toMatchObject({ done: 1, total: 2, ok: false });
  });

  it("flags an unset schedule time through the timing bucket and the percent", () => {
    const d = draftWith(["instagram:1"], (dd) => { dd.schedule = { mode: "later", at: null, sameForAll: true }; });
    const r = publishReadiness(d, accounts, noChecks);
    expect(r.buckets.find((b) => b.id === "timing")!.ok).toBe(false);
    expect(r.required.some((f) => f.field === "scheduledAt")).toBe(true);
    expect(r.percent).toBeLessThan(100);
  });

  it("treats publish-now as timing-settled", () => {
    const d = draftWith(["instagram:1"], (dd) => { dd.schedule = { mode: "now", at: null, sameForAll: true }; });
    const r = publishReadiness(d, accounts, noChecks);
    expect(r.buckets.find((b) => b.id === "timing")!.ok).toBe(true);
    expect(r.percent).toBe(100);
  });
});
