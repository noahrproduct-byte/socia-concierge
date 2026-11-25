// A video link pasted as the reference, from any of the platforms people copy from (Noah, 2026-11-25: "it can
// also be a TikTok, Instagram, etc. link"). Which platform it is and the video's id, from the link alone. What
// SOCIA can then do differs by platform, and only through official routes:
//   - Instagram: the Reel's video, through the Business Discovery read (app/api/studio/reference/reel), so it is
//     studied like a dropped file;
//   - TikTok and YouTube: their public oEmbed answers give the title, the creator and the cover, never the file
//     (their terms don't allow apps to download videos), so the card names the video and asks for the file;
//   - Facebook: a recognised link, nothing read (Meta's oEmbed needs an app review SOCIA hasn't done).
// Pure and browser-safe.
import { parseReelLink } from "./referenceSource";

export type VideoPlatform = "instagram" | "tiktok" | "youtube" | "facebook";
export type VideoLink = { platform: VideoPlatform; link: string; id: string; /** the account, when the link carries it */ handle?: string };

export const PLATFORM_NAME: Record<VideoPlatform, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook" };

const onHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** The platform and the video's id from a pasted link; null when it isn't a video link SOCIA knows. */
export function parseVideoLink(raw: string): VideoLink | null {
  let u: URL;
  const text = raw.trim();
  try { u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  if (onHost(host, "instagram.com")) {
    const ig = parseReelLink(`https://www.instagram.com${path}`);
    return ig ? { platform: "instagram", link: ig.link, id: ig.code } : null;
  }
  if (onHost(host, "tiktok.com")) {
    const full = /^\/@([\w.]{1,40})\/(?:video|photo)\/(\d{6,25})\/?$/.exec(path);
    if (full) return { platform: "tiktok", link: `https://www.tiktok.com/@${full[1]}/video/${full[2]}`, id: full[2], handle: full[1].toLowerCase() };
    // Share links (vm.tiktok.com/xyz, tiktok.com/t/xyz) only TikTok can resolve; oEmbed accepts them as they are.
    const short = onHost(host, "vm.tiktok.com") || onHost(host, "vt.tiktok.com") ? /^\/([\w-]{5,20})\/?$/.exec(path) : /^\/t\/([\w-]{5,20})\/?$/.exec(path);
    if (short) return { platform: "tiktok", link: `https://${host}${path}`, id: short[1] };
    return null;
  }
  if (host === "youtu.be") {
    const m = /^\/([\w-]{11})\/?$/.exec(path);
    return m ? { platform: "youtube", link: `https://www.youtube.com/watch?v=${m[1]}`, id: m[1] } : null;
  }
  if (onHost(host, "youtube.com")) {
    const shorts = /^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/.exec(path);
    const id = shorts?.[1] ?? (path === "/watch" ? u.searchParams.get("v") : null);
    return id && /^[\w-]{11}$/.test(id) ? { platform: "youtube", link: shorts && path.startsWith("/shorts") ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`, id } : null;
  }
  if (onHost(host, "facebook.com") || host === "fb.watch") {
    const watched = /^\/watch\/?$/.test(path) ? u.searchParams.get("v") : null;
    const id = /\/(?:videos|reel|watch)\/(?:[\w.-]+\/)?(\d{6,25})\/?$/.exec(path)?.[1]
      ?? (watched && /^\d{6,25}$/.test(watched) ? watched : null)
      ?? (host === "fb.watch" ? /^\/([\w-]{5,20})\/?$/.exec(path)?.[1] ?? null : null);
    return id ? { platform: "facebook", link: `https://${host}${path}${u.search}`, id } : null;
  }
  return null;
}

/** Why a video from this platform can't be studied, and what to do instead. */
export function unstudiedWhy(platform: VideoPlatform): string {
  if (platform === "facebook") return "Facebook doesn't share its videos with apps like SOCIA, so its footage can't be studied. Save it and upload the file, and SOCIA studies its length, pace and shots; otherwise the cut follows your prompt.";
  return `${PLATFORM_NAME[platform]} doesn't let apps download its videos, so SOCIA can't study this one's footage. Save it from ${PLATFORM_NAME[platform]} and upload the file, and SOCIA studies its length, pace and shots; otherwise the cut follows your prompt.`;
}
