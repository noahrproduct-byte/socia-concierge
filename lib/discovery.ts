// Competitor & content discovery engine.
//
// The pipeline: profile -> queries -> candidates -> normalize -> score ->
// classify -> dedupe. Nothing here invents a metric. A score is computed only
// from signals that are actually present, and every account/content object
// records where its numbers came from so the UI can label them.
//
// Relevance is deliberately explainable: each contribution appends a reason,
// and the UI shows those reasons rather than a black-box percentage.

export type Platform = "instagram" | "youtube" | "facebook";
export type DataSource = "youtube_api" | "web_research" | "instagram_api";

export type Classification =
  | "direct_competitor"
  | "local_competitor"
  | "niche_leader"
  | "content_inspiration"
  | "emerging_creator"
  | "adjacent_competitor";

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  direct_competitor: "Direct competitor",
  local_competitor: "Local",
  niche_leader: "Niche leader",
  content_inspiration: "Content leader",
  emerging_creator: "Emerging",
  adjacent_competitor: "Adjacent",
};

/** The user's goal, reduced to what actually changes ranking. */
export type GoalKind = "local_awareness" | "followers" | "engagement" | "sales" | "unknown";

export type DiscoveryProfile = {
  niche: string | null;
  subNiche: string | null;
  brandName: string | null;
  location: string | null;
  description: string | null;
  goalText: string | null;
  goal: GoalKind;
  ownHandle: string | null;
  ownFollowers: number | null;
  /** Formats the user actually publishes, e.g. VIDEO -> Reel. */
  ownFormats: string[];
};

/** Classify free-text goals into the buckets that change discovery.
 *  Order matters: the most specific intent wins. */
export function goalKind(goals: string | null | undefined): GoalKind {
  const g = (goals ?? "").toLowerCase();
  if (!g.trim()) return "unknown";
  if (/\b(local|nearby|foot traffic|visit|in.?store|walk.?in|community|neighborhood|city)\b/.test(g)) {
    return "local_awareness";
  }
  if (/\b(sale|sell|revenue|order|book|conversion|customer|client|lead)\b/.test(g)) return "sales";
  if (/\b(engage|comment|conversation|interact|reply|share|save)\b/.test(g)) return "engagement";
  if (/\b(follow|grow|audience|reach|awareness|viral|subscriber)\b/.test(g)) return "followers";
  return "unknown";
}

/** Search queries derived from who the user actually is. Not "niche keyword"
 *  alone — the goal and location change what is worth finding. */
