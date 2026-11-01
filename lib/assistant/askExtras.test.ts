import { describe, expect, it } from "vitest";
import { instagramAsk, ratedBlock, sanitizeRated, withInstagramAsk } from "./askExtras";
import { defaultSettings, type InstagramSettings } from "@/lib/publishing/types";

const ig = () => defaultSettings("instagram") as InstagramSettings;

describe("rated videos from the browser", () => {
  it("keeps well-formed ones and drops the rest", () => {
    const out = sanitizeRated([
      { ref: "V1", name: "pizza.mp4", kind: "video", ratedAt: "2026-11-01T15:00:00Z", durationSec: 21.6, summary: "A slice pull.", caption: "Fresh out" },
      { ref: "X9", name: "bad.mp4", ratedAt: "2026-11-01T15:00:00Z" },
      { ref: "V2", name: "", ratedAt: "2026-11-01T15:00:00Z" },
      { ref: "V3", name: "no-date.mp4" },
      "junk",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ref: "V1", durationSec: 22, kind: "video" });
  });

  it("marks the latest and says when there's no caption", () => {
    const now = new Date("2026-11-01T15:05:00Z");
    const block = ratedBlock(sanitizeRated([
      { ref: "V2", name: "b.mp4", ratedAt: "2026-11-01T15:04:00Z", durationSec: 10, summary: "", caption: "" },
      { ref: "V1", name: "a.mp4", ratedAt: "2026-11-01T14:00:00Z", durationSec: 12, summary: "A pour.", caption: "Hi" },
    ]), now);
    expect(block).toContain('[V2] "b.mp4", a 10-second video, rated 1 minute ago (the latest). No caption written yet.');
    expect(block).toContain('[V1] "a.mp4", a 12-second video, rated 1 hour ago. SOCIA\'s read: A pour. Caption so far: "Hi"');
    expect(ratedBlock([], now)).toBe("");
  });
});

describe("Instagram choices said in the chat", () => {
  it("makes a Trial Reel that shares if it performs by default", () => {
    expect(instagramAsk({ trialReel: "yes", trialShare: "default", collaborators: [] }, "make it a trial reel")).toEqual({ trial: "if_performing", collaborators: [], notes: [] });
    expect(instagramAsk({ trialReel: "yes", trialShare: "manual", collaborators: [] }, "trial reel, I'll share it myself")?.trial).toBe("manual");
    expect(instagramAsk({ trialReel: "no", trialShare: "default", collaborators: [] }, "normal reel")?.trial).toBe("off");
  });

  it("adds only collaborators the person actually wrote", () => {
    const a = instagramAsk({ trialReel: "unchanged", trialShare: "default", collaborators: ["@Salvos.Pizza", "madeup_account"] }, "add @salvos.pizza as a collaborator");
    expect(a?.collaborators).toEqual(["salvos.pizza"]);
    // "salvos" alone is not "salvos.pizza"
    expect(instagramAsk({ trialReel: "unchanged", trialShare: "default", collaborators: ["salvos"] }, "add salvos.pizza")).toBeNull();
  });

  it("refuses invalid names and more than five", () => {
    const text = "collab with a1 a2 a3 a4 a5 a6 and bad name!";
    const a = instagramAsk({ trialReel: "unchanged", trialShare: "default", collaborators: ["a1", "a2", "a3", "a4", "a5", "a6", "bad name!"] }, text);
    expect(a?.collaborators).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(a?.notes.join(" ")).toMatch(/up to 5/);
    expect(a?.notes.join(" ")).toMatch(/isn't a valid Instagram username/);
  });

  it("returns nothing when nothing was asked", () => {
    expect(instagramAsk({ trialReel: "unchanged", trialShare: "default", collaborators: [] }, "schedule it friday")).toBeNull();
    expect(instagramAsk(null, "x")).toBeNull();
  });
});

describe("applying them to a post's Instagram settings", () => {
  it("turns on a Trial Reel as a Reel", () => {
    const s = withInstagramAsk({ ...ig(), format: "image" } as InstagramSettings, { trial: "if_performing", collaborators: [], notes: [] }, null);
    expect(s.trial).toEqual({ share: "if_performing" });
    expect(s.format).toBe("reel");
  });

  it("joins collaborators to the ones already there and keeps a matching check only", () => {
    const base = { ...ig(), collaborators: ["old.one"] };
    const check = { usernames: ["new.one", "old.one"], status: "accepted" as const, message: null, at: "2026-11-01T00:00:00Z" };
    const s = withInstagramAsk(base, { trial: null, collaborators: ["new.one"], notes: [] }, check);
    expect(s.collaborators).toEqual(["old.one", "new.one"]);
    expect(s.collaboratorsCheck).toBe(check);
    const stale = withInstagramAsk(base, { trial: null, collaborators: ["new.one"], notes: [] }, { ...check, usernames: ["new.one"] });
    expect(stale.collaboratorsCheck).toBeNull();
  });

  it("takes a Trial Reel off", () => {
    expect(withInstagramAsk({ ...ig(), trial: { share: "manual" } }, { trial: "off", collaborators: [], notes: [] }, null).trial).toBeNull();
  });
});
