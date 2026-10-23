// Security guards added in the 2026-10-22 audit. Each test names the attack it
// stops. Pure functions only; route-level checks are in
// app/api/security.routes.test.ts.

import { describe, it, expect, vi } from "vitest";
import { isOwnPath } from "./storagePaths";
import { fetchAllowed, isPlatformMediaUrl, isSocialContentUrl } from "./fetchGuard";
import { verifyOAuthState, newOAuthState } from "./oauthState";
import { isCronRequest } from "./cronAuth";
import { signedExportPath, verifyExportPath } from "./studioClips/exportToken";
import { clipOwnsPath, clipFolderOf } from "./studioClips/storage";
import { isExpectedWav } from "./transcribe/limits";
import { keepFirstPerKey } from "./planDowngrade";
import { clipDeep } from "./inputLimits";
import { nicheScopeId } from "./context";
import { reportToCsv } from "./reports";

describe("storage paths: no reaching into another customer's folder", () => {
  it("accepts only clean paths under the caller's own folders", () => {
    expect(isOwnPath("me/post/1_a.jpg", ["me"])).toBe(true);
    expect(isOwnPath("owner/post/a.mp4", ["me", "owner"])).toBe(true);
    for (const bad of ["me/../victim/x.mp4", "me/./x", "me//x", "/me/x", "me\\..\\victim", "victim/x.jpg", "me", "", null]) {
      expect(isOwnPath(bad as string, ["me"]), String(bad)).toBe(false);
    }
  });
});

