import { describe, it, expect, vi, beforeEach } from "vitest";

// Each data source is mocked at its module; the Supabase client only has to
// answer the three direct reads (connections, plans, Studio builds).
const state = vi.hoisted(() => ({
  profile: null as unknown,
  baseProfile: null as unknown,
  workspaces: [] as unknown[],
  snapshot: null as unknown,
  accounts: [] as unknown[],
  known: [] as unknown[],
  tables: {} as Record<string, unknown[]>,
}));

vi.mock("@/lib/profile", () => ({
  getProfile: vi.fn(async (_c: unknown, _o: string, ws?: unknown) => (ws ? state.profile : state.baseProfile)),
}));
vi.mock("@/lib/workspaces", async (orig) => ({ ...(await orig<typeof import("@/lib/workspaces")>()), listWorkspaces: vi.fn(async () => state.workspaces) }));
vi.mock("@/lib/instagramSync", () => ({ getIgSnapshot: vi.fn(async () => state.snapshot) }));
vi.mock("./db", () => ({ loadPickerAccountsDetailed: vi.fn(async () => ({ accounts: state.accounts, complete: true })) }));
vi.mock("./knownUsernames", () => ({ readKnown: vi.fn(async () => state.known), scopeKey: (w: string | null) => w ?? "owner" }));

import { buildCaptionContext } from "./captionContext";
import type { Ctx } from "@/lib/context";

function fakeClient() {
  return {
    from(table: string) {
      const q = {
        select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q, not: () => q,
        then: (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: state.tables[table] ?? [], error: null }).then(ok),
      };
      return q;
    },
  };
}

const ws = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, ownerId: "o1", name, isDefault: false, suspended: false, niche: null, brand_name: null, goals: null, brand_detail: null, niche_detail: null, niche_analyzed_at: null, createdAt: "2026-01-01", ...extra });

const input = {
  postId: null, destinations: [{ platform: "instagram" as const, accountId: "ig1" }], draft: "", notes: "",
  collaborators: [], userTags: [], planId: null, planDay: null, transcript: null,
};

describe("caption context", () => {
  beforeEach(() => {
    state.profile = { niche: "Italian restaurant", brand_name: "Salvo's", goals: null, platforms: null, account_connected: true, brand_detail: { location: "Brentwood, TN", voice: "Casual" } };
    state.baseProfile = state.profile;
    state.workspaces = [
      ws("w1", "Salvo's Brentwood", { brand_name: "Salvo's", brand_detail: { location: "Brentwood, TN" } }),
      ws("w2", "Salvo's Franklin", { brand_name: "Salvo's", brand_detail: { location: "Franklin, TN" } }),
      ws("w3", "Rise Bakery", { brand_name: "Rise", brand_detail: { location: "Nashville" } }),
    ];
    state.snapshot = null;
    state.accounts = [{ platform: "instagram", accountId: "ig1", label: "Salvo's Brentwood", handle: "salvosbrentwood" }];
    state.known = [{ username: "chefmike", uses: 2, name: "Mike Rossi", avatar: null }];
    state.tables = { instagram_connections: [{ username: "salvosbrentwood", workspace_id: "w1" }, { username: "salvosfranklin", workspace_id: "w2" }, { username: "risebakery", workspace_id: "w3" }] };
  });

  const ctx = (isOwner = true): Ctx => ({ viewerId: "o1", ownerId: "o1", workspace: state.workspaces[0] as Ctx["workspace"], role: isOwner ? "owner" : "member", client: fakeClient() as unknown as Ctx["client"], isOwner });

  it("names both locations of the same brand and maps a collaborator to the owner's own workspace", async () => {
    const c = await buildCaptionContext(ctx(), { ...input, collaborators: ["@SalvosFranklin"], userTags: ["chefmike", "stranger1"] });
    expect(c.locations.map((l) => `${l.location}:${l.why}`)).toEqual(["Brentwood, TN:this_workspace", "Franklin, TN:collaborator"]);
    expect(c.prompt).toContain(`@salvosfranklin: collaborator (co-author of the post); the user's own Brand Workspace "Salvo's Franklin" (Franklin, TN)`);
    expect(c.prompt).toContain(`@chefmike: tagged in the post; Instagram account name "Mike Rossi"`);
    expect(c.prompt).toContain("@stranger1: tagged in the post; SOCIA knows only the username");
    expect(c.prompt).not.toContain("Nashville"); // a different brand, not on this post
    expect(c.handles).toEqual(expect.arrayContaining(["salvosfranklin", "chefmike", "stranger1", "salvosbrentwood"]));
    expect(c.gaps.join(" ")).toContain("@stranger1");
  });

  it("says what it doesn't know instead of filling it in", async () => {
    state.profile = { niche: null, brand_name: null, goals: null, platforms: null, account_connected: true, brand_detail: null };
    state.workspaces = [ws("w1", "Main")];
    const c = await buildCaptionContext(ctx(), input);
    expect(c.locations).toEqual([]);
    expect(c.gaps.some((g) => /No location is saved/.test(g))).toBe(true);
    expect(c.gaps.some((g) => /No prices, hours, dates or offers/.test(g))).toBe(true);
    expect(c.prompt).not.toMatch(/Business locations/);
  });

  it("keeps an invited member to the workspace they were invited to", async () => {
    const c = await buildCaptionContext(ctx(false), { ...input, collaborators: ["salvosfranklin"] });
    expect(c.locations.map((l) => l.location)).toEqual(["Brentwood, TN"]);
    expect(c.prompt).not.toContain("Franklin, TN");
  });

  it("uses the Content Plan day the post came from and what the person said", async () => {
    state.tables.plans = [{ id: "p1", data: { weeklyPlan: [{ day: "Tuesday", format: "Reel", concept: "Behind the oven", hook: "Ever wondered how?", rationale: "Process posts beat your median", evidence: "", predictedPerformance: "" }] } }];
    const c = await buildCaptionContext(ctx(), { ...input, planId: "p1", planDay: "tuesday", notes: "Sicilian slice is $5 Saturday only" });
    expect(c.prompt).toContain("Concept: Behind the oven");
    expect(c.corpus).toContain("$5 Saturday");
    expect(c.facts.map((f) => f.source)).toEqual(expect.arrayContaining(["plan", "notes", "location", "brand"]));
    expect(c.gaps.some((g) => /No prices/.test(g))).toBe(false);
  });
});
