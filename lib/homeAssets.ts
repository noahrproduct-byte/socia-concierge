import { existsSync } from "node:fs";
import { join } from "node:path";

// The homepage's brand artwork (public/home), generated on 2026-10-27 from
// SOCIA's own mark and checked into the repo. The server decides what exists
// so the client never probes for a file and never shows a broken image.

export type HomeAssets = {
  heroMark: string | null;
};

const pub = (p: string) => (existsSync(join(process.cwd(), "public", p)) ? `/${p}` : null);

export function homeAssets(): HomeAssets {
  return {
    heroMark: pub("home/hero-mark-v3.jpg"),
  };
}
