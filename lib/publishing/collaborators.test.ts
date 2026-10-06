import { describe, it, expect } from "vitest";
import { buildContainerParams } from "../igPublish";
import { containerPlan } from "./adapters/instagram";
import { decideCheck, checkCovers, sortedUsernames } from "./collaborators";
import { collaboratorIssues } from "./validate";
import { defaultSettings, type InstagramSettings, type MediaItem } from "./types";

const AT = "2026-10-06T12:00:00Z";
const media = (kind: "image" | "video", url: string): MediaItem => ({ id: url, kind, name: url, mime: kind === "image" ? "image/jpeg" : "video/mp4", size: 1, width: 1080, height: 1080, duration: kind === "video" ? 10 : null, path: url, url });
const ig = (over: Partial<InstagramSettings>): InstagramSettings => ({ ...(defaultSettings("instagram") as InstagramSettings), ...over });

describe("collaborators on Instagram containers", () => {
  it("sends collaborators as a JSON list on Reels, images and carousel parents, never on carousel children", () => {
    expect(buildContainerParams({ mediaType: "REELS", mediaUrl: "v", collaborators: ["a", "b"] }).collaborators).toBe('["a","b"]');
    expect(buildContainerParams({ mediaType: "IMAGE", mediaUrl: "i", collaborators: ["a"] }).collaborators).toBe('["a"]');
    expect(buildContainerParams({ mediaType: "CAROUSEL", children: ["1", "2"], collaborators: ["a"] }).collaborators).toBe('["a"]');
    expect(buildContainerParams({ mediaType: "CAROUSEL_ITEM", mediaUrl: "i", collaborators: ["a"] }).collaborators).toBeUndefined();
    expect(buildContainerParams({ mediaType: "IMAGE", mediaUrl: "i", collaborators: [] }).collaborators).toBeUndefined();
    expect(buildContainerParams({ mediaType: "IMAGE", mediaUrl: "i", collaborators: ["a", "b", "c", "d"] }).collaborators).toBe('["a","b","c"]');
  });

  it("carries the settings' collaborators onto the parent of every format", () => {
    const reel = containerPlan(ig({ format: "reel", collaborators: ["friend"] }), [media("video", "v")], "cap");
    expect(reel.parent.collaborators).toEqual(["friend"]);
    const carousel = containerPlan(ig({ format: "carousel", collaborators: ["friend"] }), [media("image", "a"), media("image", "b")], "cap");
    expect(carousel.parent.collaborators).toEqual(["friend"]);
    expect(carousel.children.every((c) => c.collaborators == null)).toBe(true);
    // Settings saved before the field existed have none.
    const legacy = { ...ig({ format: "image" }) } as Partial<InstagramSettings>;
    delete legacy.collaborators;
    expect(containerPlan(legacy as InstagramSettings, [media("image", "a")], "cap").parent.collaborators).toBeNull();
  });
});

describe("the pre-flight verdict", () => {
  it("accepted only when Instagram refuses an invented username after taking the real ones", () => {
    const v = decideCheck(["Friend", "@other"], { ok: true, value: { id: "c1" } }, { ok: false, error: "Invalid parameter", code: 100 }, AT);
    expect(v).toMatchObject({ status: "accepted", usernames: ["friend", "other"], at: AT });
    expect(v.message).toMatch(/@friend, @other on a test \(nothing was posted\)/);
  });
  it("unconfirmed when Instagram takes an invented username too (or the probe hiccuped)", () => {
    expect(decideCheck(["friend"], { ok: true, value: { id: "c1" } }, { ok: true, value: { id: "c2" } }, AT).status).toBe("unconfirmed");
    expect(decideCheck(["friend"], { ok: true, value: { id: "c1" } }, { ok: false, error: "rate", code: 4 }, AT).status).toBe("unconfirmed");
  });
  it("rejected with Instagram's own words; transient failures are errors, not rejections", () => {
    const r = decideCheck(["friend"], { ok: false, error: "The user cannot be tagged as a collaborator", code: 100 }, null, AT);
    expect(r.status).toBe("rejected");
    expect(r.message).toBe("Instagram refused this collaborator: The user cannot be tagged as a collaborator");
    expect(decideCheck(["friend"], { ok: false, error: "timeout" }, null, AT).status).toBe("error");
  });
  it("a generic failure that disappears without collaborators is the collaborators' fault", () => {
    const unknown = { ok: false as const, error: "An unknown error occurred", code: 1 };
    const blamed = decideCheck(["salvospizza"], unknown, null, AT, { ok: true, value: { id: "plain" } });
    expect(blamed.status).toBe("rejected");
    expect(blamed.message).toMatch(/fails every time collaborators are added \(the same test without them works\)/);
    // Instagram failing the plain test too: nothing can be concluded.
    expect(decideCheck(["salvospizza"], unknown, null, AT, { ok: false, error: "An unknown error occurred", code: 1 }).status).toBe("error");
    expect(decideCheck(["salvospizza"], unknown, null, AT, null).status).toBe("error");
  });
  it("knows when a stored check still covers the list", () => {
    const check = decideCheck(["b", "A"], { ok: true, value: { id: "c" } }, { ok: false, error: "x", code: 100 }, AT);
    expect(sortedUsernames(["@B", "a", "a"])).toEqual(["a", "b"]);
    expect(checkCovers(check, ["a", "b"])).toBe(true);
    expect(checkCovers(check, ["a"])).toBe(false);
    expect(checkCovers(null, ["a"])).toBe(false);
  });
});

describe("scheduling rules for collaborators", () => {
  const checked = (status: "accepted" | "unconfirmed" | "rejected" | "error", usernames = ["friend"]) => ({ usernames, status, message: `${status}!`, at: AT });
  it("nothing to say without collaborators", () => {
    expect(collaboratorIssues(ig({ collaborators: [] }))).toEqual([]);
  });
  it("blocks an unchecked, stale, refused, invalid or oversized list", () => {
    expect(collaboratorIssues(ig({ collaborators: ["friend"], collaboratorsCheck: null }))[0]).toMatchObject({ code: "collaborators_unchecked", severity: "block" });
    expect(collaboratorIssues(ig({ collaborators: ["friend", "new"], collaboratorsCheck: checked("accepted") }))[0].code).toBe("collaborators_unchecked");
    expect(collaboratorIssues(ig({ collaborators: ["friend"], collaboratorsCheck: checked("rejected") }))[0]).toMatchObject({ code: "collaborators_rejected", severity: "block", message: "rejected!" });
    expect(collaboratorIssues(ig({ collaborators: ["bad name"] }))[0].code).toBe("collaborator_invalid");
    expect(collaboratorIssues(ig({ collaborators: ["a", "b", "c", "d"] }))[0].code).toBe("collaborators_many");
  });
  it("lets an accepted list through and warns when Instagram couldn't confirm", () => {
    expect(collaboratorIssues(ig({ collaborators: ["Friend"], collaboratorsCheck: checked("accepted") }))).toEqual([]);
    expect(collaboratorIssues(ig({ collaborators: ["friend"], collaboratorsCheck: checked("unconfirmed") }))[0]).toMatchObject({ severity: "warn" });
    expect(collaboratorIssues(ig({ collaborators: ["friend"], collaboratorsCheck: checked("error") }))[0]).toMatchObject({ code: "collaborators_check_failed", severity: "warn" });
  });
});
