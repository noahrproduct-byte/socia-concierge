import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";

// The landing page's optional footage and stills, checked on the server at
// render time so the page never requests a file that is not there. Drop the
// files into public/landing/ and they appear; nothing else changes.
//
//   public/landing/opening.mp4          footage through the letters of the opening
//   public/landing/reel.mp4 + reel.jpg  the Reel in the reveal, and its poster
//   public/landing/quiet.jpg            the underperforming post in the problem section
//   public/landing/clips/<id>.jpg       a still for each Content Studio clip

export const CLIP_IDS = ["pour", "plate", "dish", "bite", "wide"] as const;
export type ClipId = (typeof CLIP_IDS)[number];

export type LandingAssets = { opening: string | null; reel: string | null; reelPoster: string | null; quiet: string | null; clips: Partial<Record<ClipId, string>> };

export function landingAssets(): LandingAssets {
  const root = join(process.cwd(), "public", "landing");
  const opening = existsSync(join(root, "opening.mp4")) ? "/landing/opening.mp4" : null;
  const reel = existsSync(join(root, "reel.mp4")) ? "/landing/reel.mp4" : null;
  const reelPoster = existsSync(join(root, "reel.jpg")) ? "/landing/reel.jpg" : null;
  const quiet = existsSync(join(root, "quiet.jpg")) ? "/landing/quiet.jpg" : null;
  const clips: Partial<Record<ClipId, string>> = {};
  for (const id of CLIP_IDS) if (existsSync(join(root, "clips", `${id}.jpg`))) clips[id] = `/landing/clips/${id}.jpg`;
  return { opening, reel, reelPoster, quiet, clips };
}
