// How long a Clipper source really is, measured by SOCIA. Vizard bills SOCIA
// by source minute, so the price of a job is never taken from what the person
// typed: YouTube lengths come from the Data API (or the watch page), uploads
// and direct links are read with Mediabunny (only the file's header is
// fetched, with range requests). A video SOCIA can't measure is refused.
// Server only.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { videoDurationSec, ytConfigured } from "@/lib/youtube";

/** Longest source SOCIA accepts, minutes. Longer videos are refused, never priced at the cap. */
export const MAX_SOURCE_MINUTES = 600;
const MEASURE_TIMEOUT_MS = 20_000;

/** The video id in a YouTube link; null when there is none. Pure. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.replace(/^(www\.|m\.)/, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
    else if (host === "youtube.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        const m = /^\/(shorts|live)\/([^/]+)/.exec(u.pathname);
        id = m?.[2] ?? null;
      }
    }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Seconds of a YouTube video from its watch page; null when it can't be read. */
export async function youtubePageSeconds(id: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const res = await fetchImpl(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SOCIA clipper)", "Accept-Language": "en" } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = /"lengthSeconds"\s*:\s*"(\d+)"/.exec(html) ?? /<meta itemprop="duration" content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/.exec(html);
    if (!m) return null;
    const seconds = m.length === 2 ? Number(m[1]) : Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
    return seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

/** True for an address on the public internet (not loopback, private, link-local, CGNAT, multicast or reserved). Pure. */
export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || b === 0)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPublicAddress(mapped[1]);
    if (/^(fc|fd|fe[89ab]|ff)/.test(s)) return false;
    return true;
  }
  return false;
}

type Lookup = (host: string) => Promise<{ address: string }[]>;
const dnsLookup: Lookup = (host) => lookup(host, { all: true, verbatim: true });

/** A direct link SOCIA may read: https, default port, no credentials, a host that resolves only to public addresses. */
export async function isReadableLink(url: string, resolve: Lookup = dnsLookup): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPublicAddress(host);
  if (!host.includes(".") || /\.(local|internal|localhost)$/i.test(host)) return false;
  try {
    const addrs = await resolve(host);
    return addrs.length > 0 && addrs.every((a) => isPublicAddress(a.address));
  } catch {
    return false;
  }
}

/** Seconds of a video file at a URL, from its header. null when it can't be read in time. */
export async function fileSeconds(url: string): Promise<number | null> {
  const mb = await import("mediabunny");
  const input = new mb.Input({
    formats: mb.ALL_FORMATS,
    // No redirects: a link that bounces elsewhere is not measured (and not clipped).
    source: new mb.UrlSource(url, { requestInit: { redirect: "error" }, getRetryDelay: (n) => (n < 2 ? 1 : null) }),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS); });
    const sec = await Promise.race([input.computeDuration().catch(() => null), timeout]);
    return typeof sec === "number" && Number.isFinite(sec) && sec > 0 ? sec : null;
  } finally {
    clearTimeout(timer);
    input.dispose();
  }
}

/** Seconds of a YouTube video: the Data API when configured, else the watch page. */
export async function youtubeSeconds(url: string): Promise<number | null> {
  const id = youtubeId(url);
  if (!id) return null;
  const api = ytConfigured() ? await videoDurationSec(id).catch(() => null) : null;
  return api && api > 0 ? api : youtubePageSeconds(id);
}
