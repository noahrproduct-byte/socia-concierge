// SOCIA's pre-publish CONTENT check: measured facts about the draft, nothing
// predicted and nothing scored. Every line is something a person could verify
// by looking at the draft: word counts, character counts against the strictest
// enabled limit, whether a CTA phrase appears, whether required YouTube
// answers are set. Deterministic and pure so it runs on every keystroke.
//
// Client-safe.

import { CAPABILITIES, formatSpec } from "./capabilities";
import { captionFor, enabledDestinations, type ComposerDraft, type DraftDestination, type PickerAccount } from "./composer";
import { byteLength, countHashtags, countMentions, formatIdFor } from "./validate";
import { PLATFORM_LABEL, type YouTubeSettings } from "./types";

export type CheckTone = "good" | "note" | "warn";

export type ContentCheck = {
  /** Stable id for keys and tests. */
  id: string;
  label: string;
  value: string;
  tone: CheckTone;
};

/**
 * The same phrase list Content Studio's checklist uses to spot a call to
 * action in a caption (lib/studio.ts, checklist "cta"). Kept identical so the
 * two screens never disagree about the same caption.
 */
export const CTA_RE = /\?|order|book|dm|tag|comment|save|share|link/i;

const fmtInt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

/** The first non-empty line of a caption, trimmed. */
export function hookLine(caption: string): string {
  return caption.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
}

export function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** The CTA phrase found in the text, or null. A "?" is reported as "a question". */
export function ctaPhrase(text: string): string | null {
  const m = CTA_RE.exec(text);
  if (!m) return null;
  return m[0] === "?" ? "a question" : `“${m[0]}”`;
}

function accountLabel(d: DraftDestination, accounts: PickerAccount[], multiple: boolean): string {
  const base = PLATFORM_LABEL[d.platform];
  if (!multiple) return base;
  const a = accounts.find((x) => x.platform === d.platform && x.accountId === d.accountId);
  return a ? `${base} ${a.handle ? `@${a.handle.replace(/^@/, "")}` : a.label}` : base;
}

export function contentChecks(draft: ComposerDraft, accounts: PickerAccount[]): ContentCheck[] {
  const out: ContentCheck[] = [];
  const enabled = enabledDestinations(draft);
  const caption = draft.masterCaption;
  const hook = hookLine(caption);
  const hookWords = wordCount(hook);

  out.push({
    id: "hook",
    label: "Hook line",
    value: hookWords ? plural(hookWords, "word") : "No caption yet",
    tone: hookWords ? "good" : "warn",
  });

  const cta = ctaPhrase(caption);
  out.push({
    id: "cta",
    label: "Call to action",
    value: cta ? `Found ${cta}` : "No CTA phrase found",
    tone: cta ? "good" : "note",
  });

  // Caption length against the strictest limit among the enabled destinations,
  // measured in each platform's own unit and on the text it will actually carry.
  const platformCounts = new Map<string, number>();
  for (const d of enabled) platformCounts.set(d.platform, (platformCounts.get(d.platform) ?? 0) + 1);
  let tightest: { d: DraftDestination; len: number; max: number; unit: "chars" | "bytes"; textLabel: string } | null = null;
  for (const d of enabled) {
    const fmt = formatSpec(d.platform, formatIdFor(d.platform, d.settings));
    if (!fmt) continue;
    const text = captionFor(draft, d).trim();
    const len = fmt.caption.unit === "bytes" ? byteLength(text) : [...text].length;
    const headroom = fmt.caption.max - len;
    if (!tightest || headroom < tightest.max - tightest.len) {
      tightest = { d, len, max: fmt.caption.max, unit: fmt.caption.unit, textLabel: fmt.caption.field === "description" ? "Description" : "Caption" };
    }
  }
  if (tightest) {
    const unit = tightest.unit === "bytes" ? "bytes" : "characters";
    const who = accountLabel(tightest.d, accounts, (platformCounts.get(tightest.d.platform) ?? 0) > 1);
    out.push({
      id: "length",
      label: `${tightest.textLabel} length`,
      value: `${fmtInt(tightest.len)} of ${fmtInt(tightest.max)} ${unit} (${who})`,
      tone: tightest.len > tightest.max ? "warn" : "good",
    });
  } else {
    const len = [...caption.trim()].length;
    out.push({ id: "length", label: "Caption length", value: `${plural(len, "character")}; no destination selected yet`, tone: "note" });
  }

  const hashtags = countHashtags(caption);
  const mentions = countMentions(caption);
  const hashtagCap = Math.min(...enabled.map((d) => formatSpec(d.platform, formatIdFor(d.platform, d.settings))?.caption.maxHashtags ?? Infinity));
  const mentionCap = Math.min(...enabled.map((d) => formatSpec(d.platform, formatIdFor(d.platform, d.settings))?.caption.maxMentions ?? Infinity));
  const overTags = Number.isFinite(hashtagCap) && hashtags > hashtagCap;
  const overMentions = Number.isFinite(mentionCap) && mentions > mentionCap;
  out.push({
    id: "tags",
    label: "Hashtags and mentions",
    value: `${plural(hashtags, "hashtag")} · ${plural(mentions, "mention")}${overTags ? ` · limit ${hashtagCap} hashtags` : ""}${overMentions ? ` · limit ${mentionCap} mentions` : ""}`,
    tone: overTags || overMentions ? "warn" : hashtags || mentions ? "good" : "note",
  });

  // YouTube: title, made-for-kids answer, thumbnail. One block per enabled channel.
  const yt = enabled.filter((d) => d.platform === "youtube");
  const multiYt = yt.length > 1;
  for (const d of yt) {
    const s = d.settings as YouTubeSettings;
    const who = accountLabel(d, accounts, multiYt);
    const suffix = multiYt ? ` (${who})` : "";
    const title = s.title.trim();
    const titleMax = CAPABILITIES.youtube.fields.title?.max ?? 100;
    const titleLen = [...title].length;
    const repeats = Boolean(title) && Boolean(hook) && title.toLowerCase() === hook.toLowerCase();
    out.push({
      id: `yt_title:${d.key}`,
      label: `YouTube title${suffix}`,
      value: !title
        ? "Required; not set"
        : `${fmtInt(titleLen)} of ${fmtInt(titleMax)} characters${repeats ? " · repeats the caption's first line" : ""}`,
      tone: !title || titleLen > titleMax ? "warn" : repeats ? "note" : "good",
    });
    out.push({
      id: `yt_kids:${d.key}`,
      label: `Made for kids${suffix}`,
      value: s.madeForKids == null ? "Not answered; YouTube requires it" : s.madeForKids ? "Yes" : "No",
      tone: s.madeForKids == null ? "warn" : "good",
    });
    const thumb = s.thumbnailMediaId ? draft.media.find((m) => m.id === s.thumbnailMediaId && m.kind === "image") ?? null : null;
    out.push({
      id: `yt_thumb:${d.key}`,
      label: `Thumbnail${suffix}`,
      value: thumb ? `Chosen: ${thumb.name}` : "None chosen; YouTube picks a frame",
      tone: thumb ? "good" : "note",
    });
  }

  return out;
}
