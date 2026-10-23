import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MediaItem } from "../publishing/types";

// The database, the publisher, approvals and media storage are mocked; the
// platform rules (validateDestination, availabilityFor) are the real ones, so
// these tests check that an assistant's post meets exactly what the composer
// enforces.
const saved: { status: string; action: string; destinations: { platform: string; scheduledAt: string | null }[] }[] = [];
const published: string[][] = [];
const approvals: { requestedAt: string | null }[] = [];
const approvedOnSchedule: (string | null)[] = [];
let destStatus = "published";
const accounts = [
  { platform: "instagram", accountId: "ig-1", label: "Salvo's", handle: "salvoshermitage", avatar: null, status: "connected", suspended: false, scopes: null },
  { platform: "facebook", accountId: "fb-1", label: "Salvo's Page", handle: null, avatar: null, status: "connected", suspended: false, scopes: null },
  { platform: "youtube", accountId: "yt-1", label: "Salvo's Pizza", handle: null, avatar: null, status: "connected", suspended: false, scopes: ["https://www.googleapis.com/auth/youtube"] },
];

vi.mock("../publishing/db", () => ({
  MissingTableError: class extends Error {},
  MIGRATION_MESSAGE: "Run the migration.",
  loadPickerAccountsDetailed: async () => ({ accounts, complete: true }),
  saveItem: async (_c: unknown, _o: unknown, payload: { action: string; destinations: { platform: string; scheduledAt: string | null }[] }, status: string) => {
    saved.push({ status, action: payload.action, destinations: payload.destinations });
    return { id: "post-1", destinations: payload.destinations.map((d, i) => ({ id: `d${i}`, ...d, status })) };
  },
  stampPostWorkspace: async () => undefined,
  refreshParent: async () => undefined,
  loadItem: async () => ({
    id: "post-1",
    destinations: saved.at(-1)?.destinations.map((d, i) => ({ id: `d${i}`, platform: d.platform, accountId: "x", status: saved.at(-1)?.status === "draft" ? "draft" : destStatus, scheduledAt: d.scheduledAt, publishedAt: null, permalink: null, errorMessage: null })) ?? [],
  }),
}));
vi.mock("../publishing/runner", () => ({ publishNow: async (_c: unknown, _o: unknown, _i: unknown, targets: { platform: string }[]) => { published.push(targets.map((t) => t.platform)); return { uploads: [], outcomes: {} }; } }));
vi.mock("../approvals", () => ({
  approvalsEnabled: async () => true,
  approveOnSchedule: async (_ctx: unknown, _id: string, at: string | null) => { approvedOnSchedule.push(at); },
  insertApproval: async (_svc: unknown, rec: { requestedAt: string | null }) => { approvals.push({ requestedAt: rec.requestedAt }); return { ok: true, approval: { id: "a1" } }; },
  notifyApprovers: async () => undefined,
  memberEditBlock: async () => null,
}));
vi.mock("../entitlements", () => ({
  checkFeature: (ent: { features: Record<string, boolean> }, key: string) => (ent.features[key] ? { ok: true } : { ok: false, error: { error: `${key} isn't on this plan.` } }),
}));
const jpeg = (over: Partial<MediaItem> = {}): MediaItem => ({ id: "m-new", kind: "image", name: "pie.jpg", mime: "image/jpeg", size: 400_000, width: 1080, height: 1350, duration: null, path: "owner-1/assistant/x.jpg", url: "https://cdn.example/x.jpg", ...over });
let nextMedia: MediaItem = jpeg();
vi.mock("./media", () => ({
  MEDIA_BUCKET: "scheduled-media",
  copyWorkspaceMedia: async () => nextMedia,
  importLinkedMedia: async () => nextMedia,
}));

const { createPost, cancelPost, parseWhen, pickAccounts } = await import("./write");
const { ApiFailure } = await import("./context");

const removed: string[][] = [];
const svc = { storage: { from: () => ({ remove: async (paths: string[]) => { removed.push(paths); return {}; } }) } };
const deps = { svc, origin: "https://sociaos.com", deadline: Date.now() + 60_000 };
const ent = (features: Record<string, boolean> = { scheduling: true, approval_workflow: true }) => ({ plan: "pro", features }) as never;
const ctx = (role: "owner" | "admin" | "member" = "owner") => ({ viewerId: "viewer-1", ownerId: "owner-1", workspace: { id: "ws-1", name: "Salvo's" }, role, client: {}, isOwner: role === "owner" }) as never;
const post = (over: Record<string, unknown> = {}) => ({ caption: "Fresh out of the oven. #pizza", media: [{ media_id: "m1" }], platforms: [{ platform: "instagram" as const }], when: "now", ...over });

