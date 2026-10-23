// GETs that spend or rewrite refuse a cross-site request before doing anything.
import { describe, expect, it, vi } from "vitest";

const createClient = vi.fn(async () => { throw new Error("must not be reached"); });
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/studioClips/auth", () => ({ studioRequest: async () => { throw new Error("must not be reached"); } }));

const cross = (path: string) => new Request(`https://sociaos.com${path}`, { headers: { "sec-fetch-site": "cross-site" } });

describe("spending GETs from another site", () => {
  it.each([
    ["/api/analyze-account", () => import("./analyze-account/route")],
    ["/api/competitors/intel?refresh=1", () => import("./competitors/intel/route")],
    ["/api/studio/audio?refresh=1", () => import("./studio/audio/route")],
  ])("%s is refused with 403 and touches nothing", async (path, load) => {
    const mod = (await load()) as { GET: (req: Request) => Promise<Response> };
    const res = await mod.GET(cross(path));
    expect(res.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });
});
