// One owner, two Brand Workspaces. A guest of W1 (Admin or Member) runs with
// the service role, so the database can't keep them out of W2: the server
// code has to. Each Studio and collaborator lookup is run here against an
// in-memory table holding rows of both workspaces, asking from W1 for W2's ids.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/studioClips/storage", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  removeFolder: vi.fn(async () => undefined),
  signUrls: vi.fn(async () => ({})),
}));

import { loadBuildRow, buildPlayerData, saveBuildEdl, markRendered, completeClip, deleteClip } from "./server";
import { resolveMediaUrl, storeMeasurement } from "@/lib/audio/server";
import { checkCollaborators } from "@/lib/publishing/collaborators";

type Row = Record<string, unknown>;
const OWNER = "owner-1";
const W1 = "ws-1";
const W2 = "ws-2";

/** Enough of the Supabase query builder for these functions: filters really filter. */
function fakeDb(tables: Record<string, Row[]>) {
  const writes: { table: string; op: string; ids: unknown[] }[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "delete" = "select";
    let patch: Row = {};
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      const hit = rows();
      if (op !== "select") writes.push({ table, op, ids: hit.map((r) => r.id ?? r.media_id) });
      if (op === "update") hit.forEach((r) => Object.assign(r, patch));
      if (op === "delete") tables[table] = (tables[table] ?? []).filter((r) => !hit.includes(r));
      return { data: hit, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      update: (p: Row) => { op = "update"; patch = p; return q; },
      delete: () => { op = "delete"; return q; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      not: () => q, order: () => q, in: () => q, is: () => q,
      limit: () => q,
      single: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.data[0] ? null : { message: "no row" } }; },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    };
    return q;
  };
  return { client: { from, storage: { from: () => ({ remove: async () => ({}), list: async () => ({ data: [] }) }) } } as never, writes, tables };
}

const edl = { segments: [{ clipId: "c2", start: 0, end: 1 }], caption: "", finish: null };
const build = (id: string, ws: string): Row => ({ id, user_id: OWNER, workspace_id: ws, project_id: `p-${ws}`, opportunity_idx: 0, edl, edl_history: [], guide: null, caption: null, status: "ready" });
const clip = (id: string, ws: string): Row => ({ id, user_id: OWNER, workspace_id: ws, project_id: `p-${ws}`, position: 1, fingerprint: "f", name: "clip", source_path: `${OWNER}/p-${ws}/${id}/source.mp4`, frames: [], card: null, facts: null, status: "uploading" });

function db() {
  return fakeDb({
    studio_builds: [build("b1", W1), build("b2", W2)],
    studio_clips: [clip("c1", W1), clip("c2", W2)],
    audio_media: [
      { user_id: OWNER, workspace_id: W1, media_id: "m1", media_url: "https://cdn/1.mp4", has_media_url: true },
      { user_id: OWNER, workspace_id: W2, media_id: "m2", media_url: "https://cdn/2.mp4", has_media_url: true },
    ],
    instagram_connections: [{ user_id: OWNER, workspace_id: W2, ig_user_id: "ig-w2", username: "brand_two", access_token: "tok", token_expires_at: null, plan_suspended_at: null }],
  });
}

describe("from Brand Workspace W1, nothing of W2 is reachable", () => {
  it("builds: can't be loaded, played, edited or marked rendered", async () => {
    const { client, writes, tables } = db();
    expect(await loadBuildRow(client, OWNER, W1, "b2")).toBeNull();
    expect(await buildPlayerData(client, OWNER, W1, "b2", true)).toBeNull();
    await expect(saveBuildEdl(client, OWNER, W1, "b2", edl as never)).rejects.toThrow("does not exist");
    await markRendered(client, OWNER, W1, "b2", { path: "x", durationSec: 1, postId: null });
    expect(writes.flatMap((w) => w.ids)).toEqual([]);
    expect(tables.studio_builds.find((r) => r.id === "b2")?.render_path).toBeUndefined();
    // Control: W1's own build loads.
    expect((await loadBuildRow(client, OWNER, W1, "b1"))?.id).toBe("b1");
  });

  it("clips: can't be completed or deleted", async () => {
    const { client, tables } = db();
    expect(await completeClip(client, OWNER, W1, "c2", { sourcePath: "x", frames: [], audioPath: null, facts: null })).toBeNull();
    expect(await deleteClip(client, OWNER, W1, "c2")).toBe(false);
    expect(tables.studio_clips.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(tables.studio_clips.find((r) => r.id === "c2")?.status).toBe("uploading");
  });

  it("audio: can't fetch or overwrite W2's measured media", async () => {
    const { client, writes } = db();
    expect(await resolveMediaUrl(client, OWNER, W1, "m2")).toBeNull();
    await storeMeasurement(client, OWNER, W1, "m2", { error: "x" });
    expect(writes.flatMap((w) => w.ids)).toEqual([]);
    expect(await resolveMediaUrl(client, OWNER, W2, "m2")).toBe("https://cdn/2.mp4");
  });

  it("collaborators: W2's Instagram account can't be used to check (or post) from W1", async () => {
    const { client } = db();
    const r = await checkCollaborators(client, { ownerId: OWNER, workspaceId: W1, igUserId: "ig-w2", usernames: ["someone"], imageUrl: "https://x/i.jpg" });
    expect(r).toMatchObject({ status: 404 });
  });
});
