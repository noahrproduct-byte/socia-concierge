import { beforeEach, describe, it, expect, vi } from "vitest";
import type { Ctx } from "../context";
import type { Deleters, PlatformAnswer } from "./deleters";
import type { DeleteTarget } from "./types";

// ---- module seams --------------------------------------------------------------
const igMedia = { current: [] as Record<string, unknown>[] };
vi.mock("../instagramSync", () => ({
  getActiveConnection: vi.fn(async () => ({ ig_user_id: "1784", username: "salvoshermitage", access_token: "IG-LOGIN-TOKEN" })),
  getIgSnapshot: vi.fn(async () => ({ media: igMedia.current })),
  syncInstagram: vi.fn(async () => null),
}));
const yt = { current: null as null | { token: string; channelId: string | null; scopes: string[] | null } };
vi.mock("../youtubeData", () => ({ youtubeAccessToken: vi.fn(async () => yt.current) }));
const fbSnap = { current: null as null | { page_id: string | null; posts: { id: string; message?: string; permalink_url?: string }[] } };
vi.mock("../facebookSync", () => ({ getFbSnapshot: vi.fn(async () => fbSnap.current) }));
vi.mock("../workspaces", () => ({ connectionWorkspaceId: vi.fn(async () => "ws1") }));
vi.mock("../planOutcomesLoad", () => ({
  loadMeasureSources: vi.fn(async () => ({ instagram: igMedia.current, facebook: null, youtube: null, youtubeRecent: null })),
}));
vi.mock("../liveCache", () => ({ clearLiveCache: vi.fn() }));
vi.mock("../background", () => ({ scheduleBackground: vi.fn(() => true) }));
const updateDestination = vi.fn(async () => undefined);
vi.mock("../publishing/db", async (orig) => ({ ...(await orig<typeof import("../publishing/db")>()), updateDestination: (...a: unknown[]) => updateDestination(...(a as [])) }));

const { performPlatformDelete, targetForSyncedPost, targetForDestination } = await import("./service");

// ---- an in-memory Supabase ---------------------------------------------------------
type Row = Record<string, unknown>;
function fakeClient(tables: Record<string, Row[]>) {
  const writes: { table: string; op: "insert" | "update"; value: Row }[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: { kind: "select" } | { kind: "insert"; value: Row } | { kind: "update"; value: Row } = { kind: "select" };
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return b; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
      limit: () => b,
      order: () => b,
      maybeSingle: () => {
        if (!(table in tables)) return Promise.resolve({ data: null, error: { code: "42P01", message: "missing" } });
        return Promise.resolve({ data: tables[table].filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null });
      },
      insert: (value: Row) => { op = { kind: "insert", value }; return b; },
      update: (value: Row) => { op = { kind: "update", value }; return b; },
      then: (res: (v: { data: unknown; error: unknown }) => unknown) => {
        if (!(table in tables)) return Promise.resolve({ data: null, error: { code: "42P01", message: `relation "${table}" does not exist` } }).then(res);
        const rows = tables[table].filter((r) => filters.every((f) => f(r)));
        if (op.kind === "insert") { tables[table].push(op.value); writes.push({ table, op: "insert", value: op.value }); return Promise.resolve({ data: null, error: null }).then(res); }
        if (op.kind === "update") { const v = op.value; rows.forEach((r) => Object.assign(r, v)); writes.push({ table, op: "update", value: v }); return Promise.resolve({ data: null, error: null }).then(res); }
        return Promise.resolve({ data: rows, error: null }).then(res);
      },
    };
    return b;
  };
  return { client: { from } as unknown as Ctx["client"], writes, tables };
}

const NOW = new Date("2026-10-21T12:00:00Z");
const target = (over: Partial<DeleteTarget> = {}): DeleteTarget => ({
  platform: "instagram", accountId: "1784", externalId: "m1", permalink: "https://www.instagram.com/reel/abc/",
  postId: "p1", destinationId: "d1", collabOwner: null, caption: "Kitchen walkthrough", ...over,
});

const fbRow = (): Row => ({
  user_id: "owner", workspace_id: "ws1", page_id: "page1", ig_business_id: "1784", ig_business_username: "salvoshermitage",
  access_token: "PAGE-TOKEN", user_access_token: "FB-USER-TOKEN", user_token_expires_at: "2026-12-01T00:00:00Z",
  scopes: ["instagram_basic", "instagram_manage_contents", "pages_manage_posts"], connection_status: "connected", plan_suspended_at: null,
});

function deps(answer: PlatformAnswer, exists: boolean | null = null) {
  return {
    deleteInstagramMedia: vi.fn(async () => answer),
    deleteFacebookPost: vi.fn(async () => answer),
    deleteYouTubeVideo: vi.fn(async () => answer),
    instagramMediaExists: vi.fn(async () => exists),
    facebookObjectExists: vi.fn(async () => exists),
    youtubeVideoExists: vi.fn(async () => exists),
    youtubeVideoChannel: vi.fn(async () => "UC1"),
  } satisfies Deleters;
}

