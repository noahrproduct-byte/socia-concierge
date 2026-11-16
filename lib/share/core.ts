// A result worth sharing: a post published through SOCIA that did clearly
// better than the account's own usual post, once its numbers have settled
// (lib/postResults.ts). The shareable image says exactly that and nothing
// more: the multiple, what it is a multiple of, and when. No raw counts are
// invented and nothing is predicted. Pure and browser-safe.
import { fmtMultiplier } from "@/lib/multiplier";

/** A post is a win at this multiple of the account's median or more: the same line the Calendar draws as "up". */
export const WIN_AT = 1.2;
/** How many recent wins are offered. */
export const WINS_SHOWN = 3;

export type WinInput = { postId: string; caption: string | null; publishedAt: string | null; platform: string; metric: "interactions" | "views"; multiplier: number | null; measured: boolean; early: boolean };
export type Win = { postId: string; title: string; publishedAt: string | null; platform: string; metric: "interactions" | "views"; multiplier: number; multiple: string };

const PLATFORM: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
export const platformName = (p: string): string => PLATFORM[p] ?? "social";

/** The post's first line, without hashtags, short enough for a card. */
export function winTitle(caption: string | null | undefined, max = 70): string {
  const first = (caption ?? "").split(/\n/).map((l) => l.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  if (first.length <= max) return first;
  const cut = first.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trimEnd()}…`;
}

/** Whether one result is a win: found, settled, compared with a real median, and clearly above it. */
export const isWin = (r: Pick<WinInput, "multiplier" | "measured" | "early">): boolean => r.measured && !r.early && r.multiplier != null && r.multiplier >= WIN_AT;

/** The wins among these results, best first. */
export function winsFrom(results: WinInput[], limit = WINS_SHOWN): Win[] {
  return results
    .filter(isWin)
    .sort((a, b) => (b.multiplier as number) - (a.multiplier as number))
    .slice(0, limit)
    .map((r) => ({ postId: r.postId, title: winTitle(r.caption), publishedAt: r.publishedAt, platform: r.platform, metric: r.metric, multiplier: r.multiplier as number, multiple: fmtMultiplier(r.multiplier as number) }));
}

/** The sentence on the image, in the person's own voice. */
export function winSentence(w: Pick<Win, "multiple" | "metric" | "platform" | "publishedAt">): string {
  const when = w.publishedAt ? ` on ${new Date(w.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}` : "";
  return `A post I published${when} got ${w.multiple.replace("×", "")} times my usual ${w.metric} on ${platformName(w.platform)}.`;
}
