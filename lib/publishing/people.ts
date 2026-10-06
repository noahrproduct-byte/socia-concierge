// Username suggestions for tagging and Collab posts. Instagram offers no API
// to search its users, so suggestions come only from accounts SOCIA already
// knows for this brand (lib/publishing/peopleServer.ts) — ranked here by how
// closely they match what is being typed. Any full username can still be
// typed. Client-safe and pure.
import { normalizeUsername } from "./igRules";

export type PersonSource = "your_account" | "collaborated" | "tagged" | "mentioned" | "competitor" | "commented";

export type Person = {
  username: string;
  name: string | null;
  avatar: string | null;
  sources: PersonSource[];
  /** how often SOCIA saw them (tags, mentions, comments) */
  count: number;
  /** set for the brand's own connected accounts */
  accountId?: string | null;
};

export const SOURCE_LABEL: Record<PersonSource, string> = {
  your_account: "Your account",
  collaborated: "Collaborated before",
  tagged: "Tagged before",
  mentioned: "Mentioned in your captions",
  competitor: "Competitor you track",
  commented: "Commented on your posts",
};

const SOURCE_WEIGHT: Record<PersonSource, number> = { your_account: 6, collaborated: 5, tagged: 4, mentioned: 3, competitor: 2, commented: 1 };

/** Edit distance, capped: anything over `max` returns max + 1. */
export function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How well a person matches the typed text; 0 = not at all. */
export function matchScore(p: Person, query: string): number {
  const q = normalizeUsername(query);
  if (!q) return 1;
  const u = p.username.toLowerCase();
  if (u === q) return 1000;
  if (u.startsWith(q)) return 800;
  if (u.split(/[._]/).some((part) => part && part.startsWith(q))) return 600;
  const name = (p.name ?? "").toLowerCase();
  if (name && name.split(/\s+/).some((w) => w.startsWith(q))) return 500;
  if (u.includes(q)) return 400;
  // A typo in what has been typed so far: compare with the same-length start of the username.
  if (q.length >= 3) {
    const allowed = q.length >= 6 ? 2 : 1;
    if (distance(q, u.slice(0, q.length), allowed) <= allowed) return 200;
  }
  return 0;
}

/**
 * The suggestions to show for `query`: best match first, then the stronger
 * relationship (your own accounts, past collaborators…), then how often SOCIA
 * has seen them. People already chosen, and the posting account, are left out.
 */
export function rankPeople(people: Person[], query: string, opts: { exclude?: string[]; excludeAccountId?: string | null; limit?: number } = {}): Person[] {
  const exclude = new Set((opts.exclude ?? []).map(normalizeUsername));
  const limit = opts.limit ?? 6;
  return people
    .filter((p) => !exclude.has(p.username.toLowerCase()) && !(opts.excludeAccountId && p.accountId === opts.excludeAccountId))
    .map((p) => ({ p, score: matchScore(p, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || Math.max(...b.p.sources.map((s) => SOURCE_WEIGHT[s])) - Math.max(...a.p.sources.map((s) => SOURCE_WEIGHT[s]))
      || b.p.count - a.p.count
      || a.p.username.length - b.p.username.length
      || a.p.username.localeCompare(b.p.username))
    .slice(0, limit)
    .map((x) => x.p);
}

/** Merge sightings of the same username from different sources. */
export function mergePeople(entries: (Omit<Person, "sources" | "count"> & { source: PersonSource; count?: number })[]): Person[] {
  const by = new Map<string, Person>();
  for (const e of entries) {
    const key = normalizeUsername(e.username);
    if (!key || !/^[a-z0-9._]{1,30}$/.test(key)) continue;
    const cur = by.get(key);
    if (!cur) {
      by.set(key, { username: key, name: e.name ?? null, avatar: e.avatar ?? null, sources: [e.source], count: e.count ?? 1, accountId: e.accountId ?? null });
    } else {
      if (!cur.sources.includes(e.source)) cur.sources.push(e.source);
      cur.count += e.count ?? 1;
      cur.name = cur.name ?? e.name ?? null;
      cur.avatar = cur.avatar ?? e.avatar ?? null;
      cur.accountId = cur.accountId ?? e.accountId ?? null;
    }
  }
  return Array.from(by.values());
}

/** @handles in a caption (trailing periods are punctuation, not part of the name). */
export function mentionsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|[^a-zA-Z0-9._])@([a-zA-Z0-9._]{1,30})/g)) out.push(m[1].replace(/\.+$/, "").toLowerCase());
  return out.filter(Boolean);
}
