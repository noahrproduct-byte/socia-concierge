// A country's outline for a picture scene (lib/studioClips/sceneArt.ts), by
// the name it is said with. The outlines are Natural Earth's (public domain),
// simplified and fitted to a 100 by 100 box. Server only: the data is about
// 135 KB and is never sent to the browser whole; the one outline a scene uses
// travels with the scene.
import data from "./data/countries.json";
import type { SceneArt } from "./sceneArt";

const COUNTRIES = data as unknown as Record<string, { d: string; c: (number | null)[] }>;
const ALIASES: Record<string, string> = {
  usa: "united states of america", us: "united states of america", "u.s.": "united states of america", "u.s.a.": "united states of america", america: "united states of america", "united states": "united states of america", "the states": "united states of america",
  uk: "united kingdom", "u.k.": "united kingdom", britain: "united kingdom", "great britain": "united kingdom", england: "united kingdom",
  uae: "united arab emirates", emirates: "united arab emirates", dubai: "united arab emirates",
  korea: "south korea", "czech republic": "czechia", holland: "netherlands", burma: "myanmar", "ivory coast": "côte d'ivoire", "dr congo": "dem. rep. congo", drc: "dem. rep. congo",
  "dominican republic": "dominican rep.", bosnia: "bosnia and herz.", "south sudan": "s. sudan", "north macedonia": "macedonia", turkiye: "turkey", "türkiye": "turkey", swaziland: "eswatini",
};
const TITLE: Record<string, string> = { "united states of america": "United States", "dem. rep. congo": "DR Congo", "dominican rep.": "Dominican Republic", "bosnia and herz.": "Bosnia", "s. sudan": "South Sudan", macedonia: "North Macedonia" };

/** The map of a country as it was named ("Egypt", "the US", "UAE"), or null when it is not one. */
export function countryArt(said: string): Extract<SceneArt, { kind: "map" }> | null {
  const key = said.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
  const id = ALIASES[key] ?? key;
  const hit = Object.prototype.hasOwnProperty.call(COUNTRIES, id) ? COUNTRIES[id] : null;
  if (!hit) return null;
  const name = TITLE[id] ?? id.replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
  return { kind: "map", name, d: hit.d, c: [hit.c[0] ?? 50, hit.c[1] ?? 50] };
}