const notFound: PlatformAnswer = { ok: false, code: "100", message: "Instagram said: Object does not exist", kind: "not_found" };

let db: ReturnType<typeof fakeClient>;
let ctx: Ctx;
beforeEach(() => {
  updateDestination.mockClear();
  yt.current = null;
  fbSnap.current = null;
  igMedia.current = [
    { id: "m1", timestamp: "2026-10-01T00:00:00Z", like_count: 400, comments_count: 12 },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, timestamp: "2026-09-20T00:00:00Z", like_count: 100, comments_count: 4 })),
  ];
  db = fakeClient({ platform_deletions: [], facebook_connections: [fbRow()], scheduled_posts: [{ id: "p1", user_id: "owner", status: "published", published_media_id: "m1" }] });
  ctx = { viewerId: "admin1", ownerId: "owner", workspace: { id: "ws1" } as Ctx["workspace"], role: "admin", client: db.client, isOwner: false };
});

const ledger = () => db.tables.platform_deletions;

describe("performPlatformDelete", () => {
  it("records a confirmed deletion with the frozen last measurement", async () => {
    const d = deps({ ok: true, gone: false, response: { success: true, deleted_id: "m1" } });
    const out = await performPlatformDelete(ctx, target(), { deps: d, now: NOW, format: "REELS" });
    expect(out).toEqual({ ok: true, deletedAt: NOW.toISOString(), gone: false });
    expect(d.deleteInstagramMedia).toHaveBeenCalledWith("m1", "FB-USER-TOKEN");
    expect(ledger()).toHaveLength(1);
    expect(ledger()[0]).toMatchObject({ user_id: "owner", workspace_id: "ws1", platform: "instagram", external_id: "m1", deleted_by: "admin1", media_kind: "REELS" });
    const [, id, patch] = updateDestination.mock.calls[0] as unknown as [unknown, string, Record<string, unknown>];
    expect(id).toBe("d1");
    expect(patch).toMatchObject({ deletedAt: NOW.toISOString(), deletedBy: "admin1" });
    expect(patch.deletedResult).toMatchObject({ found: true, value: 412, measuredAt: NOW.toISOString() });
    expect(JSON.stringify(ledger()[0])).not.toMatch(/TOKEN/);
  });

  it("does not mark anything when Meta says 'not found' but the post is still there", async () => {
    const d = deps(notFound, true);
    const out = await performPlatformDelete(ctx, target(), { deps: d, now: NOW });
    expect(out.ok).toBe(false);
    if (!out.ok && "error" in out) expect(out.error).toContain("still live");
    expect(d.instagramMediaExists).toHaveBeenCalledWith("m1", "IG-LOGIN-TOKEN");
    expect(ledger()).toHaveLength(0);
    expect(updateDestination).not.toHaveBeenCalled();
  });

  it("does not mark anything when it cannot confirm the post is gone", async () => {
    const out = await performPlatformDelete(ctx, target(), { deps: deps(notFound, null), now: NOW });
    expect(out.ok).toBe(false);
    if (!out.ok && "error" in out) expect(out.error).toContain("nothing was changed");
    expect(ledger()).toHaveLength(0);
  });

  it("marks it deleted when a second read agrees it is gone", async () => {
    const out = await performPlatformDelete(ctx, target(), { deps: deps(notFound, false), now: NOW });
    expect(out).toEqual({ ok: true, deletedAt: NOW.toISOString(), gone: true });
    expect(ledger()[0]).toMatchObject({ platform_response: { gone: true } });
  });

  it("writes nothing when the platform refuses, and quotes it", async () => {
    const out = await performPlatformDelete(ctx, target(), { deps: deps({ ok: false, code: "9004", message: "Instagram said: Media Type Not Supported", kind: "final" }), now: NOW });
    expect(out).toEqual({ ok: false, error: "Instagram said: Media Type Not Supported", code: "9004" });
    expect(ledger()).toHaveLength(0);
    expect(updateDestination).not.toHaveBeenCalled();
  });

  it("is idempotent: a recorded deletion is not sent again", async () => {
    ledger().push({ user_id: "owner", platform: "instagram", external_id: "m1", deleted_at: "2026-10-20T09:00:00Z" });
    const d = deps({ ok: true, gone: false, response: {} });
    const out = await performPlatformDelete(ctx, target(), { deps: d, now: NOW });
    expect(out).toEqual({ ok: true, deletedAt: "2026-10-20T09:00:00Z", gone: false });
    expect(d.deleteInstagramMedia).not.toHaveBeenCalled();
  });

  it("refuses before calling Meta when no Facebook Page is linked", async () => {
    db.tables.facebook_connections.length = 0;
    const d = deps({ ok: true, gone: false, response: {} });
    const out = await performPlatformDelete(ctx, target(), { deps: d, now: NOW });
    expect(out.ok).toBe(false);
    if (!out.ok && "capability" in out) expect(out.capability).toMatchObject({ canDelete: false, code: "ig_no_facebook" });
    expect(d.deleteInstagramMedia).not.toHaveBeenCalled();
  });

  it("refuses before the migration, without calling Meta", async () => {
    delete (db.tables as Record<string, Row[]>).platform_deletions;
    const d = deps({ ok: true, gone: false, response: {} });
    const out = await performPlatformDelete(ctx, target(), { deps: d, now: NOW });
    if (!out.ok && "capability" in out) expect(out.capability).toMatchObject({ code: "migration" });
    else throw new Error("expected a capability refusal");
    expect(d.deleteInstagramMedia).not.toHaveBeenCalled();
  });

  it("freezes null, never 0, when the platform never reported the post", async () => {
    igMedia.current = igMedia.current.filter((m) => m.id !== "m1");
    await performPlatformDelete(ctx, target(), { deps: deps({ ok: true, gone: false, response: {} }), now: NOW });
    const [, , patch] = updateDestination.mock.calls[0] as unknown as [unknown, string, Record<string, unknown>];
    expect(patch.deletedResult).toBeNull();
  });

  it("marks a legacy Instagram row on scheduled_posts", async () => {
    await performPlatformDelete(ctx, target({ destinationId: null }), { deps: deps({ ok: true, gone: false, response: {} }), now: NOW });
    expect(updateDestination).not.toHaveBeenCalled();
    expect(db.tables.scheduled_posts[0]).toMatchObject({ deleted_at: NOW.toISOString(), deleted_by: "admin1" });
  });
});

