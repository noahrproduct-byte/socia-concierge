// What the sound of past posts says about what to do next — computed from
// rows SOCIA measured or could not measure, never from a model. Two sources
// of truth: Instagram omits a video's file when it carries licensed or
// library music (documented), so "file hidden" = "used library music"; and
// for the files we could fetch, the measured features. Results are compared
// with each account's OWN median, never across accounts.
import { median } from "@/lib/metrics";
import { musicScoreFrom, MUSIC_LIKELY_AT, type AudioFeatures } from "./features";

/** Re-judged from the stored raw numbers, so measurements taken under an older rule stay correct. */
const musicLikely = (f: AudioFeatures): boolean => musicScoreFrom(f) >= MUSIC_LIKELY_AT;

export type AudioSource = "own" | "competitor";

export type AudioMediaRow = {
  source: AudioSource;
  accountKey: string;
  accountLabel: string;
  mediaId: string;
  permalink: string | null;
  postedAt: string | null;
  /** false = Instagram hid the file → library/licensed music */
  hasMediaUrl: boolean;
  interactions: number | null;
  views: number | null;
  features: AudioFeatures | null;
  error: string | null;
};

/** Posts needed before an account's median is a baseline (same rule as results). */
export const MIN_SAMPLE = 5;
export const MIN_SPLIT = 3;

export type Split = { n: number; medianMultiplier: number | null };

export type AccountAudio = {
  source: AudioSource;
  accountKey: string;
  accountLabel: string;
  posts: number;
  baseline: boolean;
  library: Split;
  original: Split;
  /** measured profile of the best-performing posts whose files were available */
  profile: {
    basedOn: number;
    bpmRange: [number, number] | null;
    energy: "low" | "medium" | "high" | null;
    musicShare: number | null;
    audibleShare: number | null;
  } | null;
  /** files with a URL still waiting to be measured */
  pending: number;
};

export type AudioInsights = {
  accounts: AccountAudio[];
  own: AccountAudio | null;
  recommendation: string;
  /** one-line evidence under the recommendation */
  evidence: string[];
  coverage: { total: number; library: number; measured: number; pending: number; failed: number };
  generatedAt: string;
};

const fmtX = (m: number): string => `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}×`;

function energyLevel(dbs: number[]): "low" | "medium" | "high" | null {
  const m = median(dbs);
  if (m == null) return null;
  return m < -28 ? "low" : m > -16 ? "high" : "medium";
}

export function accountAudio(rows: AudioMediaRow[]): AccountAudio {
  const first = rows[0];
  const withPerf = rows.filter((r) => r.interactions != null);
  const base = withPerf.length >= MIN_SAMPLE ? median(withPerf.map((r) => r.interactions as number)) : null;
  const baseline = base != null && base > 0;
  const mult = (r: AudioMediaRow): number | null => (baseline && r.interactions != null ? r.interactions / (base as number) : null);
  const split = (xs: AudioMediaRow[]): Split => {
    const ms = xs.map(mult).filter((x): x is number => x != null);
    return { n: xs.length, medianMultiplier: xs.length >= MIN_SPLIT && ms.length >= MIN_SPLIT ? median(ms) : null };
  };
  const library = rows.filter((r) => !r.hasMediaUrl);
  const original = rows.filter((r) => r.hasMediaUrl);
  const measured = original.filter((r) => r.features);
  const ranked = [...measured].sort((a, b) => (mult(b) ?? -1) - (mult(a) ?? -1)).slice(0, 5);
  const bpms = ranked.map((r) => r.features!.bpm).filter((b): b is number => b != null);
  const profile = ranked.length
    ? {
        basedOn: ranked.length,
        bpmRange: bpms.length >= 2 ? ([Math.min(...bpms), Math.max(...bpms)] as [number, number]) : null,
        energy: energyLevel(ranked.map((r) => r.features!.energyDb).filter((x): x is number => x != null)),
        musicShare: ranked.length ? ranked.filter((r) => musicLikely(r.features!)).length / ranked.length : null,
        audibleShare: ranked.length ? median(ranked.map((r) => r.features!.audibleRatio)) : null,
      }
    : null;
  return {
    source: first.source, accountKey: first.accountKey, accountLabel: first.accountLabel,
    posts: rows.length, baseline,
    library: split(library), original: split(original),
    profile,
    pending: original.filter((r) => !r.features && !r.error).length,
  };
}

const share = (x: number | null): string => (x == null ? "" : `${Math.round(x * 100)}%`);

