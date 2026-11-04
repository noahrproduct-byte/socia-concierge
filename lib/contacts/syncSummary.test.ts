import { describe, expect, it } from "vitest";
import { syncSummary } from "./contacts";

describe("the update summary", () => {
  it("says what was recorded, then which posts couldn't be read", () => {
    expect(syncSummary({ added: 22, comments: 37, problem: "Instagram said: Unsupported get request. Object with ID '1' does not exist", postsChecked: 12, postsFailed: 1 }))
      .toBe("22 new contacts, 37 new comments recorded. 1 of 12 posts couldn't be read, most likely because they were deleted from Instagram.");
  });
  it("shows the problem alone when no post could be read", () => {
    expect(syncSummary({ added: 0, comments: 0, problem: "The Instagram connection has expired. Reconnect it in Settings.", postsChecked: 12, postsFailed: 12 }))
      .toBe("The Instagram connection has expired. Reconnect it in Settings.");
  });
  it("shows a setup problem when nothing was checked", () => {
    expect(syncSummary({ added: 0, comments: 0, problem: "Connect Instagram in Settings to find the people who comment on your posts.", postsChecked: 0, postsFailed: 0 }))
      .toBe("Connect Instagram in Settings to find the people who comment on your posts.");
  });
  it("says when nothing is new", () => {
    expect(syncSummary({ added: 0, comments: 0, problem: null, postsChecked: 12, postsFailed: 0 })).toBe("No new comments since the last update.");
  });
});
