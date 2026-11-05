// "Your place": what SOCIA saw in photos of the business, kept as words on the
// brand (brand_detail.place), so every script and idea can say where to stand
// and what to film ("walk in through the glass front door, phone at chest
// height") instead of generic advice. The photos themselves are not kept; only
// this description is. Pure: the scan route calls the model, this file shapes,
// bounds and renders what it returns.

export type PlaceSpot = {
  /** what the person would call it: "Front door", "Espresso bar" */
  name: string;
  /** what it looks like in the photos */
  looks: string;
  /** how to film there: where to stand, the move, the light */
  filmIt: string;
};

export type Place = {
  /** what the place is, in one sentence */
  kind: string;
  spots: PlaceSpot[];
  /** where the light is and when it is best */
  light: string;
  /** what makes the place recognisable at a glance ("" when nothing stands out) */
  signature: string;
  /** what the photos didn't show, so scripts don't assume it */
  unseen: string;
  scannedAt: string;
  photos: number;
};

export const PLACE_MAX_PHOTOS = 6;
export const PLACE_MAX_SPOTS = 8;
/** Decoded bytes per photo; the browser sends them resized to about 1280px, well under this. */
export const PLACE_MAX_BYTES = 1_500_000;

export const PLACE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    kind: { type: "string" },
    spots: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, looks: { type: "string" }, filmIt: { type: "string" } },
        required: ["name", "looks", "filmIt"],
      },
    },
    light: { type: "string" },
    signature: { type: "string" },
    unseen: { type: "string" },
  },
  required: ["kind", "spots", "light", "signature", "unseen"],
} as const;

export const PLACE_SYSTEM = `You look at photos of one small business (a shop, cafe, salon, gym, studio, restaurant or similar) and describe the place for the person who will film short videos there. Your notes are used later to write shot directions such as "start outside and walk in through the glass front door", so name real spots a person would recognise.
Rules:
- Describe only what is visible in the photos. Never guess a name, a price, a menu item, opening hours or anything written that you can't read clearly.
- People in the photos: never describe who they are or what they look like; at most say a spot is where staff work.
- "kind": what the place is, in one plain sentence ("A small coffee shop with a long counter and about eight tables").
- "spots": up to ${PLACE_MAX_SPOTS} places worth filming, the ones a video would use first: the entrance, the counter or work area, the product on display, a seat or corner with character, the sign. "name" is two or three words the owner would use ("Front door", "Pastry case"). "looks" says what it looks like in a few words. "filmIt" says how to film there in one sentence: where to stand, the camera height and move, and what to keep in frame or out of it (for example "stand on the sidewalk, phone at chest height, and walk in as the door opens so the logo on the glass passes the lens").
- "light": where the light comes from and the best place or time to film (windows, lamps, dark corners to avoid). Say plainly when you can't tell.
- "signature": the one or two things that make this place recognisable at a glance and belong in an opening shot, or "" when nothing stands out.
- "unseen": what the photos don't show that videos often need (the outside, the kitchen, the product close up), so no script assumes it. "" when they cover it.
- Plain sentences, no markdown, no em dashes, no marketing words.`;

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, n) : "");

/** A stored or freshly scanned place, bounded; null when there is nothing usable. */
export function sanitizePlace(raw: unknown): Place | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const spots = (Array.isArray(r.spots) ? r.spots : [])
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
    .map((s) => ({ name: str(s.name, 40), looks: str(s.looks, 200), filmIt: str(s.filmIt, 300) }))
    .filter((s) => s.name && (s.looks || s.filmIt))
    .slice(0, PLACE_MAX_SPOTS);
  const kind = str(r.kind, 200);
  if (!kind && !spots.length) return null;
  const at = typeof r.scannedAt === "string" && !Number.isNaN(Date.parse(r.scannedAt)) ? r.scannedAt : new Date(0).toISOString();
  const photos = Number.isFinite(Number(r.photos)) ? Math.max(0, Math.min(PLACE_MAX_PHOTOS, Math.round(Number(r.photos)))) : 0;
  return { kind, spots, light: str(r.light, 300), signature: str(r.signature, 200), unseen: str(r.unseen, 300), scannedAt: at, photos };
}

/** The place as prompt lines for brandContext. [] when SOCIA hasn't seen the place. */
export function placeLines(place: Place | null | undefined): string[] {
  const p = sanitizePlace(place);
  if (!p) return [];
  return [
    `Your place (SOCIA scanned ${p.photos || "some"} photo${p.photos === 1 ? "" : "s"} of it; use these spots by name in filming directions): ${p.kind}`,
    ...p.spots.map((s) => `- ${s.name}: ${s.looks}${s.filmIt ? ` How to film it: ${s.filmIt}` : ""}`),
    p.light ? `Light: ${p.light}` : null,
    p.signature ? `What makes the place recognisable (good in a first shot): ${p.signature}` : null,
    p.unseen ? `Not seen in the photos, so don't assume it: ${p.unseen}` : null,
  ].filter((l): l is string => Boolean(l));
}

/**
 * How every filmed shot SOCIA writes is directed: a place, a camera and a first
 * frame, so the person can film it without working it out. One rule, shared by
 * the plan, video ideas, Ask SOCIA's scripts and the Studio guide.
 */
export const FILMING_DIRECTION_RULE = `Filming directions: every filmed shot tells the person exactly where to stand and what the camera does, so they can film it without working anything out. Each one names the spot (when "Your place" is in the brand settings, use its spots by name, like "the front door" or "the pastry case", and its light notes), the camera position and move ("phone at chest height, walk in through the front door as it opens", "close on the cup, slide left to the window") and what is in frame first. The first shot starts in motion on the hook, never on a wide still of the room. When the account's own best posts share an opening (in the evidence), open the same way and say which posts. Without "Your place", name a spot this kind of business usually has, written as theirs to swap ("your front door", "your counter"), and never state a feature as fact (a patio, a neon sign, a view) that the brand settings don't mention.`;
