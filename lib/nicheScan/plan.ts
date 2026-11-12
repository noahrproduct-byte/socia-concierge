// The niche scan (Noah, 2026-11-12: "as soon as SOCIA is connected to an
// account, spend 5 to 10 minutes … scan social media looking at every reel
// and style there is"). When a brand connects, SOCIA researches what goes
// viral in its niche through the official routes only (YouTube's Data API,
// Instagram Business Discovery through the brand's Page or SOCIA's research
// account, and web search for handles and links) and writes a playbook the
// editor, the idea writer and the plans follow.
//
// The job runs in phases, one step at a time, and its whole state lives in
// intelligence_jobs.result, so a step that runs out of time is picked up by
// the next invocation (lib/nicheScan/run.ts). Everything here is pure.

import { provenReels, type TrendingReel } from "../trendSignals";

export const NICHE_SCAN_KIND = "niche_scan";

export type ScanSize = "full" | "lite";

/** How much one scan reads. Full on plans with niche intelligence (Starter and up); a smaller one on Free. */
export const SCAN_SIZES: Record<ScanSize, { igAccounts: number; ytAccounts: number; watch: number; weak: number; batch: number }> = {
  // Noah, 2026-11-12: study more, so lines like "send this to…" that sit past the cover get caught.
  full: { igAccounts: 20, ytAccounts: 8, watch: 40, weak: 6, batch: 4 },
  lite: { igAccounts: 6, ytAccounts: 3, watch: 8, weak: 3, batch: 4 },
};

export type ScanPhase = "discover" | "read" | "pick" | "watch" | "write" | "done";
export const PHASE_ORDER: ScanPhase[] = ["discover", "read", "pick", "watch", "write", "done"];

/** What a person sees for each phase while it runs. */
export const PHASE_LABEL: Record<Exclude<ScanPhase, "done">, string> = {
  discover: "Finding accounts in your niche",
  read: "Reading their recent Reels and Shorts",
  pick: "Picking the ones that took off",
  watch: "Studying each one",
  write: "Writing your playbook",
};

/**
 * How long one step may take, so a step only starts when the invocation has
 * the time to finish it. Discovery is a web-search model call plus YouTube
 * searches; a watch step is one vision call over a batch of Reels.
 */
export const STEP_MS: Record<Exclude<ScanPhase, "done">, number> = {
  discover: 130_000,
  read: 45_000,
  pick: 2_000,
  watch: 50_000,
  write: 70_000,
};

/** One Reel or Short the scan read, with the numbers its platform published. */
export type ScanReel = {
  /** R1, R2... its id in prompts and in the playbook's evidence. */
  id: string;
  url: string;
  platform: string;
  account: string;
  handle: string | null;
  thumb: string | null;
  /** The caption or title, trimmed. */
  caption: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  /** Against the account's own median; null without a baseline. */
  multiplier: number | null;
  basis: string;
  /** Met the bar for "took off" (lib/trendSignals isProven). */
  proven: boolean;
  /** Read as an example of what did NOT work: well under the account's own median. */
  weak?: boolean;
};

export type ScanCounts = {
  /** Accounts found to read (tracked plus discovered). */
  accounts: number;
  /** Accounts whose recent posts were read. */
  accountsRead: number;
  /** Recent Reels and Shorts read, with their numbers. */
  reelsRead: number;
  /** Of those, the ones that took off. */
  proven: number;
  /** Reels picked to study, and how many have been studied. */
  toWatch: number;
  watched: number;
  /** Patterns the playbook kept. */
  patterns: number;
};

export type ScanAccount = { platform: "instagram" | "youtube"; handle: string };

export type ScanState = {
  v: 1;
  size: ScanSize;
  niche: string | null;
  phase: ScanPhase;
  counts: ScanCounts;
  accounts: ScanAccount[];
  /** The workspace discovery rows are scoped to (lib/discoveryRun.ts DiscoveryInputs.wsId). */
  scope?: string | null;
  /** Instagram accounts already read (Business Discovery, ten per call). */
  igRead: number;
  /** Everything read, best first (capped at READ_CAP). */
  reels: TrendingReel[];
  /** YouTube accounts and discovered Shorts have been read. */
  ytRead: boolean;
  /** What the watch phase studies: the proven ones, then the weak ones. */
  picked: ScanReel[];
  /** The study of each picked Reel (lib/nicheScan/playbook.ts WatchedReel), by id. */
  watched: Record<string, unknown>;
  /** Plain notes on what could not be read, shown with the playbook. */
  notes: string[];
  startedAt: string;
};

export function initialState(size: ScanSize, niche: string | null, now: Date): ScanState {
  return {
    v: 1, size, niche, phase: "discover",
    counts: { accounts: 0, accountsRead: 0, reelsRead: 0, proven: 0, toWatch: 0, watched: 0, patterns: 0 },
    accounts: [], igRead: 0, reels: [], ytRead: false, picked: [], watched: {}, notes: [], startedAt: now.toISOString(),
  };
}

/** The most Reels a scan keeps after reading. */
export const READ_CAP = 150;

/**
 * Reels read so far plus a new batch: one per link, captions trimmed, best
 * first by their result against their own account, then by views.
 */
