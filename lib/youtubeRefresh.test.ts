import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshAccessToken } from "./youtubeAuth";

describe("YouTube token refresh", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("logs Google's reason for a refusal, never the token", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 })));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await refreshAccessToken("1//refresh-SECRET")).toBeNull();
    const line = log.mock.calls.flat().join(" ");
    expect(line).toContain("invalid_grant");
    expect(line).not.toContain("refresh-SECRET");
    expect(line).not.toContain("secret");
  });
});