export function buildInsights(rows: AudioMediaRow[], now: Date = new Date()): AudioInsights {
  const groups = new Map<string, AudioMediaRow[]>();
  for (const r of rows) groups.set(`${r.source}:${r.accountKey}`, [...(groups.get(`${r.source}:${r.accountKey}`) ?? []), r]);
  const accounts = Array.from(groups.values()).map(accountAudio);
  const own = accounts.find((a) => a.source === "own") ?? null;
  const competitors = accounts.filter((a) => a.source === "competitor");

  const evidence: string[] = [];
  let recommendation: string;

  if (!own || own.posts < MIN_SAMPLE) {
    recommendation = own
      ? `Not enough posts to say yet: SOCIA has ${own.posts} of the ${MIN_SAMPLE} it needs with results.`
      : "Connect Instagram and sync your posts to measure what sound has worked for you.";
  } else if (!own.baseline) {
    recommendation = `Your posts don't have engagement numbers yet, so sound can't be compared with your median.`;
  } else {
    const lib = own.library, org = own.original;
    if (lib.medianMultiplier != null && org.medianMultiplier != null) {
      evidence.push(`Library music: ${lib.n} posts at ${fmtX(lib.medianMultiplier)} your median · original audio: ${org.n} posts at ${fmtX(org.medianMultiplier)}.`);
      if (lib.medianMultiplier >= org.medianMultiplier * 1.15) {
        recommendation = `Posts with music from Instagram's library have done ${fmtX(lib.medianMultiplier)} your median against ${fmtX(org.medianMultiplier)} without. Add a library track when you post this${bpmClause(own)}.`;
      } else if (org.medianMultiplier >= lib.medianMultiplier * 1.15) {
        recommendation = `Your original audio has done ${fmtX(org.medianMultiplier)} your median against ${fmtX(lib.medianMultiplier)} with library music. Keep the real sound${own.profile?.musicShare != null && own.profile.musicShare < 0.5 ? " and the voice on top" : ""}; if you add music, keep it low.`;
      } else {
        recommendation = `Library music and original audio have performed about the same for you (${fmtX(lib.medianMultiplier)} vs ${fmtX(org.medianMultiplier)}). Choose by the content${bpmClause(own)}.`;
      }
    } else if (lib.n >= MIN_SPLIT && lib.medianMultiplier != null) {
      evidence.push(`${lib.n} of your ${own.posts} posts used library music (Instagram hides those files), at ${fmtX(lib.medianMultiplier)} your median.`);
      recommendation = `Most of your posts use library music, at ${fmtX(lib.medianMultiplier)} your median. ${own.original.n ? `Too few original-audio posts (${own.original.n}) to compare yet.` : "Try one with the real sound to compare."}`;
    } else if (org.n >= MIN_SPLIT && org.medianMultiplier != null) {
      evidence.push(`${org.n} of your ${own.posts} posts used original audio, at ${fmtX(org.medianMultiplier)} your median.`);
      recommendation = `Nearly all your posts use original audio${bpmClause(own)}. Too few library-music posts (${lib.n}) to compare yet.`;
    } else {
      recommendation = `Too few posts on either side to compare library music with original audio yet (${lib.n} vs ${org.n}; ${MIN_SPLIT} each needed).`;
    }
    if (own.profile?.energy) evidence.push(`Your best measured posts run ${own.profile.energy} energy${own.profile.audibleShare != null ? `, sound ${share(own.profile.audibleShare)} of the time` : ""}${own.profile.bpmRange ? `, around ${own.profile.bpmRange[0]}–${own.profile.bpmRange[1]} BPM` : ""} (${own.profile.basedOn} posts).`);
  }

  for (const c of competitors) {
    if (c.posts < MIN_SPLIT) continue;
    const libShare = c.library.n / c.posts;
    const parts = [`${c.accountLabel}: ${c.library.n} of ${c.posts} recent posts use library music`];
    if (c.library.medianMultiplier != null && c.original.medianMultiplier != null) parts.push(`(${fmtX(c.library.medianMultiplier)} vs ${fmtX(c.original.medianMultiplier)} their median)`);
    else if (libShare >= 0.7) parts.push("(almost everything)");
    if (c.profile?.bpmRange) parts.push(`· measured ${c.profile.bpmRange[0]}–${c.profile.bpmRange[1]} BPM`);
    evidence.push(`${parts.join(" ")}.`);
  }

  const coverage = {
    total: rows.length,
    library: rows.filter((r) => !r.hasMediaUrl).length,
    measured: rows.filter((r) => r.features).length,
    pending: rows.filter((r) => r.hasMediaUrl && !r.features && !r.error).length,
    failed: rows.filter((r) => r.error).length,
  };
  return { accounts, own, recommendation, evidence, coverage, generatedAt: now.toISOString() };
}

function bpmClause(a: AccountAudio): string {
  const p = a.profile;
  if (!p?.bpmRange) return "";
  return `; your best measured posts sit around ${p.bpmRange[0]}–${p.bpmRange[1]} BPM`;
}
