import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILE_VERSION, profileKey, profileServes, sameInputs, storableNiche, type IntelProfile, type ProfileInputs } from "./profile";

const reads = vi.hoisted(() => ({ live: vi.fn(), saved: vi.fn() }));
vi.mock("../trendSignalsLoad", () => ({ loadNicheRead: reads.live, loadCachedNicheRead: reads.saved }));
const tracked = vi.hoisted(() => ({ rows: [] as { platform: string; handle: string }[] }));
vi.mock("../trackedCompetitors", () => ({ listTracked: async () => tracked.rows }));

import { intelFor, refreshProfileIfChanged } from "./profileLoad";

const now = new Date("2026-11-24T12:00:00Z");
const inputs: ProfileInputs = { tracked: ["instagram:a"], discoveryAt: "2026-11-20T00:00:00Z", igReadAt: "2026-11-24T10:00:00Z", location: "Nashville" };
const read = { signals: { hooks: [], topics: [] }, proven: [{ url: "u", refToken: "secret-for-one-viewer", title: "t" }] } as never;

/** A niche_trends + discovery tables stand-in: enough of the query builder for these reads and the upsert. */
function fakeClient(state: { profile: IntelProfile | null; ranAt: string | null; igAt: string | null; upserts: number }) {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = self;
    q.maybeSingle = async () => ({ data: table === "niche_trends" ? (state.profile ? { data: state.profile } : null) : table === "discovery_runs" ? (state.ranAt ? { ran_at: state.ranAt } : null) : null });
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: table === "ig_competitor_snapshots" ? (state.igAt ? [{ fetched_at: state.igAt }] : []) : [] }).then(res);
    q.upsert = async (row: { data: IntelProfile }) => { state.upserts++; state.profile = row.data; return { error: null }; };
    return q;
  };
  return { from: chain };
}

describe("the profile rules", () => {
  it("keys every profile under the owner's id, as the table's row policy requires", () => {
    expect(profileKey("owner-1", "ws-9")).toBe("owner-1:ws-9:intel:v1");
    expect(profileKey("owner-1", null)).toMatch(/^owner-1:default:/);
  });

  it("serves a live read for a day only while its inputs are the same; a saved read for a week", () => {
    const p: IntelProfile = { v: PROFILE_VERSION, builtAt: "", inputs, niche: read, nicheSource: "live", nicheAt: "2026-11-24T06:00:00Z", accounts: [], content: [], tracked: [] };
    const t = now.getTime();
    expect(profileServes(p, "live", inputs, t)).toBe(true);
    expect(profileServes(p, "live", { ...inputs, tracked: ["instagram:a", "instagram:b"] }, t)).toBe(false);
    expect(profileServes({ ...p, nicheAt: "2026-11-22T00:00:00Z" }, "live", inputs, t)).toBe(false);
    expect(profileServes({ ...p, nicheAt: "2026-11-22T00:00:00Z" }, "saved", null, t)).toBe(true);
    expect(profileServes({ ...p, nicheAt: "2026-11-10T00:00:00Z" }, "saved", null, t)).toBe(false);
    expect(profileServes({ ...p, nicheSource: "saved" }, "live", inputs, t)).toBe(false);
    expect(profileServes(null, "saved", null, t)).toBe(false);
  });

  it("compares inputs field by field", () => {
    expect(sameInputs(inputs, { ...inputs })).toBe(true);
    expect(sameInputs(inputs, { ...inputs, igReadAt: "later" })).toBe(false);
    expect(sameInputs(inputs, { ...inputs, location: null })).toBe(false);
  });

  it("never stores a Reel's viewer-signed reference token", () => {
    expect(JSON.stringify(storableNiche(read))).not.toContain("secret-for-one-viewer");
  });
});

