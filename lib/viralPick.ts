// Which of Discover's Reels the Dashboard shows (app/api/dashboard/viral):
// only Reels that took off by their own published numbers (lib/trendSignals.ts
// isProven: a multiple of the account's usual, or past the views bar), the
// competitors' first, then the niche's, at most four, one per account. A Reel
// listed on Discover only to fill the section (proven: false) never shows here,
// so nothing is called viral without its numbers. Pure.
import type { DiscoverData } from "@/components/discover/types";
import type { ProvenReel } from "@/lib/trendSignals";

export const VIRAL_SHOWN = 4;

export type ViralReel = ProvenReel & { from: "competitor" | "niche" };

export type ViralPick = {
  /** The plan includes niche Reels (Discover's own gate). */
  access: boolean;
  upgrade: string | null;
  reels: ViralReel[];
  /** When SOCIA last researched the niche, if ever. */
  readAt: string | null;
  niche: string | null;
  now: string;
};

export function pickViral(d: Pick<DiscoverData, "nicheAccess" | "nicheUpgrade" | "reelsToCopy" | "nicheReels" | "lastRun" | "niche" | "now">, max = VIRAL_SHOWN): ViralPick {
  const base = { access: d.nicheAccess, upgrade: d.nicheUpgrade, readAt: d.lastRun, niche: d.niche, now: d.now };
  if (!d.nicheAccess) return { ...base, reels: [] };
  const seen = new Set<string>();
  const reels: ViralReel[] = [];
  const add = (list: ProvenReel[], from: ViralReel["from"]) => {
    for (const r of list) {
      if (reels.length >= max) return;
      const who = (r.accountHandle ?? r.accountName).toLowerCase();
      if (!r.proven || seen.has(who) || reels.some((x) => x.url === r.url)) continue;
      seen.add(who);
      reels.push({ ...r, from });
    }
  };
  add(d.reelsToCopy, "competitor");
  add(d.nicheReels, "niche");
  return { ...base, reels };
}
