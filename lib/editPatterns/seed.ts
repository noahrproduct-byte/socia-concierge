// The patterns SOCIA starts with, from its two editing studies (Nov 2026):
// the owner's 17 finished exports measured with ffmpeg scene detection
// (docs/editor-style/socia-editor-style.json) and 50 top-liked business Reels
// across 10 niches read by hand (docs/editor-style/VIRAL_REELS_STUDY.md,
// viral-reels.json). One pattern per house genre (lib/studioClips/houseStyle.ts),
// with the measured numbers and the real study Reels from the niches it suits
// as evidence. The study ranked Reels by likes, not by each creator's usual, so
// these patterns say so and stay at medium confidence; the niche scan's
// measured patterns (fromScan.ts) and the account's own results come first.
import viral from "@/docs/editor-style/viral-reels.json";
import { HOUSE_PACING, type HouseGenre } from "@/lib/studioClips/houseStyle";
import type { EditPattern, PatternEvidence } from "./types";

type ViralRow = { niche: string; likes: number; user: string; url: string };

const STUDY_VERIFIED = "2026-11-10T00:00:00.000Z";
const STUDY_LIMITS = [
  "Ranked by likes in a hand study, not against each creator's own usual.",
  "Pacing measured on the owner's own finished exports; the study Reels were watched, not measured frame by frame.",
];

/** What each genre is, in words, and the study niches whose Reels are its evidence. */
const META: Record<HouseGenre, { technique: string; summary: string; appliesTo: string[]; niches: string[]; joins: string; notes: string[] }> = {
  one_take_skit: {
    technique: "One continuous take with a premise line",
    summary: "One locked shot, the premise as a POV or quoted line at 0 s, nothing for the first half, then the payoff. The highest-liked business Reels in the study were this shape.",
    appliesTo: ["any", "restaurant", "cafe", "retail", "service", "comedy", "pov"], niches: ["food", "coffee", "clothing", "homeservices"], joins: "none: one shot",
    notes: ["End on the payoff frame, no closing card.", "The ask goes in the caption."],
  },
  before_after_match: {
    technique: "Matched before and after",
    summary: "Same framing before and after, a short label in the same spot on both, one hard cut, the after held longer.",
    appliesTo: ["fitness", "transformation", "cars", "detailing", "barber", "medspa", "home services", "cleaning", "renovation", "beauty"], niches: ["fitness", "cars", "barber", "medspa", "homeservices"], joins: "one hard cut",
    notes: ["Hold the after longer than the before."],
  },
  sports_montage: {
    technique: "Accelerating sports montage",
    summary: "Open on one clean shot, then accelerate to under a second a shot, and finish on one slow make held 3 to 5 s.",
    appliesTo: ["sports", "gym", "fitness", "basketball", "training", "events"], niches: ["sports"], joins: "cuts on the beat, white flash frames on the biggest hits",
    notes: ["Wide shots alternate with close angles."],
  },
  food_reel: {
    technique: "Hero dish first, a steady 2-second beat",
    summary: "The hero dish in motion in the first 2 s, then a strict 2-second beat with the two best shots held about 4 s; the address or ask as a line on the last shot.",
    appliesTo: ["food", "restaurant", "cafe", "coffee", "bakery", "pizza", "bar", "kitchen"], niches: ["food", "coffee"], joins: "hard cuts, a soft fade at most",
    notes: ["The top-liked food, coffee and restaurant Reels were 5 to 12 s."],
  },
  food_reel_text_led: {
    technique: "One named dish per shot",
    summary: "One dish per shot with its name as a line for 1.4 to 1.8 s each, the last three held 3 s.",
    appliesTo: ["restaurant", "menu", "food", "bakery", "cafe"], niches: ["food"], joins: "hard cuts",
    notes: [],
  },
  product_ab: {
    technique: "Owner's A or B question",
    summary: "The owner asks which one viewers would take in the first 2 to 3 s, the options labelled A and B, quick detail shots, one side-by-side hold.",
    appliesTo: ["retail", "clothing", "furniture", "rugs", "products", "shop", "ecommerce", "jewellery"], niches: ["clothing", "realestate"], joins: "hard cuts",
    notes: ["End on the product, no closing card."],
  },
  talking_head_reel: {
    technique: "One speaker, starting on the strongest line",
    summary: "One continuous take or pick-ups that join seamlessly, starting on the strongest line, punch-ins instead of jump cuts, 2 to 4 words of text following the speech.",
    appliesTo: ["coaching", "saas", "software", "agency", "education", "personal brand", "pitch", "explainer", "any"], niches: [], joins: "no jump cuts; zoom punch-ins",
    notes: ["At most three text lines."],
  },
  saas_demo: {
    technique: "Product claim, then the screen",
    summary: "The product claim as a line at 0 s, then screen recordings joined by zooms and fades, no hard cuts.",
    appliesTo: ["saas", "software", "app", "tech", "product demo", "startup"], niches: [], joins: "zooms and fades, no hard cuts",
    notes: [],
  },
  two_act_story: {
    technique: "Two acts: making, then enjoying",
    summary: "Act one the making (flames, hands at work held longest), act two the enjoying (plates, the room), one 3-word chapter line per act, no captions.",
    appliesTo: ["restaurant", "workshop", "kitchen", "bar", "maker", "craft"], niches: ["food", "coffee"], joins: "cuts, with one light leak at the act change",
    notes: ["Measured on the owner's Osh Reel: 21 s, 9 shots, median 2.2 s."],
  },
};

const rows = viral as ViralRow[];

function evidenceFor(niches: string[]): PatternEvidence[] {
  return rows
    .filter((r) => niches.includes(r.niche) && typeof r.url === "string")
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 5)
    .map((r) => ({ url: r.url, account: r.user, platform: "instagram", multiplier: null, views: null, likes: r.likes, basis: "likes (top-liked in its niche when studied)" }));
}

/** The study patterns, one per house genre. */
export function studyPatterns(): EditPattern[] {
  return (Object.keys(HOUSE_PACING) as HouseGenre[]).map((genre) => {
    const p = HOUSE_PACING[genre];
    const m = META[genre];
    const evidence = evidenceFor(m.niches);
    return {
      key: `study:${genre}`,
      source: "study",
      niche: null,
      category: genre,
      platform: "instagram",
      technique: m.technique,
      summary: m.summary,
      characteristics: {
        lengthSec: p.lengthSec,
        medianShotSec: p.medianShotSec,
        cutsPer10s: p.cutsPer10s,
        heroHoldSec: p.heroHoldSec[1] > 0 ? p.heroHoldSec : null,
        joins: m.joins,
        notes: m.notes,
      },
      appliesTo: m.appliesTo,
      evidence,
      observed: { reels: evidence.length, accounts: new Set(evidence.map((e) => e.account)).size, measured: 0, medianMultiplier: null },
      confidence: "medium",
      limitations: STUDY_LIMITS,
      verifiedAt: STUDY_VERIFIED,
    };
  });
}
