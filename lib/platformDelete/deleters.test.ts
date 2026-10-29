import { afterEach, describe, it, expect, vi } from "vitest";
import {
  describeGoogleError,
  describeMetaError,
  deleteInstagramMedia,
  deleteFacebookPost,
  deleteYouTubeVideo,
  instagramMediaExists,
  youtubeVideoExists,
} from "./deleters";

const TOKEN = "EAAB-secret-token-value";
const json = (status: number, body: unknown) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const metaErr = (code: number, message: string) => ({ error: { message, type: "OAuthException", code } });

afterEach(() => vi.unstubAllGlobals());

describe("describeMetaError", () => {
  it("maps an expired token", () => {
    expect(describeMetaError(400, metaErr(190, "Error validating access token"))).toMatchObject({ ok: false, kind: "expired" });
  });

  it("maps a missing permission, naming the Instagram one", () => {
    const a = describeMetaError(403, metaErr(10, "Application does not have permission"), "instagram");
    expect(a).toMatchObject({ ok: false, kind: "permission" });
    if (!a.ok) expect(a.message).toContain("Instagram content permission");
  });

  it("never treats 'does not exist' as deleted: it needs a second read", () => {
    const a = describeMetaError(400, metaErr(100, "Unsupported delete request. Object with ID '1' does not exist, cannot be loaded due to missing permissions, or does not support this operation."));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.kind).toBe("not_found");
  });

  it("maps rate limits and server errors as transient, and quotes anything else", () => {
    expect(describeMetaError(400, metaErr(4, "Application request limit reached"))).toMatchObject({ kind: "transient" });
    expect(describeMetaError(503, null)).toMatchObject({ kind: "transient" });
    const a = describeMetaError(400, metaErr(9004, "Media Type Not Supported"), "instagram");
    expect(a).toMatchObject({ ok: false, kind: "final" });
    if (!a.ok) expect(a.message).toBe("Instagram said: Media Type Not Supported");
  });
});

describe("describeGoogleError", () => {
  it("204 is deleted", () => {
    expect(describeGoogleError(204, null)).toMatchObject({ ok: true, gone: false });
  });

  it("404 needs a second read", () => {
    expect(describeGoogleError(404, { error: { code: 404, errors: [{ reason: "videoNotFound" }] } })).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("asks for the broader permission on a scope error", () => {
    const a = describeGoogleError(403, { error: { code: 403, errors: [{ reason: "insufficientPermissions" }] } });
    expect(a).toMatchObject({ ok: false, kind: "permission" });
    if (!a.ok) expect(a.message).toContain("Reconnect YouTube with the broader permission");
  });

  it("maps auth and quota errors", () => {
    expect(describeGoogleError(401, { error: { code: 401, errors: [{ reason: "authError" }] } })).toMatchObject({ kind: "expired" });
    expect(describeGoogleError(403, { error: { code: 403, errors: [{ reason: "quotaExceeded" }] } })).toMatchObject({ kind: "transient" });
    expect(describeGoogleError(403, { error: { code: 403, errors: [{ reason: "forbidden" }] } })).toMatchObject({ kind: "final" });
  });
});

describe("the platform calls", () => {
  it("deletes Instagram media on graph.facebook.com with DELETE", async () => {
    const f = vi.fn(async () => json(200, { success: true, deleted_id: "m1" }));
    vi.stubGlobal("fetch", f);
    const a = await deleteInstagramMedia("m1", TOKEN);
    expect(a).toMatchObject({ ok: true, gone: false, response: { success: true, deleted_id: "m1" } });
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain("https://graph.facebook.com/");
    expect(String(url)).toContain("/m1?");
    expect(init.method).toBe("DELETE");
  });

  it("does not report success when Meta answers success: false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { success: false })));
    expect(await deleteFacebookPost("p_1", TOKEN)).toMatchObject({ ok: false, kind: "final" });
  });

  it("deletes a YouTube video with a bearer token", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", f);
    expect(await deleteYouTubeVideo("v1", TOKEN)).toMatchObject({ ok: true });
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://www.googleapis.com/youtube/v3/videos?id=v1");
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("turns a network failure into a transient answer without the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`connect failed for ${TOKEN}`); }));
    const a = await deleteInstagramMedia("m1", TOKEN);
    expect(a).toMatchObject({ ok: false, kind: "transient" });
    expect(JSON.stringify(a)).not.toContain(TOKEN);
  });

  it("never puts the token in an answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(400, metaErr(9004, "Media Type Not Supported"))));
    expect(JSON.stringify(await deleteInstagramMedia("m1", TOKEN))).not.toContain(TOKEN);
  });
});

describe("existence checks", () => {
  it("reads the media through the Instagram Login API", async () => {
    const f = vi.fn(async () => json(200, { id: "m1" }));
    vi.stubGlobal("fetch", f);
    expect(await instagramMediaExists("m1", TOKEN)).toBe(true);
    expect(String((f.mock.calls[0] as unknown as [URL])[0])).toContain("https://graph.instagram.com/");
  });

  it("is false only on a 'does not exist' answer, and null when unsure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(400, metaErr(100, "Object with ID 'm1' does not exist"))));
    expect(await instagramMediaExists("m1", TOKEN)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => json(400, metaErr(190, "Error validating access token"))));
    expect(await instagramMediaExists("m1", TOKEN)).toBe(null);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await instagramMediaExists("m1", TOKEN)).toBe(null);
  });

  it("checks a YouTube video with videos.list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { items: [] })));
    expect(await youtubeVideoExists("v1", TOKEN)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => json(200, { items: [{ id: "v1" }] })));
    expect(await youtubeVideoExists("v1", TOKEN)).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => json(500, {})));
    expect(await youtubeVideoExists("v1", TOKEN)).toBe(null);
  });
});
