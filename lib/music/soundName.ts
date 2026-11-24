// A playlist sound's name as people read it. Sounds saved from a downloader
// arrive named like "YTSave.to_YouTube_Media_OnFlx2Lnr9Q_Dean-Martin-That-s-
// Amore_008_128k": the site, the video id, a track number and the bitrate
// come off, so the playlist says "Dean Martin That s Amore". A name the person
// typed is left as it is. Pure.

const NOISE: RegExp[] = [
  /\b(?:ytsave|y2mate|savefrom|ssyoutube|snapsave|ssstik|snaptik|tiktokio|savetik|yt1s|ytmp3)(?:\.[a-z]{2,4})?\b/gi,
  /\b(?:youtube|tiktok|instagram)\s+(?:media|video|audio|mp3)\b/gi,
  /\b\d{2,3}\s?kbps?\b|\b\d{2,3}k\b/gi,
  /\((?:official\s+)?(?:audio|video|lyrics?|music video)\)|\[(?:official\s+)?(?:audio|video|lyrics?)\]/gi,
];

/** An 11-character YouTube video id: letters, digits, - and _, with both a digit and a letter in it. */
const looksLikeVideoId = (w: string) => /^[A-Za-z0-9_-]{11}$/.test(w) && /\d/.test(w) && /[A-Za-z]/.test(w);

export function soundName(raw: string): string {
  let s = raw.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_]+/g, " ").replace(/\s+-\s+|-(?=\S)/g, " ");
  for (const re of NOISE) s = s.replace(re, " ");
  const words = s.split(/\s+/).filter(Boolean).filter((w) => !looksLikeVideoId(w) && !/^0\d{1,2}$/.test(w));
  const out = words.join(" ").replace(/^[\s.,:;-]+|[\s.,:;-]+$/g, "").trim();
  return out || raw.trim();
}
