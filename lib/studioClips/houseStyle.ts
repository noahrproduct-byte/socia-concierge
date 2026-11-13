// House editing style for Content Studio, measured from Umar's finished
// exports (Nov 2026). The full study is docs/editor-style/SOCIA_EDITOR_STYLE.md
// and the thresholds are in docs/editor-style/socia-editor-style.json; this
// file is the slice the model passes read. Honesty rules in analysis.ts still
// win: nothing here licenses an invented fact or an out-of-range timestamp.

import type { ClipForEdl } from "./edl";
import { edlDurationSec, trimToMax } from "./edl";
import type { Edl, EdlSegment, TransitionKind } from "./types";
import { clipLabel } from "./types";

export type HouseGenre =
  | "one_take_skit"
  | "before_after_match"
  | "sports_montage"
  | "food_reel"
  | "food_reel_text_led"
  | "product_ab"
  | "talking_head_reel"
  | "saas_demo";

export const HOUSE_GENRE_IDS: readonly HouseGenre[] = ["one_take_skit", "before_after_match", "sports_montage", "food_reel", "food_reel_text_led", "product_ab", "talking_head_reel", "saas_demo"] as const;
export const isHouseGenre = (v: unknown): v is HouseGenre => HOUSE_GENRE_IDS.includes(v as HouseGenre);

/** Measured pacing per genre: median shot length and cuts per 10 s. */
export const HOUSE_PACING: Record<HouseGenre, { medianShotSec: [number, number]; cutsPer10s: [number, number]; lengthSec: [number, number]; heroHoldSec: [number, number] }> = {
  // From docs/editor-style/VIRAL_REELS_STUDY.md (50 top-liked reels, Nov 2026):
  // the median viral business reel is 11.9 s with 5 shots; one-take skits and
  // matched before/afters out-liked every montage outside sports and detailing.
  one_take_skit: { medianShotSec: [7, 12], cutsPer10s: [0, 1], lengthSec: [7, 12], heroHoldSec: [4, 7] },
  before_after_match: { medianShotSec: [3, 8], cutsPer10s: [1, 2], lengthSec: [8, 16], heroHoldSec: [5, 9] },
  sports_montage: { medianShotSec: [0.75, 0.9], cutsPer10s: [8, 10], lengthSec: [30, 40], heroHoldSec: [3, 5] },
  food_reel: { medianShotSec: [2.0, 2.6], cutsPer10s: [3.4, 3.9], lengthSec: [7, 14], heroHoldSec: [4, 4] },
  food_reel_text_led: { medianShotSec: [1.4, 1.8], cutsPer10s: [5, 5], lengthSec: [10, 32], heroHoldSec: [3, 3] },
  product_ab: { medianShotSec: [1.6, 2.4], cutsPer10s: [2.7, 3.3], lengthSec: [15, 22], heroHoldSec: [8, 8] },
  talking_head_reel: { medianShotSec: [41, 45], cutsPer10s: [0, 0], lengthSec: [40, 45], heroHoldSec: [0, 0] },
  saas_demo: { medianShotSec: [45, 47], cutsPer10s: [0, 0], lengthSec: [45, 125], heroHoldSec: [0, 0] },
};

/**
 * The rules the EDL pass follows, in the order it reads them. Written for
 * what Content Studio can actually render: segments with cut/fade/zoom/whip
 * transitions and text lines. "flash" is a renderable transition; strobe bursts
 * and the NIBA glitch sting are not, so the model is told to put them in notes.
 */