describe("server-side fetches: only platform CDNs (no SSRF)", () => {
  it("recognises Instagram and Facebook media hosts and nothing else", () => {
    expect(isPlatformMediaUrl("https://scontent-lga3-1.cdninstagram.com/v/t51/x.mp4")).toBe(true);
    expect(isPlatformMediaUrl("https://video.xx.fbcdn.net/v/x.mp4")).toBe(true);
    for (const bad of ["http://scontent.cdninstagram.com/x", "https://cdninstagram.com.evil.example/x", "https://evilfbcdn.net/x", "https://127.0.0.1/x", "https://scontent.cdninstagram.com:8443/x", "https://user:pw@scontent.cdninstagram.com/x", "not a url"]) {
      expect(isPlatformMediaUrl(bad), bad).toBe(false);
    }
  });

  it("refuses a redirect that leaves the allowed hosts", async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("cdninstagram") ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }) : new Response("secret"));
    expect(await fetchAllowed("https://a.cdninstagram.com/x", isPlatformMediaUrl, {}, 3, f as unknown as typeof fetch)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("never fetches a disallowed first URL", async () => {
    const f = vi.fn();
    expect(await fetchAllowed("http://10.0.0.1/admin", isPlatformMediaUrl, {}, 3, f as unknown as typeof fetch)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("only stores real Instagram and Facebook links from web research", () => {
    expect(isSocialContentUrl("https://www.instagram.com/reel/abc/")).toBe(true);
    for (const bad of ["https://instagram.com.evil.net/x", "https://evilinstagram.com/x", "javascript://instagram.com/%0aalert(1)", "http://www.instagram.com/x"]) {
      expect(isSocialContentUrl(bad), bad).toBe(false);
    }
  });
});

describe("social connect: OAuth state is bound to this browser (no account injection)", () => {
  const req = (state: string | null, cookie: string | null) =>
    new Request(`https://sociaos.com/api/auth/instagram/callback?code=c${state != null ? `&state=${encodeURIComponent(state)}` : ""}`, { headers: cookie ? { cookie } : {} });

  it("accepts the state this browser was given", () => {
    const { state, nonce } = newOAuthState("onboarding");
    expect(verifyOAuthState(req(state, `ig_oauth_state=${nonce}`), "ig_oauth_state")).toEqual({ ok: true, dest: "onboarding" });
  });

  it("refuses an attacker's code: no state, no cookie, or a different nonce", () => {
    const { state } = newOAuthState("settings");
    expect(verifyOAuthState(req(null, null), "ig_oauth_state").ok).toBe(false);
    expect(verifyOAuthState(req(state, null), "ig_oauth_state").ok).toBe(false);
    expect(verifyOAuthState(req(state, "ig_oauth_state=someone-else"), "ig_oauth_state").ok).toBe(false);
  });
});

describe("cron jobs: only with the secret", () => {
  const r = (auth?: string) => new Request("https://sociaos.com/api/sync/daily", { headers: auth ? { authorization: auth } : {} });
  it("fails closed without a configured secret", () => {
    expect(isCronRequest(r("Bearer x"), undefined)).toBe(false);
    expect(isCronRequest(r("Bearer "), "")).toBe(false);
  });
  it("accepts the secret and nothing else", () => {
    expect(isCronRequest(r("Bearer s3cret"), "s3cret")).toBe(true);
    expect(isCronRequest(r("bearer \"s3cret\""), "s3cret")).toBe(true);
    expect(isCronRequest(r("Bearer s3cre"), "s3cret")).toBe(false);
    expect(isCronRequest(r(), "s3cret")).toBe(false);
  });
});

describe("video builds: a draft needs a counted export", () => {
  it("verifies only paths the export step signed for this person and build", () => {
    const path = signedExportPath("me", "build-1", 1_760_000_000_000)!;
    expect(verifyExportPath(path, "me", "build-1")).toBe(true);
    expect(verifyExportPath(path, "someone", "build-1")).toBe(false);
    expect(verifyExportPath(path, "me", "build-2")).toBe(false);
    expect(verifyExportPath("me/studio/build-1/1760000000000.mp4", "me", "build-1")).toBe(false);
    expect(verifyExportPath(path.replace(/-[0-9a-f]{32}/, "-" + "0".repeat(32)), "me", "build-1")).toBe(false);
  });
});

describe("Studio files: a clip row can only point into its own folder", () => {
  const row = { id: "clip-1", project_id: "proj-1", source_path: "uploader/proj-1/clip-1/source.mp4" };
  it("binds paths to the row's project and clip", () => {
    expect(clipOwnsPath(row, "uploader/proj-1/clip-1/frames/0.jpg")).toBe(true);
    expect(clipFolderOf(row)).toBe("uploader/proj-1/clip-1");
    for (const bad of ["victim/proj-9/clip-9/source.mp4", "uploader/proj-1/clip-1/../../x", "uploader/proj-1", "uploader/proj-1/clip-2/source.mp4"]) {
      expect(clipOwnsPath(row, bad), bad).toBe(false);
    }
    expect(clipFolderOf({ ...row, source_path: "victim/proj-9/clip-9/source.mp4" })).toBeNull();
  });
});

describe("transcription: only the WAV format the length check assumes", () => {
  const wav = (rate: number, channels: number, bits: number, format = 1) => {
    const b = new Uint8Array(44);
    const dv = new DataView(b.buffer);
    b.set([82, 73, 70, 70], 0); dv.setUint32(4, 36, true); b.set([87, 65, 86, 69], 8);
    b.set([102, 109, 116, 32], 12); dv.setUint32(16, 16, true);
    dv.setUint16(20, format, true); dv.setUint16(22, channels, true); dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * channels * bits / 8, true); dv.setUint16(32, channels * bits / 8, true); dv.setUint16(34, bits, true);
    b.set([100, 97, 116, 97], 36);
    return b;
  };
  it("accepts 16 kHz mono 16-bit PCM and refuses anything else", () => {
    expect(isExpectedWav(wav(16_000, 1, 16))).toBe(true);
    expect(isExpectedWav(wav(8_000, 1, 16))).toBe(false);
    expect(isExpectedWav(wav(16_000, 2, 16))).toBe(false);
    expect(isExpectedWav(wav(16_000, 1, 16, 3))).toBe(false);
    expect(isExpectedWav(new TextEncoder().encode("ID3\u0003 an mp3 file pretending to be audio.wav....."))).toBe(false);
  });
});

describe("downgrades: what stays active", () => {
  it("keeps the first N per platform", () => {
    const items = [{ p: "ig", id: 1 }, { p: "ig", id: 2 }, { p: "fb", id: 3 }, { p: "ig", id: 4 }];
    expect(keepFirstPerKey(items, (x) => x.p, 1).map((x) => x.id)).toEqual([1, 3]);
  });
});

describe("AI prompts: request context is bounded", () => {
  it("cuts strings, lists and depth", () => {
    const big = { summary: "x".repeat(50_000), list: Array.from({ length: 500 }, (_, i) => i), deep: { a: { b: { c: { d: { e: { f: 1 } } } } } } };
    const out = clipDeep(big) as { summary: string; list: number[]; deep: unknown };
    expect(out.summary.length).toBe(6_000);
    expect(out.list.length).toBe(20);
    expect(JSON.stringify(out.deep)).not.toContain('"f"');
  });
});

describe("per-brand caches: keyed under the owner", () => {
  it("always starts with the owner's id", () => {
    expect(nicheScopeId({ ownerId: "o1", workspace: null })).toBe("o1");
    expect(nicheScopeId({ ownerId: "o1", workspace: { id: "w2", isDefault: false } as never })).toBe("o1:w2");
    expect(nicheScopeId({ ownerId: "o1", workspace: { id: "w1", isDefault: true } as never })).toBe("o1");
  });
});

describe("report CSV: no spreadsheet formulas from user text", () => {
  it("neutralises cells that start with = + - @", () => {
    const csv = reportToCsv({
      workspaceName: "Salvo's", handle: null, periodLabel: "Oct 2026", days: 28, generatedAt: "2026-10-22T00:00:00Z", summary: [],
      sections: [{ label: "Instagram", metrics: [], topPosts: [{ caption: '=HYPERLINK("https://evil.example","Click")', date: null, engagements: 5, multiplier: null }] }],
    } as never);
    expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);
    expect(csv).toContain(`"'=HYPERLINK`);
  });
});
