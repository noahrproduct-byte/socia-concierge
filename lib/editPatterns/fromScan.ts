// Editing patterns from a niche scan (lib/nicheScan): the Reels SOCIA studied
// in this niche, grouped by format, keeping only the ones that did better than
// their own account's usual, and only a format that repeats across at least two
// accounts (the playbook's rule, PATTERN_MIN_*). Its numbers come from the
// Reels whose video SOCIA could read and measure (lib/nicheScan/editing.ts);
// the hooks, on-screen lines and asks are the real words the scan read. A
// format the scan only saw doing worse than usual is not a pattern. Pure.
import { CTA_LABEL, FORMAT_LABEL, PATTERN_MIN_ACCOUNTS, PATTERN_MIN_REELS, type ReelFormat, type WatchedReel } from "@/lib/nicheScan/playbook";
import type { Confidence, EditPattern, PatternEvidence } from "./types";

/** Did better than the account's usual: the scan's own "took off", or at least this many times its median. */
const ABOVE_USUAL = 1.3;
const SCAN_LIMITS = [
  "Measured from the first 30 s of each video through Instagram's official data; dissolves and whips count as cuts, and a fast camera move can read as one.",
  "Only Reels SOCIA could reach: tracked competitors and the niche accounts it found.",
];

const r1 = (n: number) => Math.round(n * 10) / 10;
const accountKey = (r: { platform: string; handle: string | null; account: string }) => `${r.platform}:${(r.handle ?? r.account).toLowerCase()}`;
function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
/** The middle half of the values, as a range; null when there are none. */
function middle(xs: number[]): [number, number] | null {
  const lo = quantile(xs, 0.25), hi = quantile(xs, 0.75);
  return lo == null || hi == null ? null : [r1(lo), r1(hi)];
}
const top = <T,>(xs: T[], n: number) => Array.from(new Set(xs)).slice(0, n);

const technique = (f: ReelFormat) => FORMAT_LABEL[f].charAt(0).toUpperCase() + FORMAT_LABEL[f].slice(1);

function confidenceOf(reels: number, accounts: number, measured: number): Confidence {
  if (reels >= 5 && accounts >= 3 && measured >= 4) return "high";
  if (reels >= 3 && measured >= 2) return "medium";
  return "low";
}

function evidenceOf(r: WatchedReel): PatternEvidence {
  return {
    url: r.url, account: r.handle ? `@${r.handle.replace(/^@/, "")}` : r.account, platform: r.platform,
    multiplier: r.multiplier, views: r.views, likes: r.likes, basis: r.basis,
    editing: r.editing ? { durationSec: r.editing.durationSec, cutsPer10s: r.editing.cutsPer10s, medianShotSec: r.editing.medianShotSec, firstCutSec: r.editing.firstCutSec } : null,
  };
}

/** The niche's editing patterns from one scan's watched Reels. */
export function scanPatterns(watched: WatchedReel[], niche: string | null, now: Date = new Date()): EditPattern[] {
  const good = watched.filter((r) => !r.weak && (r.proven || (r.multiplier ?? 0) >= ABOVE_USUAL));
  const byFormat = new Map<ReelFormat, WatchedReel[]>();
  for (const r of good) if (r.format !== "other") byFormat.set(r.format, [...(byFormat.get(r.format) ?? []), r]);
  const out: EditPattern[] = [];
  for (const [format, reels] of byFormat) {
    const accounts = new Set(reels.map(accountKey)).size;
    if (reels.length < PATTERN_MIN_REELS || accounts < PATTERN_MIN_ACCOUNTS) continue;
    const measured = reels.filter((r) => r.editing);
    const ed = measured.map((r) => r.editing!);
    const lengths = ed.map((e) => e.durationSec).filter((d): d is number => d != null);
    const firsts = ed.map((e) => e.firstCutSec).filter((d): d is number => d != null);
    const mults = reels.map((r) => r.multiplier).filter((m): m is number => m != null);
    // What the scan saw doing worse than usual in the same format, for contrast.
    const weak = watched.filter((r) => r.weak && r.format === format && r.editing);
    const weakNote = weak.length >= 2 && ed.length >= 2
      ? `Versions that did worse than usual cut ${r1(quantile(weak.map((w) => w.editing!.cutsPer10s), 0.5) ?? 0)} times per 10 s, against ${r1(quantile(ed.map((e) => e.cutsPer10s), 0.5) ?? 0)} for the ones that did better.`
      : null;
    const ctas = reels.map((r) => r.cta.kind).filter((k) => k !== "none").map((k) => CTA_LABEL[k]);
    out.push({
      key: `scan:${format}`,
      source: "scan",
      niche,
      category: format,
      platform: "instagram",
      technique: technique(format),
      summary: `${reels.length} Reels from ${accounts} accounts in this niche did better than their usual with ${FORMAT_LABEL[format]}${ed.length ? `, cut about ${r1(quantile(ed.map((e) => e.cutsPer10s), 0.5) ?? 0)} times per 10 s` : ""}.`,
      characteristics: {
        lengthSec: middle(lengths),
        medianShotSec: middle(ed.map((e) => e.medianShotSec)),
        cutsPer10s: middle(ed.map((e) => e.cutsPer10s)),
        firstCutSec: middle(firsts),
        hooks: top(reels.map((r) => r.hook).filter((h): h is string => Boolean(h)), 3),
        onScreenText: top(reels.map((r) => r.onScreenText).filter((h): h is string => Boolean(h)), 3),
        textShare: r1(reels.filter((r) => r.onScreenText).length / reels.length),
        ctas: top(ctas, 3),
        notes: weakNote ? [weakNote] : [],
      },
      appliesTo: [format, ...(niche ? niche.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2) : [])],
      evidence: [...reels].sort((a, b) => (b.multiplier ?? -1) - (a.multiplier ?? -1)).slice(0, 6).map(evidenceOf),
      observed: { reels: reels.length, accounts, measured: measured.length, medianMultiplier: mults.length ? r1(quantile(mults, 0.5)!) : null },
      confidence: confidenceOf(reels.length, accounts, measured.length),
      limitations: measured.length ? SCAN_LIMITS : ["None of these Reels' videos could be read, so its rhythm isn't measured; only the words and the format are.", SCAN_LIMITS[1]],
      verifiedAt: now.toISOString(),
    });
  }
  return out.sort((a, b) => b.observed.reels - a.observed.reels);
}
