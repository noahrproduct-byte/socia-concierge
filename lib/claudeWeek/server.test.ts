import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  saveItem: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })),
  updateDestination: vi.fn(async () => undefined),
  refreshParent: vi.fn(async () => undefined),
  loadItem: vi.fn(),
  cancelPost: vi.fn(async () => ({})),
}));
vi.mock("../publishing/db", () => ({
  saveItem: db.saveItem, updateDestination: db.updateDestination, refreshParent: db.refreshParent, loadItem: db.loadItem,
  stampPostWorkspace: vi.fn(async () => undefined),
  loadPickerAccountsDetailed: vi.fn(async () => ({ accounts: [{ platform: "instagram", accountId: "ig-1", status: "connected", suspended: false, scopes: [] }], complete: true })),
}));
vi.mock("../api/write", () => ({
  cancelPost: db.cancelPost,
  settingsFor: () => ({ format: "reel" }),
  pickAccounts: (inputs: { platform: string }[]) => {
    if (inputs[0].platform !== "instagram") throw new Error("not connected");
    return [{ input: inputs[0], account: { platform: "instagram", accountId: "ig-1" } }];
  },
}));
vi.mock("../api/sources", () => ({ loadSources: vi.fn(async () => ({ ig: null })) }));
vi.mock("../studioClips/styleStore", () => ({ readPresets: vi.fn(async () => ({ brand: { style: { font: "montserrat", accent: "#5b4bd6" } } })) }));
vi.mock("../intel/understandLoad", () => ({ currentDetail: vi.fn(async () => ({ voice: "Bold", growth: { resources: { claude_styles: ["animated"] } } })) }));
vi.mock("../entitlements", () => ({ canUseFeature: () => false, checkFeature: () => ({ ok: true }) }));
vi.mock("../publishing/capabilities", () => ({ availabilityFor: () => ({ state: "available" }) }));
vi.mock("../publishing/validate", () => ({ validateDestination: () => ({ issues: [], level: "ok" }) }));
vi.mock("../context", () => ({
  can: (ctx: { role: string }) => ctx.role !== "member",
  forbiddenCopy: () => "Only the owner or an admin can do that.",
  brandWorkspace: () => null,
}));

import { reviewVideos, startVideoUpload, submitVideo, videosToMake } from "./server";
import { ApiFailure } from "../api/context";

const OWNER = "aaaaaaaa-0000-4000-8000-000000000001";
const PLAN = "bbbbbbbb-0000-4000-8000-000000000002";
const CLAUDE_ITEM = "cccccccc-0000-4000-8000-000000000003";
const YOU_ITEM = "dddddddd-0000-4000-8000-000000000004";
const FILE = "eeeeeeee-0000-4000-8000-000000000005.mp4";
const PATH = `${OWNER}/claude-week/${PLAN}/${CLAUDE_ITEM}/${FILE}`;

type Post = { id: string; plan_item_id: string | null; review_status: string | null; review_note: string | null; status: string; scheduled_at: string | null; updated_at: string | null };

/** A stand-in for the Supabase client: the newest plan, the owner's profile and the posts handed in. */
function fakeClient(state: { posts: Post[]; markError?: { message: string; code?: string } | null }) {
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  const plan = {
    id: PLAN, created_at: "2026-11-08T00:30:00Z",
    data: { headline: "Week", weeklyPlan: [
      { id: CLAUDE_ITEM, maker: "claude", day: "Wednesday", concept: "Three numbers that explain the menu", hook: "Nobody reads menus.", format: "Reel", rationale: "", evidence: "", predictedPerformance: "", platform: "Instagram" },
      { id: YOU_ITEM, maker: "you", day: "Friday", concept: "Kitchen tour", hook: "Come in.", format: "Reel", rationale: "", evidence: "", predictedPerformance: "" },
    ] },
  };
  const client = {
    from(table: string) {
      let op = "select";
      let values: Record<string, unknown> = {};
      const result = () => {
        if (op === "update") { updates.push({ table, values }); return { data: [{ id: "x" }], error: table === "scheduled_posts" ? state.markError ?? null : null }; }
        if (table === "plans") return { data: [plan], error: null };
        if (table === "profiles") return { data: { brand_detail: { timezone: "America/Chicago" }, brand_name: "Socia", niche: "Software" }, error: null };
        if (table === "scheduled_posts") return { data: state.posts, error: null };
        return { data: null, error: null };
      };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "in", "order", "limit", "is"]) q[m] = () => q;
      q.update = (v: Record<string, unknown>) => { op = "update"; values = v; return q; };
      q.maybeSingle = async () => result();
      q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
      return q;
    },
  };
  return { client, updates };
}

