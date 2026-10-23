import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { pkcePair, ytAuthUrl, exchangeCode, readStateCookie, YT_PKCE_COOKIE } from "./youtubeAuth";

describe("YouTube OAuth PKCE", () => {
  it("sends only the S256 hash of a fresh verifier to Google", async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect((await pkcePair()).verifier).not.toBe(verifier);
    vi.stubEnv("YOUTUBE_CLIENT_ID", "cid");
    const u = new URL(ytAuthUrl("n.settings", "https://sociaos.com/api/auth/youtube/callback", { challenge }));
    expect(u.searchParams.get("code_challenge")).toBe(challenge);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.toString()).not.toContain(verifier);
    vi.unstubAllEnvs();
  });

  it("returns the verifier with the code exchange, read from its own cookie", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "a", expires_in: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await exchangeCode("code", "https://x/cb", "the-verifier");
    expect(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain("code_verifier=the-verifier");
    vi.unstubAllGlobals();
    const req = new Request("https://x", { headers: { cookie: `yt_oauth_state=n; ${YT_PKCE_COOKIE}=v1` } });
    expect(readStateCookie(req, YT_PKCE_COOKIE)).toBe("v1");
    expect(readStateCookie(req)).toBe("n");
  });
});
