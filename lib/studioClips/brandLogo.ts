// A company's or product's real mark for a picture scene, by its website's
// domain: the icon Google's favicon service keeps for that site, as a small
// data URL that travels with the scene. Server only. The address fetched is
// always Google's, with the domain as a checked parameter, so nothing a model
// or a person names can point this server at another host.
import { LOGO_ART_MAX_CHARS } from "./sceneArt";

const DOMAIN = /^(?=.{4,60}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const TIMEOUT_MS = 4000;

/** A domain as it may be given ("https://www.Notion.so/product"), made bare ("notion.so"); null when it is not one. */
export function bareDomain(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
  return DOMAIN.test(d) ? d : null;
}

/** The site's icon as a PNG data URL, or null when there is none, it is too large, or the service did not answer in time. */
export async function brandLogo(domain: string): Promise<string | null> {
  const d = bareDomain(domain);
  if (!d) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=256`, { signal: ctl.signal, redirect: "follow" });
    // An unknown site answers 404 with a placeholder globe: not a logo.
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const png = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    // A real mark is more than a 16-pixel favicon: the width is in the PNG's header.
    if (!png || buf.readUInt32BE(16) < 48) return null;
    const src = `data:image/png;base64,${buf.toString("base64")}`;
    return src.length <= LOGO_ART_MAX_CHARS ? src : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
