import { describe, it, expect, beforeAll } from "vitest";
import { ytAuthUrl, YT_READ_SCOPES, YT_WRITE_SCOPE } from "./youtubeAuth";

// The default YouTube connect must request ONLY the two verified read scopes,
// so Google shows no "unverified app" warning. The write scope (not verified
// yet) is added only on the explicit publish opt-in.
beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
});

const scopesOf = (url: string) => (new URL(url).searchParams.get("scope") ?? "").split(" ").filter(Boolean);

describe("ytAuthUrl scopes", () => {
  it("requests only the verified read scopes by default (no write scope, no warning)", () => {
    const scopes = scopesOf(ytAuthUrl("nonce.settings", "https://sociaos.com/api/auth/youtube/callback"));
    expect(scopes.sort()).toEqual([...YT_READ_SCOPES].sort());
    expect(scopes).not.toContain(YT_WRITE_SCOPE);
  });

  it("adds the write scope only when publishing is explicitly requested", () => {
    const scopes = scopesOf(ytAuthUrl("nonce.settings", "https://sociaos.com/api/auth/youtube/callback", { write: true }));
    expect(scopes).toContain(YT_WRITE_SCOPE);
    for (const s of YT_READ_SCOPES) expect(scopes).toContain(s);
  });

  it("still forces offline access + consent so a refresh token always comes back", () => {
    const u = new URL(ytAuthUrl("nonce.settings", "https://sociaos.com/api/auth/youtube/callback"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
  });
});