export const HOUSE_STYLE = `# House editing style (measured from the owner's finished reels and from 50 top-liked reels in 10 business niches)
First decide which genre the footage and brief are, then cut to that genre's numbers:
- one_take_skit (one or two people react to a situation, a joke, a POV): 7–12 s, ONE segment, no cuts, locked camera. The first text line states the premise at 0 s as a POV line or a quoted line of dialogue ("POV: a customer is telling their child we have no more juice", "Looks like I should be done by 3pm today!"). Nothing happens for the first 40–60 percent of the runtime, then the payoff; end on the payoff frame, no closing card. The six highest-liked business reels in the study are this shape.
- before_after_match (a transformation: body, car interior, lawn, haircut, a dish appearing): 2–3 segments, 8–16 s. Same framing and camera position for before and after; a short label in the same spot on both ("Before" / "After", "2021:" / "2023:", "315 lbs" / "185 lbs"); one hard cut; hold the after longer than the before. For detailing interiors, alternate dirty and clean of the same surface at 0.6–1.2 s per segment instead.
- sports_montage (gym, court, game footage): 30–40 s. Open on one 1.2–1.6 s shot (a stare-down or a clean make), then accelerate: 0.5–0.9 s per segment through the body, alternating wide shots with close angles. Finish on one slow, satisfying make held 3–5 s. Transitions: "flash" (a hard cut with two white frames) on the biggest hits, "whip" between moving shots, "cut" on the beat. A strobe burst (ten frames alternating two shots) cannot be rendered because a segment is at least 0.8 s; put "strobe here" in notes instead.
- food_reel (dishes, kitchen, restaurant interior): 7–14 s by default (the top-liked food, coffee and restaurant reels are 5–12 s); go to 20–32 s only when the brief asks for a full tour. Hero dish in motion in the first 2 s. Then a strict 2-second beat; the two best shots get 4 s. Order: hero dish, prep or flame, second dish, interior or decor, signature dish. The address or ask goes on the final shot as a text line for the last 2–4 s, never on its own card.
- food_reel_text_led (one named dish per shot): about 32 s, one text line per dish for 1.4–1.8 s each, hold the last three 3 s.
- product_ab (owner comparing two products, rugs, furniture): 15–22 s. Owner's question on camera in the first 2–3 s ("which one would you take?"). Label the options A and B in text. Detail shots 1.6–1.8 s; one side-by-side hold up to 8 s. End on the product, no closing card.
- talking_head_reel (one speaker, one take): 40–45 s. Start on the strongest line, mid-sentence if needed. No jump cuts: one continuous segment, or segments that pick up exactly where the last left off; zoom to punch in. Text: 2–4 words per line that follow the speech, at most three lines.
- saas_demo (screen recordings, product UI): 45 s. Open on the product claim as a text line. "zoom" and "fade" only, no hard cuts. While SOCIA is pre-launch its ask is "comment SOCIA for early access", never a URL.
Rules that hold in every genre:
- A text line at 0 s is mandatory for every business genre except a visual one-take reveal: a POV line, a quoted line, a question ("Can you guess the price?") or a label. Never the brand name, never ad copy. 27 of the 50 top reels open this way.
- Hook inside 3 s: motion, a question, or the strongest spoken line. Never open on a logo or a title.
- Fewer segments win outside sports and car detailing: reels with 1–9 segments out-liked reels with 10 or more by 2.5 to 4 times. When in doubt, cut less and hold longer.
- Transitions are "cut" by default in every genre except sports_montage. Whip and zoom-blur transitions read as an editor's showreel and sit in the bottom third on likes.
- The ask (CTA) goes in the caption, not on screen; 49 of 50 top reels keep it out of the frame. An address or a drop date as a label is fine.
- No closing logo card outside sports; end on the payoff frame.
- One hero segment per post runs 4–8 s; everything else keeps the genre's beat.
- Cut on action: the release, the rim, the noodle pull, the flame, the reveal.
- No segment under 0.3 s. No more than three text lines in a talking-head post.
- Text lines sit in the lower third, 2–4 words, sentence case, the key word first.`;

// ------------------------------------------------------------ enforcement ----
// The prompt above asks the model for these; this pass makes sure SOCIA's cut
// actually has them, the way applyPacing makes sure nothing drags. Every rule
// is a number from the two studies, and every change is reported in one plain
// line for the cut's notes. Only SOCIA's cuts go through here; a person's own
// edit (revalidateEdl) is never rewritten.


const r2 = (n: number) => Math.round(n * 100) / 100;

/** Transitions a genre may keep; everything else becomes a hard cut (viral-reels study, pattern 7). */
export const HOUSE_TRANSITIONS: Record<HouseGenre, readonly TransitionKind[]> = {
  one_take_skit: ["cut"],
  before_after_match: ["cut"],
  sports_montage: ["cut", "flash", "whip", "zoom", "fade"],
  food_reel: ["cut", "fade"],
  food_reel_text_led: ["cut", "fade"],
  product_ab: ["cut", "fade"],
  talking_head_reel: ["cut", "zoom"],
  saas_demo: ["zoom", "fade"],
};

/** Genres whose ask belongs in the caption, never on screen (49 of 50 top reels). */
const CTA_IN_CAPTION: ReadonlySet<HouseGenre> = new Set<HouseGenre>(["one_take_skit", "before_after_match", "sports_montage", "food_reel", "food_reel_text_led", "product_ab", "talking_head_reel"]);

/** Genres that open on a text line (a POV, a quote, a question or a label) at 0 s. */
const OPENING_LINE: ReadonlySet<HouseGenre> = new Set<HouseGenre>(["before_after_match", "food_reel", "food_reel_text_led", "product_ab", "talking_head_reel", "saas_demo"]);

export type HouseChange = { rule: "length" | "transition" | "cta" | "opening" | "one_take" | "before_after"; what: string };

/**
 * SOCIA's cut, held to its genre. Idempotent and pure: a cut that already
 * follows the rules comes back unchanged with no changes listed. A cut with no
 * genre is returned as is.
 */
