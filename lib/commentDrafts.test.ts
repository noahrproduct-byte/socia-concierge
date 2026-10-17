import { describe, it, expect, vi, beforeEach } from "vitest";

// The sync with its platform reads and the AI stubbed out, so what's tested is
// what SOCIA does with the comments: draft, save, and say when it can't.
const create = vi.fn(async () => ({ model: "claude-opus-5-5", content: [{ type: "text", text: "Thanks! We're open 10 to 4 on Sundays." }], usage: { input_tokens: 10, output_tokens: 5 } }));
vi.mock("./anthropic", () => ({ anthropic: { messages: { create } }, MODEL: "claude-opus-5-5", effortFor: () => ({}) }));
vi.mock("./aiUsage", () => ({ recordAiUsage: () => {} }));
vi.mock("./facebookSync", () => ({ getFbSnapshot: async () => null }));
vi.mock("./instagramSync", () => ({
  getIgSnapshot: async () => ({ followers_count: 120, media: [{ id: "m1", timestamp: "2026-10-15T10:00:00Z", caption: "Sunday brunch", comments_count: 2 }] }),
}));
vi.mock("./comments", () => ({
  fetchFacebookComments: async () => ({ comments: [], postsChecked: 0, postsFailed: 0, problem: null, returned: 0 }),
  fetchInstagramComments: async () => ({
    comments: [
      { platform: "instagram", accountId: "ig1", postId: "m1", postCaption: "Sunday brunch", commentId: "c1", author: "@mia", text: "Are you open on Sundays?", createdAt: "2026-10-16T09:00:00Z", likeCount: 0 },
      { platform: "instagram", accountId: "ig1", postId: "m1", postCaption: "Sunday brunch", commentId: "c2", author: "@leo", text: "Do you take bookings?", createdAt: "2026-10-16T08:00:00Z", likeCount: 0 },
    ],
    postsChecked: 1, postsFailed: 0, problem: null, returned: 2,
  }),
  replyToComment: async () => ({ ok: true, replyId: "r1" }),
}));

const { syncCommentDrafts } = await import("./commentDrafts");

type Res = { data?: unknown; error: { message: string } | null };
function db(opts: { read: Res; upsert: Res }) {
  const upserts: unknown[] = [];
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q, in: () => Promise.resolve(opts.read),
    upsert: (row: unknown) => { upserts.push(row); return Promise.resolve(opts.upsert); },
  });
  return { client: { from: () => q }, upserts };
}
const brand = { name: "Salvo's", niche: "restaurant", notes: null } as never;

beforeEach(() => create.mockClear());

describe("drafting replies to new comments", () => {
  it("drafts and saves a reply for each new comment", async () => {
    const { client, upserts } = db({ read: { data: [], error: null }, upsert: { error: null } });
    const r = await syncCommentDrafts(client, "owner", "ws", brand);
    expect(r).toMatchObject({ scanned: 2, newComments: 2, drafted: 2, problems: [] });
    expect(upserts).toHaveLength(2);
    expect(upserts[0]).toMatchObject({ comment_id: "c1", author: "@mia", draft: "Thanks! We're open 10 to 4 on Sundays.", status: "drafted" });
  });

  it("skips comments it already has a draft for", async () => {
    const { client } = db({ read: { data: [{ platform: "instagram", comment_id: "c1" }], error: null }, upsert: { error: null } });
    const r = await syncCommentDrafts(client, "owner", "ws", brand);
    expect(r).toMatchObject({ newComments: 1, drafted: 1 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("drafts nothing and says so when drafts can't be read back (no AI spent)", async () => {
    const { client, upserts } = db({ read: { error: { message: 'relation "comment_drafts" does not exist' } }, upsert: { error: null } });
    const r = await syncCommentDrafts(client, "owner", "ws", brand);
    expect(create).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
    expect(r.drafted).toBe(0);
    expect(r.problems).toEqual([expect.objectContaining({ platform: "socia", message: expect.stringContaining("couldn't save reply drafts") })]);
  });

  it("stops after the first draft that can't be saved, and says so", async () => {
    const { client, upserts } = db({ read: { data: [], error: null }, upsert: { error: { message: "permission denied" } } });
    const r = await syncCommentDrafts(client, "owner", "ws", brand);
    expect(create).toHaveBeenCalledTimes(1);
    expect(upserts).toHaveLength(1);
    expect(r.drafted).toBe(0);
    expect(r.problems[0]).toMatchObject({ platform: "socia" });
  });
});
