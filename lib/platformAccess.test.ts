import { afterEach, describe, expect, it, vi } from "vitest";
import { hasEarlyAccess, offlineFor } from "./platformAccess";

afterEach(() => vi.unstubAllEnvs());

describe("connecting a platform that is offline for everyone else", () => {
  it("lets the listed accounts and admins connect, and nobody else", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    vi.stubEnv("PLATFORM_EARLY_ACCESS_EMAILS", " Reviewer@Example.com ,other@example.com");
    expect(offlineFor("facebook", "reviewer@example.com")).toBeNull();
    expect(offlineFor("facebook", "owner@example.com")).toBeNull();
    expect(offlineFor("facebook", "customer@example.com")).toMatch(/aren't open yet/);
    expect(offlineFor("facebook", null)).toMatch(/aren't open yet/);
    expect(offlineFor("instagram", "customer@example.com")).toBeNull();
  });

  it("is empty without the setting", () => {
    vi.stubEnv("PLATFORM_EARLY_ACCESS_EMAILS", "");
    expect(hasEarlyAccess("reviewer@example.com")).toBe(false);
  });
});
