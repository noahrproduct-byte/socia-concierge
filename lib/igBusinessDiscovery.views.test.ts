import { afterEach, describe, expect, it, vi } from "vitest";
import { businessDiscovery } from "./igBusinessDiscovery";

const account = (withViews: boolean) => ({
  business_discovery: {
    username: "rival", followers_count: 1200, media_count: 40,
    media: { data: [{ id: "1", media_type: "VIDEO", permalink: "https://instagram.com/reel/1", like_count: 50, comments_count: 4, ...(withViews ? { view_count: 9100 } : {}) }] },
  },
});

afterEach(() => vi.unstubAllGlobals());

describe("businessDiscovery views", () => {
  it("asks for view_count and returns it", async () => {
    const fetch = vi.fn(async (u: URL) => ({ json: async () => account(true), url: String(u) }));
    vi.stubGlobal("fetch", fetch);
    const r = await businessDiscovery("ig", "token", "rival", 3);
    expect(String(fetch.mock.calls[0][0])).toContain("view_count");
    expect(r.ok && r.account.media[0].views).toBe(9100);
  });

  it("repeats the lookup without view_count when Meta refuses the field", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ error: { code: 100, message: "(#100) Tried accessing nonexisting field (view_count) on node type (Media)" } }) })
      .mockResolvedValueOnce({ json: async () => account(false) });
    vi.stubGlobal("fetch", fetch);
    const r = await businessDiscovery("ig", "token", "rival", 3);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).not.toContain("view_count");
    expect(r.ok && r.account.followers).toBe(1200);
    expect(r.ok && r.account.media[0].views).toBeNull();
  });

  it("does not retry other errors", async () => {
    const fetch = vi.fn().mockResolvedValue({ json: async () => ({ error: { code: 10, message: "(#10) Application does not have permission for this action" } }) });
    vi.stubGlobal("fetch", fetch);
    const r = await businessDiscovery("ig", "token", "rival", 3);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, reason: "no_permission" });
  });
});
