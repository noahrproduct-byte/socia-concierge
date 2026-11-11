// Whether animated videos (comparisons or words on screen, built in code) suit an account:
// the evidence SOCIA shows the model and the check on its answer. Pure and
// client-safe; lib/animated/fit.ts runs the scan.
import type { IgMediaItem } from "@/lib/instagramSync";
import { inventsNumbers, numberTokens } from "./spec";

export type AnimatedVerdict = "suits" | "test" | "unlikely";

export type AnimatedFit = {
  verdict: AnimatedVerdict;
  /** Two or three sentences, each pointing at something SOCIA actually saw. */
  reasons: string[];
  checkedAt: string;
  /** How many of the account's own posts the scan read. */
  postsRead: number;
};

/** The brand's choice, and the last scan, saved in brand_detail.animated. */
export type AnimatedPref = { on?: boolean; fit?: AnimatedFit };

export const VERDICT_LABEL: Record<AnimatedVerdict, string> = {
  suits: "Suits this account",
  test: "Worth testing",
  unlikely: "Probably not a fit",
};

const KIND: Record<string, string> = { REELS: "Reels", FEED: "photos", CAROUSEL_ALBUM: "carousels", IMAGE: "photos", VIDEO: "videos" };
const kindOf = (m: IgMediaItem): string => KIND[m.media_product_type === "REELS" ? "REELS" : (m.media_type ?? "")] ?? "posts";
const eng = (m: IgMediaItem) => (m.like_count ?? 0) + (m.comments_count ?? 0);

/** The account's own posts as plain lines: how each format did on average, and the best few with their first line. */
export function postsEvidence(media: IgMediaItem[]): { text: string; read: number } {
  const own = media.filter((m) => !m.collab_owner);
  if (!own.length) return { text: "No posts of its own were read yet.", read: 0 };
  const byKind = new Map<string, number[]>();
  for (const m of own) byKind.set(kindOf(m), [...(byKind.get(kindOf(m)) ?? []), eng(m)]);
  const lines = [...byKind.entries()].map(([k, v]) => `${v.length} ${k}, on average ${Math.round(v.reduce((a, b) => a + b, 0) / v.length)} likes and comments each`);
  const best = [...own].sort((a, b) => eng(b) - eng(a)).slice(0, 5).map((m) => {
    const first = (m.caption ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 100);
    return `- ${kindOf(m).replace(/s$/, "")}, ${eng(m)} likes and comments${first ? `: "${first}"` : ""}`;
  });
  return { text: [`Its last ${own.length} posts: ${lines.join("; ")}.`, "Its best posts:", ...best].join("\n"), read: own.length };
}

/** The model's answer, made safe: a known verdict, 1 to 3 short reasons, none using a number the evidence doesn't have. null when unusable. */
export function cleanFit(raw: unknown, evidence: string, postsRead: number, now = new Date()): AnimatedFit | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const verdict = r.verdict === "suits" || r.verdict === "test" || r.verdict === "unlikely" ? r.verdict : null;
  if (!verdict) return null;
  const source = numberTokens(evidence);
  const reasons = (Array.isArray(r.reasons) ? r.reasons : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, 240))
    .filter((x) => x && !inventsNumbers(x, source))
    .slice(0, 3);
  if (!reasons.length) return null;
  return { verdict, reasons, checkedAt: now.toISOString(), postsRead };
}
