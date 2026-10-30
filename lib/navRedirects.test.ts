import { describe, it, expect } from "vitest";
import nextConfig from "../next.config.mjs";
import { NAV } from "./nav";

// The sections' old addresses must keep landing on the renamed pages.
describe("old section addresses", () => {
  it("redirect (not permanently) to sections that exist", async () => {
    const rules = await nextConfig.redirects();
    const to = (src: string) => rules.find((r: { source: string }) => r.source === src);
    expect(to("/competitors")?.destination).toBe("/discover");
    expect(to("/tool")?.destination).toBe("/plan");
    expect(to("/calendar")?.destination).toBe("/plan/calendar");
    for (const r of rules) {
      expect(r.permanent).toBe(false);
      const dest = r.destination.replace("/:path*", "");
      expect(NAV.some((n) => n.href === dest)).toBe(true);
    }
  });
});
