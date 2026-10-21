import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { resolveDeleteCapability, YT_DELETE_SCOPES, FB_IG_DELETE_SCOPE, type DeleteInputs } from "./capability";
import { DELETE_COPY, deleteNoun, deletedLine, type DeleteReasonCode, type DeleteTarget } from "./types";
import { YT_WRITE_SCOPE } from "../youtubeAuth";
import { FB_SCOPES } from "../facebook";

const NOW = new Date("2026-10-21T12:00:00Z");
const DASH = String.fromCharCode(0x2014);

const target = (over: Partial<DeleteTarget> = {}): DeleteTarget => ({
  platform: "instagram", accountId: "1784", externalId: "m1", permalink: "https://www.instagram.com/reel/abc/",
  postId: "p1", destinationId: "d1", collabOwner: null, caption: "Kitchen walkthrough", ...over,
});

const fbRow = (over: Partial<NonNullable<DeleteInputs["facebook"]>> = {}): NonNullable<DeleteInputs["facebook"]> => ({
  pageId: "page1", igBusinessId: "1784", igBusinessUsername: "salvoshermitage", hasPageToken: true, hasUserToken: true,
  userTokenExpiresAt: "2026-12-01T00:00:00Z", scopes: ["instagram_basic", FB_IG_DELETE_SCOPE, "pages_manage_posts"], status: "connected", suspended: false, ...over,
});

const inputs = (over: Partial<DeleteInputs> = {}): DeleteInputs => ({
  target: target(),
  facebook: fbRow(),
  instagram: { igUserId: "1784", username: "salvoshermitage" },
  youtube: null,
  ledgerAvailable: true,
  now: NOW,
  ...over,
});

const code = (i: DeleteInputs): DeleteReasonCode | "ok" => {
  const c = resolveDeleteCapability(i);
  return c.canDelete ? "ok" : c.code;
};

describe("resolveDeleteCapability: Instagram", () => {
  it("deletes with the Facebook user token when the Page is linked to the same account", () => {
    const c = resolveDeleteCapability(inputs());
    expect(c).toMatchObject({ canDelete: true, via: "facebook_user_token", platform: "instagram" });
  });

  it("refuses before the migration", () => {
    expect(code(inputs({ ledgerAvailable: false }))).toBe("migration");
  });

  it("refuses a collab post another account posted", () => {
    const c = resolveDeleteCapability(inputs({ target: target({ collabOwner: "chef_ana" }) }));
    expect(c.canDelete).toBe(false);
    if (!c.canDelete) expect(c.reason).toContain("@chef_ana");
  });

  it("asks to connect Facebook when there is no Page", () => {
    const c = resolveDeleteCapability(inputs({ facebook: null }));
    expect(c).toMatchObject({ canDelete: false, code: "ig_no_facebook", action: "connect_facebook" });
    if (!c.canDelete) expect(c.reason).toContain("@salvoshermitage");
  });

  it("refuses when the Page is linked to a different Instagram account", () => {
    const c = resolveDeleteCapability(inputs({ facebook: fbRow({ igBusinessId: "999", igBusinessUsername: "other_place" }) }));
    expect(c).toMatchObject({ canDelete: false, code: "ig_facebook_other_account" });
    if (!c.canDelete) expect(c.reason).toContain("@other_place");
  });

  it("lets the id decide when Meta returned one, and the handle only when it did not", () => {
    expect(code(inputs({ facebook: fbRow({ igBusinessId: "999", igBusinessUsername: "SalvosHermitage" }) }))).toBe("ig_facebook_other_account");
    expect(code(inputs({ facebook: fbRow({ igBusinessId: null, igBusinessUsername: "SalvosHermitage" }) }))).toBe("ok");
  });

  it("never deletes a post that went to another Instagram account", () => {
    expect(code(inputs({ target: target({ accountId: "5555" }) }))).toBe("ig_account_changed");
  });

  it("says Instagram is not connected when it is missing or paused", () => {
    expect(code(inputs({ instagram: null }))).toBe("ig_not_connected");
  });

  it("asks to reconnect when the user token is missing, expired or lacks the permission", () => {
    expect(code(inputs({ facebook: fbRow({ hasUserToken: false }) }))).toBe("facebook_reconnect");
    expect(code(inputs({ facebook: fbRow({ userTokenExpiresAt: "2026-10-01T00:00:00Z" }) }))).toBe("facebook_expired");
    expect(code(inputs({ facebook: fbRow({ status: "expired" }) }))).toBe("facebook_expired");
    expect(code(inputs({ facebook: fbRow({ scopes: ["instagram_basic"] }) }))).toBe("facebook_missing_scope");
  });

  it("tries when the granted list is unknown (Meta decides)", () => {
    expect(code(inputs({ facebook: fbRow({ scopes: null }) }))).toBe("ok");
  });

  it("refuses a Page paused by the plan", () => {
    expect(code(inputs({ facebook: fbRow({ suspended: true }) }))).toBe("facebook_suspended");
  });
});

