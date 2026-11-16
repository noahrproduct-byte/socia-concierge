// The account read, as the steps the person watches at onboarding (Noah,
// 2026-11-15: "make this animation better"). Each event is sent by the server
// when that step really starts or ends (lib/intel/understandLoad.ts), with
// what it found in the person's own account. No timer moves anything, and a
// step that had nothing to read says so. Pure and browser-safe.
import { GOAL_PLATFORM_NAME } from "../growth";
import type { AccountSample, PlatformFacts } from "./accountSample";
import type { Understanding } from "./understanding";
import type { VisualRead } from "./reelReadCore";

export const READ_STAGES = [
  { id: "accounts", label: "Reading your profile" },
  { id: "posts", label: "Reading your posts and captions" },
  { id: "reels", label: "Watching your Reels" },
  { id: "profile", label: "Working out what the account is about" },
] as const;
export type ReadStageId = (typeof READ_STAGES)[number]["id"];

/** One of the person's own posts, shown while it is being read. */
export type ReadItem = { thumb: string | null; href: string | null; label: string; note: string };

export type ReadEvent =
  | { type: "stage"; id: ReadStageId; state: "start"; lines?: string[]; items?: ReadItem[] }
  /** `ok` false: the step ran but had nothing to read (said in `lines`), never a failure dressed as success. */
  | { type: "stage"; id: ReadStageId; state: "done"; ok: boolean; lines: string[]; items?: ReadItem[] }
  /** The end: what the route would have answered without streaming. */
  | { type: "result"; status: number; body: unknown };

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

type Post = { caption?: string; permalink?: string; thumbnail_url?: string; media_url?: string; media_type?: string; timestamp?: string };
const firstLine = (c: string | undefined, max = 60) => {
  const l = (c ?? "").split("\n").map((x) => x.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  return l.length > max ? `${l.slice(0, max - 1).trimEnd()}…` : l;
};
const day = (iso: string | undefined): string => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
};

/** Posts as items to show, in the order given. */
export function readItems(media: Post[], max = 4): ReadItem[] {
  return media.slice(0, max).map((p) => ({
    thumb: p.thumbnail_url ?? (p.media_type === "IMAGE" ? p.media_url ?? null : null),
    href: p.permalink ?? null,
    label: firstLine(p.caption) || "A post without a caption",
    note: day(p.timestamp),
  }));
}

/** "@salvos on Instagram, 12,091 followers": one line per account that answered. */
export function accountLines(facts: PlatformFacts[]): string[] {
  return facts.map((f) => {
    const who = f.handle ? (f.handle.startsWith("@") || f.platform === "facebook" ? f.handle : `@${f.handle}`) : "Your account";
    const count = f.followers != null ? `, ${plural(f.followers, f.platform === "youtube" ? "subscriber" : "follower", f.platform === "youtube" ? "subscribers" : "followers")}` : "";
    return `${who} on ${GOAL_PLATFORM_NAME[f.platform]}${count}`;
  });
}

/** What was read from the posts: how many, how many carry words, and how often the account posts. */
export function postLines(sample: AccountSample): string[] {
  const total = sample.posts.length;
  if (!total) return ["No posts came back from your accounts."];
  const worded = sample.posts.filter((p) => p.text.trim()).length;
  const lines = [`${plural(total, "recent post", "recent posts")} read, ${worded === total ? "all" : n(worded)} with a caption or title.`];
  for (const f of sample.facts) {
    if (f.postsSampled && f.postsPerWeek != null) lines.push(`${GOAL_PLATFORM_NAME[f.platform]}: ${plural(f.postsLast30, "post", "posts")} in the last 30 days, about ${Number(f.postsPerWeek.toFixed(1))} a week.`);
  }
  return lines;
}

/** What watching the Reels gave. */
export function reelLines(v: VisualRead | null): string[] {
  if (!v) return ["SOCIA couldn't watch your Reels this time, so this read uses your captions only."];
  const kinds = v.formats.map((f) => f.name).filter(Boolean).slice(0, 3);
  return [`${plural(v.reels, "Reel", "Reels")} watched.`, ...(kinds.length ? [`Kinds of video seen: ${kinds.join(", ")}.`] : [])];
}

/** What the read concluded, in the words the person confirms on the next screen. */
export function profileLines(u: Understanding): string[] {
  const niche = u.niche ? [u.niche.value.category, u.niche.value.subcategory, u.niche.value.specific].filter(Boolean).join(" > ") : "";
  const lines = [niche ? `Niche: ${niche}.` : "", u.audience?.value ? `Audience: ${u.audience.value.replace(/[.\s]+$/, "")}.` : ""].filter(Boolean);
  return lines.length ? lines : ["Not enough to say what the account is about. You can fill it in yourself on the next screen."];
}
