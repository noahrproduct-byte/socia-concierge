import { AUTO_REPLY_MAX } from "./commentDrafts";
import { describe, expect, it } from "vitest";
import { pickAutoSends } from "./commentAuto";
import type { CommentDraft } from "./commentDrafts";

const now = new Date("2026-11-04T12:00:00Z");
const on = "2026-11-03T12:00:00Z";
const draft = (over: Partial<CommentDraft> = {}): CommentDraft => ({
  id: "d1", platform: "instagram", account_id: "ig1", post_id: "m1", comment_id: "c1", author: "@mia", comment_text: "Love this!",
  comment_created_at: "2026-11-04T10:00:00Z", post_caption: null, draft: "Thank you, Mia!", status: "drafted", sent_reply_id: null, error: null,
  created_at: "2026-11-04T10:05:00Z", updated_at: "2026-11-04T10:05:00Z", auto_ok: true, sent_automatically: false, ...over,
});

describe("pickAutoSends: which replies go out without a person", () => {
  it("sends a short friendly reply the drafter judged simple", () => {
    expect(pickAutoSends([draft()], on, now).map((d) => d.id)).toEqual(["d1"]);
  });

  it("never sends what a person should check, or what's already handled", () => {
    expect(pickAutoSends([
      draft({ id: "q", auto_ok: false }),
      draft({ id: "unjudged", auto_ok: null }),
      draft({ id: "sent", status: "sent" }),
      draft({ id: "skipped", status: "skipped" }),
      draft({ id: "auto-sent", sent_automatically: true }),
      draft({ id: "empty", draft: "  " }),
      draft({ id: "long", draft: "x".repeat(AUTO_REPLY_MAX + 1) }),
      draft({ id: "lines", draft: "Thanks!\nSee you" }),
    ], on, now)).toEqual([]);
  });

  it("only answers comments made after it was turned on, and in the last three days", () => {
    expect(pickAutoSends([draft({ comment_created_at: "2026-11-03T11:00:00Z" })], on, now)).toEqual([]);
    expect(pickAutoSends([draft({ comment_created_at: "2026-11-01T11:00:00Z" })], "2026-10-01T00:00:00Z", now)).toEqual([]);
    expect(pickAutoSends([draft()], null, now)).toEqual([]);
  });

  it("answers the oldest first, at most the run's share", () => {
    const ds = [draft({ id: "b", comment_created_at: "2026-11-04T11:00:00Z" }), draft({ id: "a", comment_created_at: "2026-11-04T09:00:00Z" }), draft({ id: "c", comment_created_at: "2026-11-04T11:30:00Z" })];
    expect(pickAutoSends(ds, on, now, 2).map((d) => d.id)).toEqual(["a", "b"]);
  });
});
