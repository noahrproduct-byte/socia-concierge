// Two things Ask SOCIA can carry into a schedule beyond times: the videos the
// person rated in Content Studio in this tab ([V#], sent by the browser), and
// Instagram choices said in the message (make it a Trial Reel, add these
// collaborators). The model only reports what was asked; everything here is
// checked against the person's own words and Instagram's rules. Pure.
import { IG_USERNAME_RE, MAX_COLLABORATORS, normalizeUsername } from "@/lib/publishing/igRules";
import type { CollaboratorsCheck, InstagramSettings, TrialShare } from "@/lib/publishing/types";

export type AskRatedVideo = { ref: string; name: string; kind: "video" | "image"; ratedAt: string; durationSec: number | null; summary: string; caption: string };

const MAX_RATED = 10;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** The rated videos from the browser, bounded; anything malformed is dropped. */
export function sanitizeRated(v: unknown): AskRatedVideo[] {
  return (Array.isArray(v) ? v : []).flatMap((x): AskRatedVideo[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const ref = typeof o.ref === "string" && /^V\d{1,3}$/.test(o.ref) ? o.ref : null;
    const name = str(o.name, 120);
    if (!ref || !name) return [];
    const at = typeof o.ratedAt === "string" && !Number.isNaN(Date.parse(o.ratedAt)) ? new Date(o.ratedAt).toISOString() : null;
    if (!at) return [];
    const d = typeof o.durationSec === "number" && Number.isFinite(o.durationSec) && o.durationSec > 0 ? Math.round(o.durationSec) : null;
    return [{ ref, name, kind: o.kind === "image" ? "image" : "video", ratedAt: at, durationSec: d, summary: str(o.summary, 400), caption: str(o.caption, 600) }];
  }).slice(0, MAX_RATED);
}

/** The evidence lines the model reads, newest first. */
export function ratedBlock(videos: AskRatedVideo[], now: Date): string {
  if (!videos.length) return "";
  const ago = (iso: string) => {
    const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
    return m < 1 ? "just now" : m < 60 ? `${m} minute${m === 1 ? "" : "s"} ago` : `${Math.round(m / 60)} hour${Math.round(m / 60) === 1 ? "" : "s"} ago`;
  };
  const lines = videos.map((v, i) => `[${v.ref}] "${v.name}", ${v.kind === "image" ? "a photo" : `${v.durationSec ? `a ${v.durationSec}-second ` : "a "}video`}, rated ${ago(v.ratedAt)}${i === 0 ? " (the latest)" : ""}.${v.summary ? ` SOCIA's read: ${v.summary}` : ""} ${v.caption ? `Caption so far: "${v.caption}"` : "No caption written yet."}`);
  return `# Videos the user rated in Content Studio in this browser (not posts yet; scheduling one saves it as a post)\n${lines.join("\n")}`;
}

/** What the model says the person asked for on Instagram. */
export type InstagramIntent = { trialReel: string; trialShare: string; collaborators: string[] };
/** trial: a sharing choice, "off" for a normal Reel, null = leave as it is. */
export type AskInstagram = { trial: TrialShare | "off" | null; collaborators: string[]; notes: string[] };

/** Noah's default for "make it a Trial Reel": share it with followers if it does well. */
export const DEFAULT_TRIAL_SHARE: TrialShare = "if_performing";

/**
 * The Instagram part of a schedule, kept only where the person's own message
 * says it: a collaborator is added only when its username is in what they
 * wrote (the model never adds one), valid, and within Instagram's limit.
 */
export function instagramAsk(intent: InstagramIntent | null | undefined, userText: string): AskInstagram | null {
  if (!intent) return null;
  const notes: string[] = [];
  const trial: AskInstagram["trial"] = intent.trialReel === "yes"
    ? (intent.trialShare === "manual" || intent.trialShare === "if_performing" ? intent.trialShare : DEFAULT_TRIAL_SHARE)
    : intent.trialReel === "no" ? "off" : null;
  const said = userText.toLowerCase();
  const collaborators: string[] = [];
  for (const raw of Array.isArray(intent.collaborators) ? intent.collaborators.slice(0, 12) : []) {
    if (typeof raw !== "string") continue;
    const u = normalizeUsername(raw);
    if (!u || collaborators.includes(u)) continue;
    if (!IG_USERNAME_RE.test(u)) { notes.push(`“${raw.slice(0, 40)}” isn't a valid Instagram username, so it was left out.`); continue; }
    // The whole username, not part of a longer one ("salvos" isn't "salvos.pizza"; a full stop after it is fine).
    if (!new RegExp(`(^|[^a-z0-9._])@?${u.replace(/\./g, "\\.")}(?![a-z0-9_]|\\.[a-z0-9_])`).test(said)) continue;
    if (collaborators.length >= MAX_COLLABORATORS) { notes.push(`A post can have up to ${MAX_COLLABORATORS} collaborators, so @${u} was left out.`); continue; }
    collaborators.push(u);
  }
  if (trial == null && !collaborators.length && !notes.length) return null;
  return { trial, collaborators, notes };
}

/**
 * Instagram settings with what was asked: a Trial Reel is a Reel; the named
 * collaborators join any already on the post (up to the limit), and the
 * check SOCIA ran with Instagram goes with them.
 */
export function withInstagramAsk(s: InstagramSettings, ask: AskInstagram, check: CollaboratorsCheck | null): InstagramSettings {
  const next: InstagramSettings = { ...s };
  if (ask.trial === "off") next.trial = null;
  else if (ask.trial) { next.trial = { share: ask.trial }; next.format = "reel"; }
  if (ask.collaborators.length) {
    const merged = Array.from(new Set([...(s.collaborators ?? []).map(normalizeUsername), ...ask.collaborators])).slice(0, MAX_COLLABORATORS);
    next.collaborators = merged;
    next.collaboratorsCheck = check && check.usernames.join(",") === [...merged].sort().join(",") ? check : null;
  }
  return next;
}