beforeEach(() => {
  saved.length = 0; published.length = 0; approvals.length = 0; approvedOnSchedule.length = 0; removed.length = 0;
  destStatus = "published"; nextMedia = jpeg();
});

describe("when a post goes out", () => {
  const NOW = new Date("2026-10-19T15:00:00Z");
  it("takes now, draft, or a future time that states its time zone", () => {
    expect(parseWhen("now", NOW)).toEqual({ mode: "now" });
    expect(parseWhen("Draft", NOW)).toEqual({ mode: "draft" });
    expect(parseWhen("2026-10-24T18:00:00-05:00", NOW)).toEqual({ mode: "schedule", at: "2026-10-24T23:00:00.000Z" });
    expect(() => parseWhen("2026-10-24T18:00:00", NOW)).toThrow(/time zone/);
    expect(() => parseWhen("2026-10-19T14:00:00Z", NOW)).toThrow(/not in the future/);
    expect(() => parseWhen("2028-01-01T00:00:00Z", NOW)).toThrow(/a year/);
  });
});

describe("which account", () => {
  it("uses the only account on a platform, or the one named, and asks when there are several", () => {
    expect(pickAccounts([{ platform: "instagram" }], accounts as never)[0].account.accountId).toBe("ig-1");
    expect(() => pickAccounts([{ platform: "tiktok" }], accounts as never)).toThrow(/No TikTok account/);
    const two = [...accounts, { ...accounts[0], accountId: "ig-2", handle: "salvosgallatin" }];
    expect(() => pickAccounts([{ platform: "instagram" }], two as never)).toThrow(/Pass account_id/);
    expect(pickAccounts([{ platform: "instagram", account_id: "ig-2" }], two as never)[0].account.handle).toBe("salvosgallatin");
    expect(() => pickAccounts([{ platform: "instagram", account_id: "nope" }], two as never)).toThrow(/isn't connected/);
    expect(() => pickAccounts([{ platform: "instagram" }, { platform: "instagram" }], accounts as never)).toThrow(/listed twice/);
  });
});

describe("creating a post", () => {
  it("publishes now through the same publisher as the composer, and reports what went live", async () => {
    const r = await createPost(ctx(), ent(), post(), deps);
    expect(saved).toEqual([expect.objectContaining({ status: "scheduled", action: "publish" })]);
    expect(published).toEqual([["instagram"]]);
    expect(approvedOnSchedule).toEqual([null]);
    expect(r).toMatchObject({ post_id: "post-1", result: "published", open_in_socia: "https://sociaos.com/create?post=post-1" });
  });

  it("schedules a future post without publishing it now", async () => {
    destStatus = "scheduled";
    const r = await createPost(ctx(), ent(), post({ when: "2030-01-01T18:00:00Z" }), deps).catch((e) => e);
    // More than a year ahead of the real clock is refused; use a near date instead.
    expect(r).toBeInstanceOf(ApiFailure);
    const soon = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
    const ok = await createPost(ctx(), ent(), post({ when: soon }), deps);
    expect(saved.at(-1)).toMatchObject({ status: "scheduled", action: "schedule" });
    expect(published).toEqual([]);
    expect(ok).toMatchObject({ result: "scheduled" });
  });

  it("never publishes YouTube or TikTok, but saves them as drafts", async () => {
    await expect(createPost(ctx(), ent(), post({ platforms: [{ platform: "instagram" }, { platform: "youtube", title: "Pie", made_for_kids: false }] }), deps)).rejects.toThrow(/YouTube uploads run from the browser/);
    expect(saved).toEqual([]);
    const r = await createPost(ctx(), ent(), post({ platforms: [{ platform: "youtube", title: "Pie" }], when: "draft" }), deps);
    expect(saved).toEqual([expect.objectContaining({ status: "draft", action: "draft" })]);
    expect(published).toEqual([]);
    expect(r).toMatchObject({ result: "draft" });
  });

  it("sends a Member's post for approval instead of publishing it", async () => {
    const r = await createPost(ctx("member"), ent(), post(), deps);
    expect(saved).toEqual([expect.objectContaining({ status: "draft", action: "draft" })]);
    expect(published).toEqual([]);
    expect(approvals).toEqual([{ requestedAt: null }]);
    expect(r).toMatchObject({ result: "submitted_for_approval" });
  });

  it("keeps a Member's post as a draft when the plan has no approvals", async () => {
    const r = await createPost(ctx("member"), ent({ scheduling: true, approval_workflow: false }), post(), deps);
    expect(approvals).toEqual([]);
    expect(r).toMatchObject({ result: "draft", note: expect.stringContaining("owner or an admin") });
  });

  it("refuses a post a platform would reject, and removes the media it copied", async () => {
    nextMedia = jpeg({ mime: "image/png", name: "pie.png", path: "owner-1/assistant/y.png" });
    await expect(createPost(ctx(), ent(), post(), deps)).rejects.toThrow(/Not ready to post/);
    expect(saved).toEqual([]);
    expect(removed).toEqual([["owner-1/assistant/y.png"]]);
  });

  it("refuses a plan without scheduling, and a media item that names both or neither source", async () => {
    await expect(createPost(ctx(), ent({ scheduling: false }), post(), deps)).rejects.toThrow(/scheduling isn't on this plan/);
    await expect(createPost(ctx(), ent(), post({ media: [{ media_id: "m1", url: "https://x.example/a.jpg" }] }), deps)).rejects.toThrow(/either a media_id/);
  });
});

describe("cancelling", () => {
  it("withdraws only what hasn't started going out", async () => {
    const calls: { table: string; op: string; args: unknown[] }[] = [];
    const chain = (table: string, result: unknown) => {
      const q: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "update"]) q[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return q; };
      q.maybeSingle = async () => result;
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return q;
    };
    const client = { from: (t: string) => (t === "scheduled_posts" ? chain(t, { data: { id: "00000000-0000-4000-8000-000000000001" }, error: null }) : chain(t, { data: [{ platform: "facebook" }], error: null })) };
    saved.push({ status: "scheduled", action: "schedule", destinations: [{ platform: "facebook", scheduledAt: null }] });
    destStatus = "cancelled";
    const r = await cancelPost({ ...(ctx() as object), client } as never, "00000000-0000-4000-8000-000000000001");
    expect(calls.find((c) => c.table === "post_destinations" && c.op === "in")?.args).toEqual(["status", ["draft", "ready", "scheduled", "failed"]]);
    expect(calls.some((c) => c.table === "scheduled_posts" && c.op === "eq" && c.args[0] === "workspace_id" && c.args[1] === "ws-1")).toBe(true);
    expect(r).toMatchObject({ cancelled: ["facebook"], note: "Withdrawn. Nothing will be published." });
  });
});