export function mergeReels(have: TrendingReel[], add: TrendingReel[]): TrendingReel[] {
  const byUrl = new Map<string, TrendingReel>();
  for (const r of [...have, ...add]) if (r.url && !byUrl.has(r.url)) byUrl.set(r.url, { ...r, title: compactCaption(r.title) });
  return [...byUrl.values()]
    .sort((a, b) => (b.multiplier ?? -1) - (a.multiplier ?? -1) || (b.views ?? 0) - (a.views ?? 0))
    .slice(0, READ_CAP);
}

/** A stored state, or null when it isn't one this version wrote. */
export function readState(v: unknown): ScanState | null {
  const s = v as ScanState | null;
  return s && s.v === 1 && PHASE_ORDER.includes(s.phase) && s.counts ? s : null;
}

/** Whether the next step of this phase fits in the time left. */
export const stepFits = (phase: ScanPhase, msLeft: number): boolean => phase !== "done" && msLeft >= STEP_MS[phase];

/** The phase after this one. */
export const nextPhase = (p: ScanPhase): ScanPhase => PHASE_ORDER[Math.min(PHASE_ORDER.length - 1, PHASE_ORDER.indexOf(p) + 1)];

const r1 = (n: number) => Math.round(n * 10) / 10;
const compactCaption = (s: string | null) => (s ? s.replace(/\s+/g, " ").trim().slice(0, 300) : null);

/** A ranked Reel as the scan keeps it. */
export function toScanReel(r: TrendingReel, id: string, proven: boolean): ScanReel {
  return {
    id, url: r.url, platform: r.platform, account: r.accountName, handle: r.accountHandle, thumb: r.thumb,
    caption: compactCaption(r.title), publishedAt: r.publishedAt, views: r.views, likes: r.likes, comments: r.comments,
    multiplier: r.multiplier != null ? r1(r.multiplier) : null, basis: r.basis, proven,
  };
}

/** A Reel did badly for its own account at this multiplier or under. */
export const WEAK_AT = 0.6;

/**
 * What to study: the Reels that took off (at most three from one account, so
 * one creator can't make a pattern), filled with the best of the rest when
 * the niche is thin, then a few that did badly for their own account, so the
 * playbook can say what not to do. Each gets an id.
 */
export function pickReels(reels: TrendingReel[], size: ScanSize): ScanReel[] {
  const cfg = SCAN_SIZES[size];
  // A thin niche is filled with the best of the rest, never with Reels that did badly: those are read as what not to do.
  const notWeak = reels.filter((r) => r.multiplier == null || r.multiplier > WEAK_AT);
  const best = provenReels(notWeak, { max: cfg.watch, perAccount: 4, fill: true });
  const chosen = new Set(best.map((r) => r.url));
  const out: ScanReel[] = best.map((r, i) => toScanReel(r, `R${i + 1}`, r.proven));
  const weak = reels
    .filter((r) => !chosen.has(r.url) && r.multiplier != null && r.multiplier <= WEAK_AT)
    .sort((a, b) => (a.multiplier ?? 0) - (b.multiplier ?? 0));
  const perAccount = new Map<string, number>();
  for (const r of weak) {
    if (out.filter((o) => o.weak).length >= cfg.weak) break;
    const k = `${r.platform}:${(r.accountHandle ?? r.accountName).toLowerCase()}`;
    if ((perAccount.get(k) ?? 0) >= 2) continue;
    perAccount.set(k, (perAccount.get(k) ?? 0) + 1);
    out.push({ ...toScanReel(r, `R${out.length + 1}`, false), weak: true });
  }
  return out;
}

/** The next Reels to study: picked, not yet watched, at most a batch. */
export function nextBatch(state: Pick<ScanState, "picked" | "watched" | "size">): ScanReel[] {
  return state.picked.filter((r) => !(r.id in state.watched)).slice(0, SCAN_SIZES[state.size].batch);
}

export type ScanStatus = "queued" | "running" | "done" | "failed";

/** What the card shows: each phase with its state and a real count, never an estimate. */
export type ScanProgress = {
  status: ScanStatus;
  phase: ScanPhase;
  steps: { id: Exclude<ScanPhase, "done">; label: string; state: "done" | "active" | "waiting"; detail: string | null }[];
  counts: ScanCounts;
  startedAt: string | null;
  notes: string[];
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function progressView(state: ScanState | null, status: ScanStatus, startedAt: string | null): ScanProgress {
  const phase = state?.phase ?? "discover";
  const at = PHASE_ORDER.indexOf(phase);
  const c = state?.counts ?? initialState("lite", null, new Date(0)).counts;
  const detail: Record<Exclude<ScanPhase, "done">, string | null> = {
    discover: c.accounts ? `${plural(c.accounts, "account")} found` : null,
    read: c.accountsRead || c.reelsRead ? `${plural(c.reelsRead, "Reel")} read from ${plural(c.accountsRead, "account")}` : null,
    pick: c.toWatch ? `${c.proven} took off; ${c.toWatch} to study` : null,
    watch: c.toWatch ? `${c.watched} of ${c.toWatch} studied` : null,
    write: phase === "done" ? `${plural(c.patterns, "pattern")} kept` : null,
  };
  const steps = (Object.keys(PHASE_LABEL) as Exclude<ScanPhase, "done">[]).map((id, i) => ({
    id, label: PHASE_LABEL[id],
    state: (phase === "done" || i < at ? "done" : i === at && status !== "failed" ? "active" : "waiting") as "done" | "active" | "waiting",
    detail: detail[id],
  }));
  return { status, phase, steps, counts: c, startedAt, notes: state?.notes ?? [] };
}
