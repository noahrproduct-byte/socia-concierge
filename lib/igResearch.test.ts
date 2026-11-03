import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The research account's row, as the service client would return it.
let researchRows: Record<string, unknown>[] = [];
vi.mock("./supabase/service", () => ({
  createServiceClient: () => {
    // Chainable like PostgREST: eq/ilike narrow nothing here, the code's own row check does.
    const q: Record<string, unknown> = {};
    q.select = () => q; q.eq = () => q; q.ilike = () => q;
    q.limit = async () => ({ data: researchRows, error: null });
    return { from: () => q };
  },
}));

import { igConnection } from "./igCompetitorData";
import { resetResearchMemo } from "./igResearch";

/** A session client whose facebook_connections read returns `rows`. */
const sessionWith = (rows: Record<string, unknown>[]) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) }) as never;

const RESEARCH = { user_id: "socia-user", ig_business_id: "socia-ig", ig_business_username: "socia.appmedia", access_token: "socia-token", connection_status: "connected" };

describe("igConnection", () => {
  beforeEach(() => {
    resetResearchMemo();
    researchRows = [RESEARCH];
    vi.stubEnv("SOCIA_RESEARCH_USER_ID", "socia-user");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("finds the research Page by its Instagram username, skipping the owner's other Pages", async () => {
    vi.stubEnv("SOCIA_RESEARCH_USER_ID", "");
    vi.stubEnv("SOCIA_RESEARCH_IG_USERNAME", "@Socia.AppMedia");
    researchRows = [{ ...RESEARCH, ig_business_id: "client-ig", ig_business_username: "salvoshermitage" }, RESEARCH];
    expect(await igConnection(sessionWith([]), "u1")).toEqual({ igUserId: "socia-ig", pageToken: "socia-token", source: "socia" });
  });

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
