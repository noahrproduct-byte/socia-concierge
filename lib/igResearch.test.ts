import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The research account's row, as the service client would return it.
let researchRows: Record<string, unknown>[] = [];
vi.mock("./supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: researchRows, error: null }) }) }) }),
  }),
}));

import { igConnection } from "./igCompetitorData";
import { resetResearchMemo } from "./igResearch";

/** A session client whose facebook_connections read returns `rows`. */
const sessionWith = (rows: Record<string, unknown>[]) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) }) as never;

const RESEARCH = { ig_business_id: "socia-ig", access_token: "socia-token", connection_status: "connected" };

describe("igConnection", () => {
  beforeEach(() => {
    resetResearchMemo();
    researchRows = [RESEARCH];
    vi.stubEnv("SOCIA_RESEARCH_USER_ID", "socia-user");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the customer's own linked Page", async () => {
    const own = { ig_business_id: "own-ig", access_token: "own-token", connection_status: "connected" };
    expect(await igConnection(sessionWith([own]), "u1")).toEqual({ igUserId: "own-ig", pageToken: "own-token", source: "own" });
  });

  it("falls back to SOCIA's research account when the customer has no Page", async () => {
    expect(await igConnection(sessionWith([]), "u1")).toEqual({ igUserId: "socia-ig", pageToken: "socia-token", source: "socia" });
  });

  it("ignores a disconnected research connection", async () => {
    researchRows = [{ ...RESEARCH, connection_status: "expired" }];
    expect(await igConnection(sessionWith([]), "u1")).toBeNull();
  });

  it("returns null when no research account is configured", async () => {
    vi.stubEnv("SOCIA_RESEARCH_USER_ID", "");
    expect(await igConnection(sessionWith([]), "u1")).toBeNull();
  });
});