export function buildQueries(p: DiscoveryProfile): { q: string; intent: string }[] {
  const niche = (p.subNiche || p.niche || "").trim();
  if (!niche) return [];
  const loc = (p.location ?? "").trim();
  const out: { q: string; intent: string }[] = [];

  // Always: the niche itself and the creators leading it.
  out.push({ q: niche, intent: "niche" });
  out.push({ q: `${niche} creator`, intent: "creator" });

  if (loc) {
    out.push({ q: `${loc} ${niche}`, intent: "local" });
    if (p.goal === "local_awareness" || p.goal === "sales") {
      out.push({ q: `${loc} local business food`, intent: "local" });
    }
  }

  switch (p.goal) {
    case "local_awareness":
      out.push({ q: `${niche} local marketing`, intent: "goal" });
      break;
    case "followers":
      out.push({ q: `${niche} viral short video`, intent: "goal" });
      break;
    case "engagement":
      out.push({ q: `${niche} behind the scenes`, intent: "goal" });
      break;
    case "sales":
      out.push({ q: `${niche} promotion menu`, intent: "goal" });
      break;
    default:
      break;
  }
  // De-duplicate while preserving order.
  const seen = new Set<string>();
  return out.filter((x) => {
    const k = x.q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type AccountCandidate = {
  platform: Platform;
  platformAccountId: string;
  handle: string | null;
  displayName: string | null;
  profileImage: string | null;
  profileUrl: string | null;
  /** null when the platform doesn't publish it — never 0 as a stand-in. */
  followers: number | null;
  location: string | null;
  category: string | null;
  dataSource: DataSource;
  /** Real signals, when available, used for scoring only. */
  uploadsPerWeek?: number | null;
  medianViews?: number | null;
  engagementRate?: number | null;
  matchedIntent?: string;
  note?: string | null;
};

export type ScoredAccount = AccountCandidate & {
  classification: Classification;
  relevanceScore: number;
  relevanceReasons: string[];
};

const inText = (hay: string | null | undefined, needle: string) =>
  Boolean(hay && needle && hay.toLowerCase().includes(needle.toLowerCase()));

/** Does this candidate mention the user's city/region anywhere public? */
function mentionsLocation(c: AccountCandidate, loc: string | null): boolean {
  if (!loc) return false;
  // Match the city token, not the whole "Nashville, Tennessee" string.
  const parts = loc.split(/[,/]/).map((s) => s.trim()).filter((s) => s.length > 2);
  return parts.some(
    (part) =>
      inText(c.displayName, part) || inText(c.handle, part) || inText(c.location, part) ||
      inText(c.note, part),
  );
}

function nicheTokens(p: DiscoveryProfile): string[] {
  return `${p.subNiche ?? ""} ${p.niche ?? ""}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
}

/**
 * Relevance from real signals only, 0-100. Each component appends a reason so
 * the score is explainable in the UI. Missing data contributes nothing rather
 * than being guessed at, so a sparse candidate scores lower than a rich one —
 * which is the honest outcome.
 */
export function scoreAccount(c: AccountCandidate, p: DiscoveryProfile): ScoredAccount {
  const reasons: string[] = [];
  let score = 0;

  const tokens = nicheTokens(p);
  const hay = `${c.displayName ?? ""} ${c.handle ?? ""} ${c.category ?? ""} ${c.note ?? ""}`.toLowerCase();
  const hits = tokens.filter((t) => hay.includes(t)).length;
  if (hits > 0) {
    score += Math.min(30, 15 + hits * 8);
    reasons.push("Same niche");
  } else if (c.matchedIntent === "niche" || c.matchedIntent === "creator") {
    score += 12;
    reasons.push("Found in your niche");
  }

  const local = mentionsLocation(c, p.location);
  if (local) {
    // Local matters far more when the goal is local.
    const w = p.goal === "local_awareness" || p.goal === "sales" ? 28 : 12;
    score += w;
    reasons.push(`Local to ${p.location}`);
  } else if (c.matchedIntent === "local") {
    score += 8;
    reasons.push("Found in a local search");
  }

  // Comparable size is more useful to study than a giant, unless the goal is
  // reach — then the big accounts are the point.
  if (c.followers != null && p.ownFollowers != null && p.ownFollowers > 0) {
    const ratio = c.followers / p.ownFollowers;
    if (ratio >= 0.25 && ratio <= 6) {
      score += 18;
      reasons.push("Comparable audience size");
    } else if (ratio > 6) {
      score += p.goal === "followers" ? 12 : 6;
      reasons.push("Much larger audience");
    } else {
      score += 6;
      reasons.push("Smaller audience");
    }
  }

  // Real performance signals (YouTube only today).
  if (c.uploadsPerWeek != null && c.uploadsPerWeek >= 1) {
    score += 10;
    reasons.push("Publishes consistently");
  }
  if (c.engagementRate != null && c.engagementRate >= 2) {
    score += p.goal === "engagement" ? 14 : 8;
    reasons.push("Strong public engagement");
  }
  if (c.medianViews != null && c.followers != null && c.followers > 0) {
    const perFollower = c.medianViews / c.followers;
    if (perFollower >= 0.5) {
      score += p.goal === "followers" ? 14 : 8;
      reasons.push("Reaches well beyond its subscriber count");
    }
  }

  // Verified numbers beat a web-research lead with no metrics at all.
  if (c.dataSource === "youtube_api") {
    score += 8;
    reasons.push("Verified public metrics");
  }

  return {
    ...c,
    relevanceScore: Math.max(0, Math.min(100, Math.round(score))),
    relevanceReasons: reasons,
    classification: classifyAccount(c, p, local),
  };
}

export function classifyAccount(
  c: AccountCandidate,
  p: DiscoveryProfile,
  local = mentionsLocation(c, p.location),
): Classification {
  const big = c.followers != null && p.ownFollowers != null && p.ownFollowers > 0
    ? c.followers / p.ownFollowers
    : null;

  if (local) return "local_competitor";

  // Small but punching above its weight on real numbers.
  if (
    c.followers != null && c.followers < 50_000 &&
    c.medianViews != null && c.followers > 0 && c.medianViews / c.followers >= 1
  ) {
    return "emerging_creator";
  }
  if (big != null && big >= 8) return "niche_leader";
  if (c.engagementRate != null && c.engagementRate >= 3) return "content_inspiration";
  if (big != null && big >= 0.25 && big <= 6) return "direct_competitor";
  return "adjacent_competitor";
}

export type ContentCandidate = {
  platform: Platform;
  contentUrl: string;
  accountHandle: string | null;
  accountName: string | null;
  accountImage: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  publishedAt: string | null;
  contentType: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  /** Only set when the creator's own median is genuinely known. */
  multiplier: number | null;
  dataSource: DataSource;
  why: string | null;
  matchedIntent?: string;
};

export type ScoredContent = ContentCandidate & {
  relevanceScore: number;
  relevanceReasons: string[];
  trendTags: string[];
};

/** Format/topic tags detected from the title. Used for trend rollups; these
 *  describe the text SOCIA read, they are not performance claims. */
export function detectTrendTags(title: string | null): string[] {
  const t = (title ?? "").toLowerCase();
  const tags: string[] = [];
  const rules: [RegExp, string][] = [
    [/\bpov\b/, "POV"],
    [/behind the scenes|bts|how (it|we) (is|are) made|making of|prep\b/, "Behind the scenes"],
    [/\b\d+\s+(mistakes|things|ways|tips|reasons|levels)\b/, "Listicle hook"],
    [/asmr|satisfying|oddly/, "ASMR / satisfying"],
    [/review|tried|taste test|rating/, "Review"],
    [/recipe|how to make|tutorial/, "Tutorial"],
    [/secret|nobody|never|stop\b|don'?t/, "Contrarian hook"],
    [/day in the life|routine/, "Day in the life"],
    [/owner|founder|chef|employee|staff|meet the/, "People on camera"],
  ];
  for (const [re, label] of rules) if (re.test(t)) tags.push(label);
  return tags;
}

/** Content relevance, 0-100, from real signals only. */
export function scoreContent(c: ContentCandidate, p: DiscoveryProfile): ScoredContent {
  const reasons: string[] = [];
  let score = 0;

  const tokens = nicheTokens(p);
  const hay = `${c.title ?? ""} ${c.accountName ?? ""} ${c.why ?? ""}`.toLowerCase();
  if (tokens.some((t) => hay.includes(t))) {
    score += 26;
    reasons.push("Matches your niche");
  } else {
    score += 10;
    reasons.push("Found in your niche search");
  }

  if (p.location) {
    const parts = p.location.split(/[,/]/).map((s) => s.trim()).filter((s) => s.length > 2);
    if (parts.some((part) => hay.includes(part.toLowerCase()))) {
      score += p.goal === "local_awareness" || p.goal === "sales" ? 24 : 10;
      reasons.push("Local to your market");
    }
  }

  // Format match: the user already makes this kind of thing.
  const isShort = c.contentType === "reel" || c.contentType === "short" || c.platform !== "youtube";
  if (isShort && p.ownFormats.includes("VIDEO")) {
    score += 14;
    reasons.push("Same format you publish");
  }

  // Performance, but only where it is a real measured ratio.
  if (c.multiplier != null && c.multiplier >= 1.5) {
    score += Math.min(20, 10 + Math.round(c.multiplier * 2));
    reasons.push(`${c.multiplier.toFixed(1)}× the creator's median`);
  } else if (c.views != null && c.views > 0) {
    score += 8;
    reasons.push("Verified view count");
  }

  if (c.publishedAt) {
    const days = (Date.now() - new Date(c.publishedAt).getTime()) / 86400000;
    if (days <= 30) {
      score += 16;
      reasons.push("Published recently");
    } else if (days <= 90) {
      score += 8;
      reasons.push("Published this quarter");
    }
  }

  if (c.dataSource === "youtube_api") {
    score += 6;
    reasons.push("Verified public metrics");
  }

  return {
    ...c,
    relevanceScore: Math.max(0, Math.min(100, Math.round(score))),
    relevanceReasons: reasons,
    trendTags: detectTrendTags(c.title),
  };
}

/** Merge duplicates found through different searches, keeping the richest
 *  record. Accounts key on platform + id, content keys on canonical URL. */
export function dedupeAccounts(xs: ScoredAccount[]): ScoredAccount[] {
  const by = new Map<string, ScoredAccount>();
  for (const x of xs) {
    const k = `${x.platform}:${x.platformAccountId.toLowerCase()}`;
    const prev = by.get(k);
    if (!prev || x.relevanceScore > prev.relevanceScore) by.set(k, prev ? { ...prev, ...x } : x);
  }
  return [...by.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Tracking params only ever create false duplicates.
    for (const k of [...u.searchParams.keys()]) {
      if (k !== "v") u.searchParams.delete(k);
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

export function dedupeContent(xs: ScoredContent[]): ScoredContent[] {
  const by = new Map<string, ScoredContent>();
  for (const x of xs) {
    const k = canonicalUrl(x.contentUrl).toLowerCase();
    const prev = by.get(k);
    if (!prev || x.relevanceScore > prev.relevanceScore) by.set(k, x);
  }
  return [...by.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/** Roll discovered content up into the patterns actually present in it. */
export type TrendRollup = {
  tag: string;
  count: number;
  share: number;
  medianMultiplier: number | null;
  examples: string[];
};

export function rollUpTrends(xs: ScoredContent[]): TrendRollup[] {
  const by = new Map<string, ScoredContent[]>();
  for (const x of xs) for (const tag of x.trendTags) by.set(tag, [...(by.get(tag) ?? []), x]);
  const total = xs.length || 1;
  return [...by.entries()]
    .map(([tag, items]) => {
      const mults = items.map((i) => i.multiplier).filter((m): m is number => m != null).sort((a, b) => a - b);
      const mid = Math.floor(mults.length / 2);
      return {
        tag,
        count: items.length,
        share: Math.round((items.length / total) * 100),
        medianMultiplier: mults.length
          ? mults.length % 2 ? mults[mid] : (mults[mid - 1] + mults[mid]) / 2
          : null,
        examples: items.slice(0, 4).map((i) => i.contentUrl),
      };
    })
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count);
}