describe("resolveDeleteCapability: YouTube", () => {
  const yt = (scopes: string[] | null, channelId: string | null = "UC1") => inputs({ target: target({ platform: "youtube", accountId: "UC1", externalId: "v1", permalink: "https://youtu.be/v1" }), youtube: { channelId, scopes } });

  it("needs a scope that can delete; youtube.upload alone cannot", () => {
    expect(code(yt([YT_WRITE_SCOPE]))).toBe("ok");
    expect(code(yt(["https://www.googleapis.com/auth/youtube.force-ssl"]))).toBe("ok");
    expect(code(yt(["https://www.googleapis.com/auth/youtube.upload"]))).toBe("yt_needs_scope");
    expect(code(yt(["https://www.googleapis.com/auth/youtube.readonly"]))).toBe("yt_needs_scope");
  });

  it("does not treat an unknown scope list as permission", () => {
    expect(code(yt(null))).toBe("yt_needs_scope");
  });

  it("says exactly how to fix a read-only connection", () => {
    const c = resolveDeleteCapability(yt(["https://www.googleapis.com/auth/youtube.readonly"]));
    expect(c).toMatchObject({ canDelete: false, action: "reconnect_youtube" });
    if (!c.canDelete) expect(c.reason).toBe("Reconnect YouTube with the broader permission (Settings, Enable uploads) to delete videos from SOCIA. Until then, delete it on YouTube.");
  });

  it("refuses another channel's video and a missing connection", () => {
    expect(code(yt([YT_WRITE_SCOPE], "UC2"))).toBe("yt_channel_mismatch");
    expect(code(inputs({ target: target({ platform: "youtube", accountId: "UC1" }), youtube: null }))).toBe("yt_not_connected");
  });

  it("keeps the connect scope in the delete list", () => {
    expect(YT_DELETE_SCOPES).toContain(YT_WRITE_SCOPE);
  });
});

describe("resolveDeleteCapability: Facebook and TikTok", () => {
  it("deletes a Page post with the Page token", () => {
    const c = resolveDeleteCapability(inputs({ target: target({ platform: "facebook", accountId: "page1", externalId: "page1_55" }) }));
    expect(c).toMatchObject({ canDelete: true, via: "facebook_page_token" });
  });

  it("uses Facebook wording when the Page permission is missing", () => {
    const c = resolveDeleteCapability(inputs({ target: target({ platform: "facebook", accountId: "page1" }), facebook: fbRow({ scopes: ["pages_show_list"] }) }));
    expect(c).toMatchObject({ canDelete: false, code: "fb_missing_scope" });
    if (!c.canDelete) expect(c.reason).not.toContain("Instagram");
  });

  it("refuses another Page or a missing token", () => {
    expect(code(inputs({ target: target({ platform: "facebook", accountId: "page2" }) }))).toBe("fb_not_connected");
    expect(code(inputs({ target: target({ platform: "facebook", accountId: "page1" }), facebook: fbRow({ hasPageToken: false }) }))).toBe("fb_not_connected");
  });

  it("never deletes on TikTok, and links to the video", () => {
    const c = resolveDeleteCapability(inputs({ target: target({ platform: "tiktok", permalink: "https://www.tiktok.com/@x/video/1" }) }));
    expect(c).toMatchObject({ canDelete: false, code: "tiktok_no_api", platformUrl: "https://www.tiktok.com/@x/video/1" });
  });

  it("carries the post's link on every refusal", () => {
    for (const i of [inputs({ facebook: null }), inputs({ ledgerAvailable: false }), inputs({ target: target({ collabOwner: "x" }) })]) {
      const c = resolveDeleteCapability(i);
      expect(c.platformUrl).toBe("https://www.instagram.com/reel/abc/");
    }
  });
});

describe("copy and helpers", () => {
  it("asks Meta for the Instagram content permission and keeps the publishing one", () => {
    expect(FB_SCOPES.split(",")).toContain("instagram_manage_contents");
    expect(FB_SCOPES.split(",")).toContain("pages_manage_posts");
  });

  it("names what is deleted", () => {
    expect(deleteNoun("instagram", "REELS")).toBe("Reel");
    expect(deleteNoun("instagram", "reel")).toBe("Reel");
    expect(deleteNoun("instagram", "CAROUSEL_ALBUM")).toBe("carousel");
    expect(deleteNoun("instagram", "IMAGE")).toBe("post");
    expect(deleteNoun("youtube", null)).toBe("video");
  });

  it("prints the deletion date the same on server and browser", () => {
    expect(deletedLine("instagram", "2026-10-21T23:30:00Z")).toBe("Deleted from Instagram on Oct 21, 2026");
  });

  it("uses no em dashes anywhere in the feature", () => {
    for (const reason of Object.values(DELETE_COPY)) expect(reason({ handle: "a", other: "b", owner: "c" })).not.toContain(DASH);
    const files = [
      ...readdirSync(join(process.cwd(), "lib/platformDelete")).map((f) => join("lib/platformDelete", f)),
      "components/DeleteOnPlatform.tsx",
      "app/api/posts/[id]/platform-delete/route.ts",
      "app/api/platform-posts/[platform]/[id]/route.ts",
    ];
    for (const f of files) expect(readFileSync(join(process.cwd(), f), "utf8").includes(DASH), f).toBe(false);
  });
});
