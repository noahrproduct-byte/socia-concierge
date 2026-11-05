import { describe, it, expect } from "vitest";
import { isPublicAddress, isReadableLink, youtubeId, youtubePageSeconds } from "./sourceLength";

describe("YouTube links", () => {
  it("finds the video id in every link shape, and nothing else", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=OqLfw-TzzfI&t=4")).toBe("OqLfw-TzzfI");
    expect(youtubeId("youtu.be/OqLfw-TzzfI")).toBe("OqLfw-TzzfI");
    expect(youtubeId("https://m.youtube.com/shorts/abcdefgh")).toBe("abcdefgh");
    expect(youtubeId("https://youtube.com/live/abcdefgh?si=1")).toBe("abcdefgh");
    expect(youtubeId("https://www.youtube.com/watch?v=x@evil.example")).toBeNull();
    expect(youtubeId("https://example.com/watch?v=OqLfw-TzzfI")).toBeNull();
  });

  it("reads the length from the watch page of that id only", async () => {
    const seen: string[] = [];
    const page = (body: string, status = 200) => (async (u: string) => { seen.push(u); return new Response(body, { status }); }) as unknown as typeof fetch;
    expect(await youtubePageSeconds("OqLfw-TzzfI", page(`... "lengthSeconds":"754" ...`))).toBe(754);
    expect(seen[0]).toBe("https://www.youtube.com/watch?v=OqLfw-TzzfI");
    expect(await youtubePageSeconds("OqLfw-TzzfI", page("nothing"))).toBeNull();
    expect(await youtubePageSeconds("OqLfw-TzzfI", page("", 404))).toBeNull();
  });
});

describe("direct links SOCIA may read", () => {
  it("knows public addresses from private ones", () => {
    for (const ip of ["8.8.8.8", "151.101.1.69", "2606:4700::6810:84e5"]) expect(isPublicAddress(ip), ip).toBe(true);
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPublicAddress(ip), ip).toBe(false);
  });

  it("takes only https on the default port to hosts that resolve to public addresses", async () => {
    const dns = (ips: string[]) => async () => ips.map((address) => ({ address }));
    expect(await isReadableLink("https://cdn.example.com/a.mp4", dns(["151.101.1.69"]))).toBe(true);
    expect(await isReadableLink("https://cdn.example.com/a.mp4", dns(["151.101.1.69", "10.0.0.2"]))).toBe(false);
    expect(await isReadableLink("http://cdn.example.com/a.mp4", dns(["151.101.1.69"]))).toBe(false);
    expect(await isReadableLink("https://cdn.example.com:8443/a.mp4", dns(["151.101.1.69"]))).toBe(false);
    expect(await isReadableLink("https://user:pw@cdn.example.com/a.mp4", dns(["151.101.1.69"]))).toBe(false);
    expect(await isReadableLink("https://169.254.169.254/a.mp4", dns([]))).toBe(false);
    expect(await isReadableLink("https://metadata.internal/a.mp4", dns(["151.101.1.69"]))).toBe(false);
    expect(await isReadableLink("https://gone.example.com/a.mp4", async () => { throw new Error("ENOTFOUND"); })).toBe(false);
  });
});
