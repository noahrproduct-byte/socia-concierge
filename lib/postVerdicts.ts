// How one post did, read from the totals the platform returns for it and
// measured against the account's own other posts. Instagram does not share
// second-by-second watch data, so nothing here claims where in the video
// people left: each line names the total it comes from.
import type { PostCard } from "@/lib/overview";

export type VerdictTone = "good" | "ok" | "bad" | "none";
export type Verdict = { id: "reach" | "reaction" | "spread" | "ask"; label: string; tone: VerdictTone; share: number; line: string };
export type Standout = { word: string; tone: "good" | "bad" };

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const seenBy = (p: PostCard): number | null => {
  const n = p.reach ?? p.views;
  return n != null && n > 0 ? n : null;
};
const rate = (p: PostCard, top: number | null): number | null => {
  const n = seenBy(p);
  return n != null && top != null ? top / n : null;
};
const passedOn = (p: PostCard): number | null => (p.saves == null && p.shares == null ? null : (p.saves ?? 0) + (p.shares ?? 0));
const toneOf = (ratio: number): VerdictTone => (ratio >= 1.3 ? "good" : ratio < 0.7 ? "bad" : "ok");
const times = (ratio: number) => `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}x`;

/** Words in a caption that ask the viewer to do something. */
const ASK = /\?|\b(comment|reply|follow|share|save|tag|dm|message|link in bio|click|sign up|book|order|visit|subscribe|tell me|let me know)\b/i;
export const captionAsks = (caption: string): boolean => ASK.test(caption);

/** The one word a post earns on its card, or null when it did about as usual. */
export function standout(p: PostCard): Standout | null {
  if (p.multiplier == null) return null;
  if (p.multiplier >= 2) return { word: "Breakout", tone: "good" };
  if (p.multiplier >= 1.3) return { word: "Above usual", tone: "good" };
  if (p.multiplier < 0.6) return { word: "Below usual", tone: "bad" };
  return null;
}

function against(id: Verdict["id"], label: string, mine: number | null, others: number[], what: string, needs: string): Verdict {
  const usual = median(others);
  if (mine == null) return { id, label, tone: "none", share: 0, line: needs };
  if (usual == null || usual <= 0 || others.length < 3) return { id, label, tone: "none", share: 0, line: "Needs three other posts to compare against." };
  const ratio = mine / usual;
  return { id, label, tone: toneOf(ratio), share: Math.min(1, ratio / 2), line: `${times(ratio)} your usual ${what}` };
}

/** Four readings of one post against the account's other posts. */
export function postVerdicts(p: PostCard, posts: PostCard[]): Verdict[] {
  const rest = posts.filter((o) => o.id !== p.id);
  const nums = (f: (o: PostCard) => number | null) => rest.map(f).filter((v): v is number => v != null);
  const reach = against("reach", "Reach", p.views ?? p.reach, nums((o) => o.views ?? o.reach), "views", "The platform returned no views for this post.");
  const reaction = against("reaction", "Reaction", rate(p, p.engagements), nums((o) => rate(o, o.engagements)), "likes, comments, saves and shares per viewer", "Needs views to work out.");
  const spread = against("spread", "Shares and saves", rate(p, passedOn(p)), nums((o) => rate(o, passedOn(o))), "shares and saves per viewer", "The platform returned no shares or saves for this post.");
  const comments = against("ask", "Call to action", rate(p, p.comments), nums((o) => rate(o, o.comments)), "comments per viewer", "The platform returned no comments count for this post.");
  const asks = captionAsks(p.caption);
  const ask: Verdict = asks
    ? { ...comments, line: comments.tone === "none" ? `The caption asks for something. ${comments.line}` : `The caption asks for something: ${comments.line}` }
    : comments.tone === "good"
      ? { ...comments, line: `No ask in the caption, and still ${comments.line}` }
      : { ...comments, tone: comments.tone === "none" ? "none" : "bad", line: "No ask in the caption. Tell people what to do next." };
  return [reach, reaction, spread, ask];
}