describe("intelFor", () => {
  beforeEach(() => { reads.live.mockReset().mockResolvedValue(read); reads.saved.mockReset().mockResolvedValue(read); tracked.rows = [{ platform: "instagram", handle: "a" }]; });

  it("reads the platforms once, then serves the saved profile", async () => {
    const st = { profile: null as IntelProfile | null, ranAt: "2026-11-20T00:00:00Z", igAt: "2026-11-24T10:00:00Z", upserts: 0 };
    const w = { client: fakeClient(st), ownerId: "o", scopeId: "s" };
    const a = await intelFor(w, { need: "live", now });
    const b = await intelFor(w, { need: "live", now });
    expect(reads.live).toHaveBeenCalledTimes(1);
    expect(st.upserts).toBe(1);
    expect(a.nicheSource).toBe("live");
    expect(b.niche).toEqual(a.niche);
  });

  it("reads again the same day when a competitor is added", async () => {
    const st = { profile: null as IntelProfile | null, ranAt: null, igAt: null, upserts: 0 };
    const w = { client: fakeClient(st), ownerId: "o", scopeId: "s" };
    await intelFor(w, { need: "live", now });
    tracked.rows = [...tracked.rows, { platform: "instagram", handle: "b" }];
    await intelFor(w, { need: "live", now });
    expect(reads.live).toHaveBeenCalledTimes(2);
  });

  it("pages that must never call a platform only re-rank saved data", async () => {
    const st = { profile: null as IntelProfile | null, ranAt: null, igAt: null, upserts: 0 };
    const w = { client: fakeClient(st), ownerId: "o", scopeId: "s" };
    const p = await intelFor(w, { need: "saved", now });
    expect(reads.live).not.toHaveBeenCalled();
    expect(reads.saved).toHaveBeenCalledTimes(1);
    expect(p.nicheSource).toBe("saved");
    // and a later saved request uses what's stored
    await intelFor(w, { need: "saved", now });
    expect(reads.saved).toHaveBeenCalledTimes(1);
  });

  it("two requests at once share one build", async () => {
    const st = { profile: null as IntelProfile | null, ranAt: null, igAt: null, upserts: 0 };
    const w = { client: fakeClient(st), ownerId: "o2", scopeId: "s" };
    await Promise.all([intelFor(w, { need: "live", now }), intelFor(w, { need: "live", now })]);
    expect(reads.live).toHaveBeenCalledTimes(1);
  });

  it("a page that never calls a platform is served by a recent live read", async () => {
    const st = { profile: { v: PROFILE_VERSION, builtAt: "", inputs, niche: read, nicheSource: "live", nicheAt: "2026-11-24T06:00:00Z", accounts: [], content: [], tracked: [] } as IntelProfile, ranAt: null, igAt: null, upserts: 0 };
    reads.saved.mockResolvedValue(null);
    const w = { client: fakeClient(st), ownerId: "o", scopeId: "s" };
    const p = await intelFor(w, { need: "saved", now });
    expect(p.niche).toEqual(read);
    expect(reads.saved).not.toHaveBeenCalled();
    expect(st.upserts).toBe(0);
  });
});

describe("refreshProfileIfChanged (the 4-hourly job)", () => {
  beforeEach(() => { reads.live.mockReset().mockResolvedValue(read); tracked.rows = [{ platform: "instagram", handle: "a" }]; });

  it("does nothing when nothing changed and the read is under a day old", async () => {
    const st = { profile: null as IntelProfile | null, ranAt: "2026-11-20T00:00:00Z", igAt: "2026-11-24T10:00:00Z", upserts: 0 };
    const w = { client: fakeClient(st), ownerId: "o3", scopeId: "s" };
    expect(await refreshProfileIfChanged(w, "Nashville", now)).toBe("rebuilt");
    expect(await refreshProfileIfChanged(w, "Nashville", now)).toBe("unchanged");
    expect(reads.live).toHaveBeenCalledTimes(1);
  });

  it("rebuilds when a new Instagram read or discovery run arrived", async () => {
    const st = { profile: null as IntelProfile | null, ranAt: "2026-11-20T00:00:00Z", igAt: "2026-11-24T10:00:00Z", upserts: 0 };
    const w = { client: fakeClient(st), ownerId: "o4", scopeId: "s" };
    await refreshProfileIfChanged(w, null, now);
    st.igAt = "2026-11-24T11:00:00Z";
    expect(await refreshProfileIfChanged(w, null, now)).toBe("rebuilt");
    st.ranAt = "2026-11-24T11:30:00Z";
    expect(await refreshProfileIfChanged(w, null, now)).toBe("rebuilt");
    expect(reads.live).toHaveBeenCalledTimes(3);
  });
});
