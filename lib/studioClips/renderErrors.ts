// What a failed render says to the person. The browser renderer's own errors are
// written for developers ("WebGL context was lost during canvas effect rendering…
// Try reducing concurrency or increasing the Lambda function memory", shown as it
// was to Noah on 2026-11-26); here each known one becomes what happened and what
// to do, in plain words, and anything unrecognised that reads as code becomes the
// general line. SOCIA's own messages (already plain) pass through. Pure.

const GENERAL = "The video couldn't be made this time. Your edit is saved; try again, and if it keeps failing open SOCIA in Chrome or Edge on a computer.";

/** The browser dropped its graphics context mid-render (too many videos or tabs using the graphics card). */
export const isGraphicsLost = (e: unknown): boolean => /webgl|context (was )?lost|gpu (process|device) (was )?lost/i.test((e as Error)?.message ?? String(e ?? ""));

const KNOWN: [RegExp, string][] = [
  [/webgl|context (was )?lost|gpu (process|device)/i, "Your browser ran out of graphics memory while making the video. Close other tabs that are playing video, then make it again. Your edit is saved."],
  [/quota|out of memory|allocation failed|array buffer allocation/i, "This computer ran out of memory while making the video. Close other tabs and apps, then make it again. Your edit is saved."],
  [/failed to fetch|networkerror|load failed|err_internet|err_network/i, "SOCIA lost its connection while making the video. Check your internet and make it again. Your edit is saved."],
  [/videoencoder|audioencoder|webcodecs|codec|encoder|decoder|decode/i, "This browser couldn't encode the video. Open SOCIA in Chrome or Edge on a computer and make it again; your edit is saved and opens there as it is."],
];
/** Text that reads as code or a developer's note rather than something written for the person. */
const TECHNICAL = /remotion|lambda|concurrency|canvas|undefined|null\b|is not a function|cannot read|typeerror|referenceerror|rangeerror|domexception|stack|at \w+ \(|\bnan\b|https?:\/\//i;

/** The message to show for a failed render. */
export function renderErrorCopy(e: unknown): string {
  const raw = ((e as Error)?.message ?? (typeof e === "string" ? e : "")).replace(/^Upload failed: /, "").trim();
  if (!raw) return GENERAL;
  for (const [re, copy] of KNOWN) if (re.test(raw)) return copy;
  return TECHNICAL.test(raw) || raw.length > 260 ? GENERAL : raw;
}
