import { describe, it, expect } from "vitest";
import { checkLinkTarget, imageSize, importLinkedMedia, LINK_MAX_BYTES } from "./media";

const PUBLIC = async () => ["104.18.1.1"];
const ctx = { ownerId: "owner-1", workspace: { id: "ws-1" } } as never;

function svc() {
  const uploads: { path: string; size: number; contentType: string }[] = [];
  return {
    uploads,
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array, opts: { contentType: string }) => { uploads.push({ path, size: bytes.byteLength, contentType: opts.contentType }); return { error: null }; },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }),
      }),
    },
  };
}

function png(w: number, h: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(new ArrayBuffer(40));
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

function jpeg(w: number, h: number): Uint8Array<ArrayBuffer> {
  // SOI, an APP0 segment, then SOF0 with height and width.
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0, 0, 0, 0]);
}

describe("links SOCIA will fetch", () => {
  it("takes public https links only", async () => {
    expect(await checkLinkTarget("https://cdn.example/pie.jpg", { fetch, resolve: PUBLIC })).toBeNull();
    expect(await checkLinkTarget("http://cdn.example/pie.jpg", { fetch, resolve: PUBLIC })).toMatch(/https/);
    expect(await checkLinkTarget("https://user:pw@cdn.example/pie.jpg", { fetch, resolve: PUBLIC })).toMatch(/password/);
    expect(await checkLinkTarget("https://internal.example/x", { fetch, resolve: async () => ["10.0.0.4"] })).toMatch(/private/);
    expect(await checkLinkTarget("https://169.254.169.254/latest", { fetch, resolve: PUBLIC })).toMatch(/private/);
    expect(await checkLinkTarget("not a link", { fetch, resolve: PUBLIC })).toMatch(/valid/);
  });

  it("reads image dimensions from PNG and JPEG headers", () => {
    expect(imageSize(png(1080, 1350))).toEqual({ width: 1080, height: 1350 });
    expect(imageSize(jpeg(1080, 1920))).toEqual({ width: 1080, height: 1920 });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toEqual({ width: null, height: null });
  });
});

describe("copying a linked file", () => {
  it("stores an image under the owner's folder with its type and size", async () => {
    const s = svc();
    const body = png(1080, 1080);
    const m = await importLinkedMedia(ctx, s, "https://cdn.example/photos/Pie%20Night.png", { resolve: PUBLIC, fetch: async () => new Response(body, { headers: { "content-type": "image/png" } }) });
    expect(m).toMatchObject({ kind: "image", mime: "image/png", size: body.byteLength, width: 1080, height: 1080, duration: null, name: "Pie Night.png" });
    expect(m.path).toMatch(/^owner-1\/assistant\/[0-9a-f-]{36}\.png$/);
    expect(s.uploads).toEqual([{ path: m.path, size: body.byteLength, contentType: "image/png" }]);
  });

  it("refuses a share page, a file that's too large, and a redirect to a private address", async () => {
    const s = svc();
    await expect(importLinkedMedia(ctx, s, "https://drive.example/file/abc/view", { resolve: PUBLIC, fetch: async () => new Response("<html>", { headers: { "content-type": "text/html; charset=utf-8" } }) }))
      .rejects.toThrow(/isn't a direct image or video file/);
    await expect(importLinkedMedia(ctx, s, "https://cdn.example/big.mp4", { resolve: PUBLIC, fetch: async () => new Response("x", { headers: { "content-type": "video/mp4", "content-length": String(LINK_MAX_BYTES.video + 1) } }) }))
      .rejects.toThrow(/larger than 100 MB/);
    const hops = async (url: RequestInfo | URL) => String(url).includes("cdn.example")
      ? new Response(null, { status: 302, headers: { location: "https://metadata.internal/secret" } })
      : new Response(png(1, 1), { headers: { "content-type": "image/png" } });
    await expect(importLinkedMedia(ctx, s, "https://cdn.example/pie.png", { resolve: async (h) => (h === "metadata.internal" ? ["169.254.169.254"] : ["104.18.1.1"]), fetch: hops as typeof fetch }))
      .rejects.toThrow(/private address/);
    expect(s.uploads).toEqual([]);
  });

  it("stops reading a file that turns out larger than its kind allows", async () => {
    const s = svc();
    const big = new Uint8Array(LINK_MAX_BYTES.image + 10);
    await expect(importLinkedMedia(ctx, s, "https://cdn.example/huge.jpg", { resolve: PUBLIC, fetch: async () => new Response(big, { headers: { "content-type": "image/jpeg" } }) }))
      .rejects.toThrow(/larger than 10 MB/);
    expect(s.uploads).toEqual([]);
  });
});
