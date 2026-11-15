// What a brand is selling and what it wants people to do, for every writer
// that makes its videos (Noah, 2026-11-14: a Beta Twin video "doesn't have
// meaning behind it. It doesn't go towards the goal of getting more bookings.
// It doesn't even mention Beta Twin"). Everything comes from what the person
// confirmed or from the account's own words; nothing is invented. Pure.
import { MAIN_GOALS } from "./growth";
import type { BrandDetail } from "./profile";

export type BrandPitch = {
  name: string | null;
  /** What the account is, in plain words. */
  what: string | null;
  /** What it sells or makes. */
  product: string | null;
  /** The person's main goal, in words. */
  goal: string | null;
  /** Whether the goal is people doing something (booking, ordering, signing up), not just watching. */
  converts: boolean;
  /** The account's own call to action, in its own words, from its bio or captions. */
  cta: string | null;
  /** Lines from the account's best posts, to show how it talks about itself. */
  proof: string[];
};

/** Calls to action people put in a bio or caption. */
const CTA_RE = /\b(dm|message us|link in bio|waitlist|wait list|sign up|signup|join|book|order|reserve|download|get the app|shop|visit)\b/i;

/** The account's own call to action: the first sentence of the bio or a caption that asks for something. Pure. */
export function ownCallToAction(texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const parts = t.replace(/#[\p{L}\p{N}_]+/gu, "").split(/(?<=[.!?])\s+|\n+|👉/u).map((s) => s.replace(/[\p{Extended_Pictographic}️]/gu, "").replace(/\s+/g, " ").trim());
    const hit = parts.find((s) => s.length >= 6 && s.length <= 90 && CTA_RE.test(s));
    if (hit) return hit.replace(/[.!]+$/, "");
  }
  return null;
}

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** The pitch from the brand's saved details. Pure. */
export function pitchFromDetail(detail: BrandDetail | null | undefined, opts: { name?: string | null; goals?: string | null } = {}): BrandPitch {
  const g = detail?.growth;
  const u = g?.understanding;
  const goal = MAIN_GOALS.find((m) => m.id === g?.main_goal);
  const bio = u?.facts?.find((f) => f.bio)?.bio ?? null;
  const standouts = (u?.facts ?? []).flatMap((f) => f.standouts ?? []).map((s) => s.text).filter(Boolean);
  return {
    name: clean(opts.name, 60) || null,
    what: clean(detail?.description, 400) || clean(u?.visual?.about?.value, 300) || clean(g?.niche_path?.specific, 200) || null,
    product: clean(u?.visual?.about?.product, 80) || null,
    goal: goal?.label ?? (clean(opts.goals, 160) || null),
    converts: goal ? goal.id === "bookings_orders" || goal.id === "local_customers" : /book|order|sign.?up|waitlist|sale|customer|lead/i.test(opts.goals ?? ""),
    cta: ownCallToAction([bio, ...standouts]),
    proof: standouts.slice(0, 3).map((s) => clean(s, 160)),
  };
}

/** The pitch as lines for a prompt; only what is known. Pure. */
export function pitchLines(p: BrandPitch): string[] {
  return [
    p.name ? `Brand: ${p.name}` : "",
    p.what ? `What it is: ${p.what}` : "",
    p.product ? `What it sells or makes: ${p.product}` : "",
    p.goal ? `The owner's main goal: ${p.goal}` : "",
    p.cta ? `Its own call to action, in its own words: "${p.cta}"` : "",
    p.proof.length ? `How its best posts talk:\n${p.proof.map((x) => `- "${x}"`).join("\n")}` : "",
  ].filter(Boolean);
}