export function applyHouseStyle(edl: Edl, clips: ClipForEdl[]): { edl: Edl; changes: HouseChange[] } {
  const genre = edl.genre;
  if (!genre || !isHouseGenre(genre)) return { edl, changes: [] };
  const byId = new Map(clips.map((c) => [c.id, c]));
  const label = (s: EdlSegment) => clipLabel(byId.get(s.clipId)?.position ?? 0);
  const changes: HouseChange[] = [];
  let segments: EdlSegment[] = edl.segments.map((s) => ({ ...s }));
  let text = edl.text.map((t) => ({ ...t }));
  let cta = edl.cta;
  let targetSec = { ...edl.targetSec };
  const notes = [...edl.notes];

  // 1. One take: when every segment is the same clip, back to back, it is one shot.
  if (genre === "one_take_skit" && segments.length > 1) {
    const same = segments.every((s) => s.clipId === segments[0].clipId);
    const contiguous = segments.every((s, i) => i === 0 || Math.abs(s.in - segments[i - 1].out) <= 0.05);
    if (same && contiguous) {
      const first = segments[0], last = segments[segments.length - 1];
      segments = [{ ...first, out: last.out, role: "opener" }];
      changes.push({ rule: "one_take", what: `${label(first)} runs as one shot, ${first.in.toFixed(1)}–${last.out.toFixed(1)}s, instead of ${edl.segments.length} cuts: a skit works because nothing was cut.` });
    } else {
      notes.push(`A one-take skit is one locked shot; this cut has ${segments.length}. If one clip holds the whole moment, use it alone.`);
    }
  }

  // 2. Transitions the genre doesn't use become hard cuts.
  const allowed = HOUSE_TRANSITIONS[genre];
  segments.forEach((s, i) => {
    if (!i || !s.transition || allowed.includes(s.transition)) return;
    const { transition, ...rest } = s;
    segments[i] = rest;
    changes.push({ rule: "transition", what: `${label(s)} comes in on a hard cut instead of a ${transition}: the top-liked ${genre.replace(/_/g, " ")} reels use plain cuts.` });
  });

  // 3. Before/after: the after is held at least as long as the before, when the clip has room.
  if (genre === "before_after_match" && segments.length >= 2) {
    const before = segments[0], after = segments[segments.length - 1];
    const beforeLen = before.out - before.in, afterLen = after.out - after.in;
    const clip = byId.get(after.clipId);
    if (clip && afterLen < beforeLen - 0.05) {
      const out = r2(Math.min(clip.durationSec, after.in + Math.min(beforeLen, HOUSE_PACING.before_after_match.heroHoldSec[1])));
      if (out > after.out + 0.05) {
        segments[segments.length - 1] = { ...after, out };
        changes.push({ rule: "before_after", what: `${label(after)} (the after) holds ${(out - after.in).toFixed(1)}s, no shorter than the before: the reveal is what people stay for.` });
      }
    }
  }

  // 4. Length: the genre's band caps the target unless the person's brief set one.
  const band = HOUSE_PACING[genre].lengthSec;
  if (!edl.brief && targetSec.max > band[1]) {
    targetSec = { min: Math.min(targetSec.min, band[0]), max: band[1] };
    const before = edlDurationSec({ segments });
    if (before > band[1]) {
      const after = trimToMax(segments, byId, band[1]);
      changes.push({ rule: "length", what: `Trimmed from ${before.toFixed(1)}s to ${after.toFixed(1)}s: top-liked ${genre.replace(/_/g, " ")} reels run ${band[0]}–${band[1]}s.` });
    }
  }

  // 5. The ask moves into the caption; an address or a date can stay as a label.
  if (CTA_IN_CAPTION.has(genre)) {
    const onScreen = text.filter((t) => t.role === "cta" && !/\d/.test(t.text));
    if (onScreen.length) {
      text = text.filter((t) => !onScreen.includes(t));
      if (!cta) cta = onScreen[0].text;
      changes.push({ rule: "cta", what: `“${onScreen[0].text}” moved off screen into the caption: 49 of 50 top-liked reels keep the ask in the post text.` });
    }
  }

  // 6. An opening line is there from 0 s. Nothing is invented: a missing one is a note.
  if (OPENING_LINE.has(genre)) {
    const opening = text.find((t) => t.role === "opening") ?? text.find((t) => t.at < 1);
    if (opening && opening.at > 0) {
      const i = text.indexOf(opening);
      text[i] = { ...opening, at: 0, end: Math.max(opening.end, 1) };
      changes.push({ rule: "opening", what: `“${opening.text}” is on screen from the first frame: 27 of 50 top-liked reels open on their line.` });
    } else if (!opening) {
      notes.push("Add an opening line at 0 s: a POV, a quoted line, a question or a label, not the brand name. The top-liked reels say why you're watching inside the first second.");
    }
  }

  const changed = changes.length > 0 || notes.length !== edl.notes.length;
  return { edl: changed ? { ...edl, segments, text, cta, targetSec, notes } : edl, changes };
}

/** The genre list as the batch pass needs it: name + one-line test. */
export const HOUSE_GENRES = `Genres (pick one per post, by what the footage shows): one_take_skit (one locked shot, a situation or joke, a POV or quoted line as the opener), before_after_match (a transformation shown from the same framing), sports_montage (court or game footage), food_reel (dishes, kitchen, restaurant), food_reel_text_led (one named dish per shot), product_ab (owner comparing two products), talking_head_reel (one speaker, one take), saas_demo (screen recordings or product UI).`;
