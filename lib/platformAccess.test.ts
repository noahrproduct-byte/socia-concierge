import { afterEach, describe, expect, it, vi } from "vitest";
import { hasEarlyAccess, offlineFor } from "./platformAccess";

afterEach(() => vi.unstubAllEnvs());

describe("connecting a platform", () => {
  it("lets everyone connect every platform now that none is offline", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    for (const p of ["instagram", "facebook", "youtube", "tiktok"]) {
      expect(offlineFor(p, "customer@example.com")).toBeNull();
      expect(offlineFor(p, null)).toBeNull();
    }
  });

  it("reads the early access list case-insensitively, and is empty without the setting", () => {
    vi.stubEnv("PLATFORM_EARLY_ACCESS_EMAILS", " Reviewer@Example.com ,other@example.com");
    expect(hasEarlyAccess("reviewer@example.com")).toBe(true);
    expect(hasEarlyAccess("customer@example.com")).toBe(false);
    vi.stubEnv("PLATFORM_EARLY_ACCESS_EMAILS", "");
    expect(hasEarlyAccess("reviewer@example.com")).toBe(false);
  });
});