describe("copying media from links", () => {
  const links = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://cdn.example/${i}.mp4` }));

  it("stops at the per-post cap and removes what it already copied", async () => {
    nextMedia = jpeg({ kind: "video", mime: "video/mp4", size: 100 * 1024 * 1024, path: "owner-1/assistant/v.mp4" });
    const r = await createPost(ctx(), ent(), post({ media: links(5), when: "draft" }), deps).catch((e) => e);
    expect(r).toBeInstanceOf(ApiFailure);
    expect(String(r.message)).toMatch(/at most 250 MB/);
    expect(saved).toEqual([]);
    expect(removed.flat().length).toBeGreaterThanOrEqual(3);
  });

  it("starts no new link when the request is about to run out of time", async () => {
    const r = await createPost(ctx(), ent(), post({ media: links(1), when: "draft" }), { ...deps, deadline: Date.now() + 5_000 }).catch((e) => e);
    expect(r).toBeInstanceOf(ApiFailure);
    expect(String(r.message)).toMatch(/Too many links/);
    expect(saved).toEqual([]);
  });

  it("still takes files already in SOCIA however close the deadline", async () => {
    const r = await createPost(ctx(), ent(), post({ when: "draft" }), { ...deps, deadline: Date.now() + 5_000 });
    expect(r).toMatchObject({ result: "draft" });
  });
});