describe("targetForSyncedPost", () => {
  it("offers only this workspace's channel's YouTube videos and Shorts", async () => {
    yt.current = { token: "YT-TOKEN", channelId: "UC1", scopes: ["https://www.googleapis.com/auth/youtube"] };
    const mine = await targetForSyncedPost(ctx, "youtube", "v1", { youtubeVideoChannel: vi.fn(async () => "UC1") });
    expect(mine).toMatchObject({ target: { platform: "youtube", accountId: "UC1", externalId: "v1", permalink: "https://www.youtube.com/watch?v=v1" } });
    const theirs = await targetForSyncedPost(ctx, "youtube", "v2", { youtubeVideoChannel: vi.fn(async () => "UC9") });
    expect(theirs).toMatchObject({ status: 404 });
    const unknown = await targetForSyncedPost(ctx, "youtube", "v3", { youtubeVideoChannel: vi.fn(async () => null) });
    expect(unknown).toMatchObject({ status: 409 });
  });

  it("refuses YouTube when no channel is connected", async () => {
    expect(await targetForSyncedPost(ctx, "youtube", "v1", { youtubeVideoChannel: vi.fn(async () => "UC1") })).toMatchObject({ status: 409 });
  });

  it("offers only posts on this workspace's Facebook Page", async () => {
    fbSnap.current = { page_id: "page1", posts: [{ id: "page1_55", message: "Brunch", permalink_url: "https://facebook.com/x" }] };
    expect(await targetForSyncedPost(ctx, "facebook", "page1_55")).toMatchObject({ target: { platform: "facebook", accountId: "page1", externalId: "page1_55" } });
    expect(await targetForSyncedPost(ctx, "facebook", "other_1")).toMatchObject({ status: 404 });
  });

  it("offers only media in this workspace's Instagram snapshot", async () => {
    expect(await targetForSyncedPost(ctx, "instagram", "m1")).toMatchObject({ target: { platform: "instagram", accountId: "1784", destinationId: null, postId: "p1" } });
    expect(await targetForSyncedPost(ctx, "instagram", "not-mine")).toMatchObject({ status: 404 });
  });
});

describe("targetForDestination", () => {
  it("never reaches a post from another of the owner's workspaces", async () => {
    db.tables.scheduled_posts[0].workspace_id = "ws2";
    expect(await targetForDestination(ctx, "p1", null)).toMatchObject({ status: 404 });
  });

  it("resolves a legacy post in this workspace to the account it went to", async () => {
    Object.assign(db.tables.scheduled_posts[0], { workspace_id: "ws1", ig_user_id: "1784", caption: "x", permalink: null, media_type: "REELS", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", scheduled_at: "2026-10-01T00:00:00Z" });
    db.tables.post_destinations = [];
    expect(await targetForDestination(ctx, "p1", null)).toMatchObject({ target: { platform: "instagram", accountId: "1784", externalId: "m1", destinationId: null } });
  });

  it("trusts an old row without its account only when the post is in this account's media", async () => {
    Object.assign(db.tables.scheduled_posts[0], { workspace_id: "ws1", ig_user_id: null, caption: "x", permalink: null, media_type: "REELS", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", scheduled_at: "2026-10-01T00:00:00Z" });
    db.tables.post_destinations = [];
    expect(await targetForDestination(ctx, "p1", null)).toMatchObject({ target: { accountId: "1784" } });
    igMedia.current = [];
    expect(await targetForDestination(ctx, "p1", null)).toMatchObject({ status: 409 });
  });
});
