import { existsSync } from "node:fs";
import { join } from "node:path";

// The homepage's brand stills (public/home), generated on 2026-10-27 and
// checked into the repo. The server decides what exists so the client never
// probes for a file and never shows a broken image.

export type HomeAssets = {
  heroAtmosphere: string | null;
  loopTrails: string | null;
  studioDesk: string | null;
  tilesKeys: string | null;
};

const pub = (p: string) => (existsSync(join(process.cwd(), "public", p)) ? `/${p}` : null);

export function homeAssets(): HomeAssets {
  return {
    heroAtmosphere: pub("home/hero-atmosphere.jpg"),
    loopTrails: pub("home/loop-trails.jpg"),
    studioDesk: pub("home/studio-desk.jpg"),
    tilesKeys: pub("home/tiles-keys.jpg"),
  };
}