function fakeStorage(listed: { name: string; metadata: { size: number; mimetype: string } }[] = []) {
  const removed: string[][] = [];
  const svc = {
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://store.example/upload/${path}?token=t`, path }, error: null }),
        list: async () => ({ data: listed, error: null }),
        remove: async (p: string[]) => { removed.push(p); return { data: null, error: null }; },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://store.example/public/${p}` } }),
      }),
    },
  };
  return { svc: svc as never, removed };
}

const ctxFor = (client: unknown, role = "owner") => ({ client, ownerId: OWNER, viewerId: OWNER, workspace: null, role }) as never;
const ent = { plan: "growth" } as never;

beforeEach(() => vi.clearAllMocks());

describe("videosToMake", () => {
  it("lists only the posts the plan gave to Claude, with the brand and a planned time", async () => {
    const { client } = fakeClient({ posts: [] });
    const out = await videosToMake(ctxFor(client), ent) as { videos: { item_id: string; status: string; goes_out_at: string; can_schedule_after_review: boolean }[]; brand: { allowed_styles: string[]; font: string } };
    expect(out.videos.map((v) => v.item_id)).toEqual([CLAUDE_ITEM]);
    expect(out.videos[0]).toMatchObject({ status: "to_make", goes_out_at: "2026-11-12T00:00:00.000Z", can_schedule_after_review: true });
    expect(out.brand).toMatchObject({ allowed_styles: ["animated"], font: "montserrat" });
  });

  it("reports a video handed back with the person's note", async () => {
    const { client } = fakeClient({ posts: [{ id: "p1", plan_item_id: CLAUDE_ITEM, review_status: "rejected", review_note: "Slower text", status: "draft", scheduled_at: null, updated_at: null }] });
    const out = await videosToMake(ctxFor(client), ent) as { videos: { status: string; review_note: string }[] };
    expect(out.videos[0]).toMatchObject({ status: "changes_requested", review_note: "Slower text" });
  });
});

describe("startVideoUpload", () => {
  it("gives a one-time link inside the post's own folder", async () => {
    const { client } = fakeClient({ posts: [] });
    const { svc } = fakeStorage();
    const out = await startVideoUpload(ctxFor(client), svc, { item_id: CLAUDE_ITEM, mime: "video/mp4", size_bytes: 20_000_000 }) as { path: string; upload_url: string };
    expect(out.path.startsWith(`${OWNER}/claude-week/${PLAN}/${CLAUDE_ITEM}/`)).toBe(true);
    expect(out.upload_url).toContain(out.path);
  });

  it("refuses posts that aren't Claude's, unknown types and files over the cap", async () => {
    const { client } = fakeClient({ posts: [] });
    const { svc } = fakeStorage();
    await expect(startVideoUpload(ctxFor(client), svc, { item_id: YOU_ITEM, mime: "video/mp4", size_bytes: 1 })).rejects.toThrow(/for the person to make/);
    await expect(startVideoUpload(ctxFor(client), svc, { item_id: CLAUDE_ITEM, mime: "image/png", size_bytes: 1 })).rejects.toThrow(/MP4, MOV or WebM/);
    await expect(startVideoUpload(ctxFor(client), svc, { item_id: CLAUDE_ITEM, mime: "video/mp4", size_bytes: 300 * 1024 * 1024 })).rejects.toThrow(/at most 200 MB/);
  });
});

