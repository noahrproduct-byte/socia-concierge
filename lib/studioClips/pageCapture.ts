// A picture of a real web page for a picture scene: the page a company or a
// product that is named lives at, as a small JPEG that travels with the
// scene. A page can only be photographed by a real browser, which this server
// does not have, so a screenshot service does it (Microlink: 25 to 50 a day
// without a key; MICROLINK_API_KEY lifts that). Server only. The address
// fetched is always the service's; the page's own address is a checked
// parameter (https, a plain public host name, no credentials, no port).
import { bareDomain } from "./brandLogo";
import { PAGE_ART_MAX_CHARS } from "./sceneArt";

const TIMEOUT_MS = 14_000;
const SERVICE = "https://api.microlink.io/";

/** A page address as it may be given, made safe to hand to the service; null when it is not a plain public https page. */
export function publicPage(v: unknown): { url: string; host: string } | null {
  if (typeof v !== "string") return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`); } catch { return null; }
  const host = bareDomain(u.hostname);
  if (!host || u.username || u.password || u.port || u.pathname.length > 120) return null;
  return { url: `https://${u.hostname.toLowerCase()}${u.pathname}`, host };
}

/** The page as a JPEG data URL, or null when it could not be photographed in time, or is too large to keep. */
export async function pageCapture(address: string): Promise<{ src: string; host: string } | null> {
  const page = publicPage(address);
  if (!page) return null;
  const q = new URLSearchParams({ url: page.url, screenshot: "true", meta: "false", embed: "screenshot.url", "screenshot.type": "jpeg", "viewport.width": "720", "viewport.height": "860", "viewport.deviceScaleFactor": "1" });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const key = process.env.MICROLINK_API_KEY;
    const res = await fetch(`${SERVICE}?${q.toString()}`, { signal: ctl.signal, redirect: "follow", headers: key ? { "x-api-key": key } : undefined });
    if (!res.ok || !/^image\//.test(res.headers.get("content-type") ?? "")) return null;
    let buf: Buffer = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6_000_000) return null;
    // Made smaller where the image library is on this server (it comes with Next on most hosts); kept as it came where it is not.
    try {
      const sharp = (await import("sharp")).default;
      buf = await sharp(buf).resize({ width: 560, withoutEnlargement: true }).jpeg({ quality: 64, mozjpeg: true }).toBuffer();
    } catch { /* as it came */ }
    const jpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
    const png = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50;
    if (!jpeg && !png) return null;
    const src = `data:image/${jpeg ? "jpeg" : "png"};base64,${buf.toString("base64")}`;
    return src.length <= PAGE_ART_MAX_CHARS ? { src, host: page.host } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
