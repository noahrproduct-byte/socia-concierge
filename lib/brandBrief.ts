// What a brand is and how it posts, as the person confirmed it, in the lines
// every writer gets (the Content Plan strategist, the animated ideas, captions).
// Noah, 2026-11-14: an animated plan for a climbing app came out about software
// beta testing because the writer only saw "betatwin.app" and "Tech & Gadgets".
// Pure; the confirmed values come from components/brand/BrandRead.tsx.
import { MADE, MADE_LABEL, type Made } from "./intel/reelReadCore";

/** A kind of video the account posts, confirmed by the person. */
export type BrandFormat = { name: string; made: Made; look: string };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Confirmed formats from a request, made safe: at most six, each with a name and a look. Pure. */
export function cleanFormats(v: unknown): BrandFormat[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : {}))
    .map((f) => ({
      name: clean(f.name, 40),
      made: ((MADE as readonly string[]).includes(String(f.made)) ? f.made : "mixed") as Made,
      look: clean(f.look, 320),
    }))
    .filter((f) => f.name && f.look)
    .slice(0, 6);
}

type BriefInput = {
  handle?: string | null;
  niche?: string | null;
  description?: string | null;
  /** The Growth Profile's narrower niche ("Pre-launch app that scans a bouldering wall..."), used when there's no description. */
  specific?: string | null;
  audience?: string | null;
  formats?: BrandFormat[] | null;
  look?: string | null;
  voice?: string | null;
  location?: string | null;
  avoid?: string | null;
};

/** The brand in a few labelled lines; only what is known. Pure. */
export function brandLines(b: BriefInput): string[] {
  const about = clean(b.description, 600) || clean(b.specific, 200);
  const formats = (b.formats ?? []).filter((f) => f.name && f.look);
  return [
    b.handle ? `Account: ${b.handle}` : "",
    about ? `What the account is: ${about}` : "",
    b.niche ? `Niche: ${b.niche}` : "",
    b.audience ? `Audience: ${clean(b.audience, 200)}` : "",
    formats.length ? `How it posts (confirmed by the owner):\n${formats.map((f) => `- ${f.name} (${MADE_LABEL[f.made].toLowerCase()}): ${f.look}`).join("\n")}` : "",
    b.look ? `Its look: ${clean(b.look, 240)}` : "",
    b.location ? `Location: ${clean(b.location, 120)}` : "",
    b.voice ? `Voice: ${clean(b.voice, 120)}` : "",
    b.avoid ? `Avoid: ${clean(b.avoid, 200)}` : "",
  ].filter(Boolean);
}