describe("submitVideo", () => {
  const listed = [{ name: FILE, metadata: { size: 15_000_000, mimetype: "video/mp4" } }];

  it("keeps the video as a draft at its planned time, waiting for review, and replaces an earlier one", async () => {
    const { client, updates } = fakeClient({ posts: [{ id: "old", plan_item_id: CLAUDE_ITEM, review_status: "rejected", review_note: "x", status: "draft", scheduled_at: null, updated_at: null }] });
    const { svc } = fakeStorage(listed);
    const out = await submitVideo(ctxFor(client), svc, ent, { item_id: CLAUDE_ITEM, path: PATH, caption: "Three numbers." }) as { result: string; goes_out_at: string; replaced: number };
    expect(out).toMatchObject({ result: "waiting_for_review", goes_out_at: "2026-11-12T00:00:00.000Z", replaced: 1 });
    const payload = (db.saveItem.mock.calls[0] as unknown[])[2] as { action: string; planId: string; planDay: string; scheduledAt: string; media: { path: string }[] };
    expect(payload).toMatchObject({ action: "draft", planId: PLAN, planDay: "Wednesday", scheduledAt: "2026-11-12T00:00:00.000Z" });
    expect(payload.media[0].path).toBe(PATH);
    expect((db.saveItem.mock.calls[0] as unknown[])[3]).toBe("draft");
    expect(updates.find((u) => u.table === "scheduled_posts")?.values).toEqual({ plan_item_id: CLAUDE_ITEM, review_status: "waiting", review_note: null });
    expect(db.cancelPost).toHaveBeenCalledWith(expect.anything(), "old");
  });

  it("refuses a path outside the post's folder, a missing upload and a file that isn't a video", async () => {
    const { client } = fakeClient({ posts: [] });
    await expect(submitVideo(ctxFor(client), fakeStorage(listed).svc, ent, { item_id: CLAUDE_ITEM, path: `someone-else/${FILE}`, caption: "c" })).rejects.toThrow(/start_video_upload returned/);
    await expect(submitVideo(ctxFor(client), fakeStorage([]).svc, ent, { item_id: CLAUDE_ITEM, path: PATH, caption: "c" })).rejects.toThrow(/hasn't received/);
    const notVideo = fakeStorage([{ name: FILE, metadata: { size: 10, mimetype: "text/html" } }]);
    await expect(submitVideo(ctxFor(client), notVideo.svc, ent, { item_id: CLAUDE_ITEM, path: PATH, caption: "c" })).rejects.toThrow(/isn't a video/);
    expect(notVideo.removed).toEqual([[PATH]]);
    expect(db.saveItem).not.toHaveBeenCalled();
  });

  it("refuses when the person already approved a video for the post", async () => {
    const { client } = fakeClient({ posts: [{ id: "ok", plan_item_id: CLAUDE_ITEM, review_status: "approved", review_note: null, status: "scheduled", scheduled_at: null, updated_at: null }] });
    await expect(submitVideo(ctxFor(client), fakeStorage(listed).svc, ent, { item_id: CLAUDE_ITEM, path: PATH, caption: "c" })).rejects.toThrow(/already approved/);
  });

  it("withdraws the new draft when the database can't mark it for review", async () => {
    const { client } = fakeClient({ posts: [], markError: { message: 'column "review_status" does not exist', code: "42703" } });
    await expect(submitVideo(ctxFor(client), fakeStorage(listed).svc, ent, { item_id: CLAUDE_ITEM, path: PATH, caption: "c" })).rejects.toBeInstanceOf(ApiFailure);
    expect(db.cancelPost).toHaveBeenCalledWith(expect.anything(), "11111111-1111-4111-8111-111111111111");
  });
});

describe("reviewVideos", () => {
  const waiting: Post = { id: "11111111-1111-4111-8111-111111111111", plan_item_id: CLAUDE_ITEM, review_status: "waiting", review_note: null, status: "draft", scheduled_at: null, updated_at: null };

  it("is for the owner or an Admin", async () => {
    const { client } = fakeClient({ posts: [waiting] });
    await expect(reviewVideos(ctxFor(client, "member"), ent, { post_ids: [waiting.id], action: "approve" })).rejects.toThrow(/owner or an admin/);
  });

  it("approving schedules each destination at the planned time", async () => {
    const { client, updates } = fakeClient({ posts: [waiting] });
    db.loadItem.mockResolvedValue({ id: waiting.id, caption: "c", media: [], scheduledAt: "2026-11-12T00:00:00.000Z", destinations: [{ id: "d1", platform: "instagram", accountId: "ig-1", status: "draft", settings: {} }] });
    const out = await reviewVideos(ctxFor(client), ent, { post_ids: [waiting.id], action: "approve" }, new Date("2026-11-10T12:00:00Z"));
    expect(out).toEqual([{ post_id: waiting.id, ok: true, status: "approved", scheduled_for: "2026-11-12T00:00:00.000Z" }]);
    expect(db.updateDestination).toHaveBeenCalledWith(expect.anything(), "d1", expect.objectContaining({ status: "scheduled", scheduledAt: "2026-11-12T00:00:00.000Z" }));
    expect(updates.some((u) => u.values.review_status === "approved")).toBe(true);
  });

  it("sending back keeps it a draft with the note, and only touches videos waiting for review", async () => {
    const { client, updates } = fakeClient({ posts: [waiting] });
    const out = await reviewVideos(ctxFor(client), ent, { post_ids: [waiting.id, "22222222-2222-4222-8222-222222222222"], action: "reject", note: "Slower text" });
    expect(out.map((r) => r.ok)).toEqual([true, false]);
    expect(updates).toEqual([{ table: "scheduled_posts", values: { review_status: "rejected", review_note: "Slower text" } }]);
    expect(db.updateDestination).not.toHaveBeenCalled();
  });
});
