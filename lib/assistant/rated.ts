// The videos the person rated in Content Studio in this browser tab, so Ask
// SOCIA can act on "the video I just rated": its name, SOCIA's read of it
// and the caption they're working on go to the assistant as [V#]; the file
// itself never leaves this tab until the person confirms a schedule. Lost on
// a reload (the file is only in memory). Client only.
export type RatedVideo = {
  ref: string;
  name: string;
  kind: "video" | "image";
  ratedAt: string;
  durationSec: number | null;
  /** SOCIA's read of it, one or two lines */
  summary: string;
  /** the caption the person is working on in Rate, "" when none yet */
  caption: string;
};

/** Captions sent to the assistant are capped so a long draft can't crowd out the request. */
const CAPTION_MAX = 600;

const MAX = 10;
let items: { video: RatedVideo; file: File }[] = [];
// Refs start at a random number per page load: an Ask SOCIA thread kept from
// before a reload can still name "V1", which must not now mean another file.
let seq = 100 + Math.floor(Math.random() * 800);

/** Add a rated file, or refresh it when it's the same file rated again; returns its ref. */
export function rememberRated(file: File, v: Omit<RatedVideo, "ref" | "ratedAt">): string {
  const same = items.find((x) => x.file === file);
  if (same) {
    same.video = { ...same.video, ...v, caption: v.caption.slice(0, CAPTION_MAX), ratedAt: new Date().toISOString() };
    items = [same, ...items.filter((x) => x !== same)];
    return same.video.ref;
  }
  const ref = `V${++seq}`;
  items = [{ video: { ...v, caption: v.caption.slice(0, CAPTION_MAX), ref, ratedAt: new Date().toISOString() }, file }, ...items].slice(0, MAX);
  return ref;
}

export function updateRatedCaption(ref: string, caption: string): void {
  const it = items.find((x) => x.video.ref === ref);
  if (it) it.video = { ...it.video, caption: caption.slice(0, CAPTION_MAX) };
}

/** Newest first. */
export function ratedVideos(): RatedVideo[] {
  return items.map((x) => x.video);
}

export function ratedFile(ref: string): { video: RatedVideo; file: File } | null {
  return items.find((x) => x.video.ref === ref) ?? null;
}

/** Scheduled: it's a post now, so it leaves the list. */
export function forgetRated(ref: string): void {
  items = items.filter((x) => x.video.ref !== ref);
}
