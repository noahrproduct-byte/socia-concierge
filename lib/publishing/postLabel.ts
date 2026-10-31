// What to call a post in lists (Calendar, Approvals, the Dashboard week).
// The master caption's first line when there is one; otherwise the text a
// destination carries of its own: a YouTube title, a Facebook title, or an
// Instagram or TikTok caption override. A YouTube-only post usually has an
// empty master caption, which used to show as "Untitled post". Pure.

const ORDER = ["youtube", "facebook", "instagram", "tiktok"];

/** First non-empty line, without a trailing run of hashtags. */
export function firstLineOf(text: string | null | undefined): string {
  const first = (text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return first.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim() || first;
}

export type LabelSource = { platform: string; settings?: unknown };

/** The label for a post, or null when nothing it carries has any text. */
export function postLabel(caption: string | null | undefined, destinations: readonly LabelSource[] = []): string | null {
  const own = firstLineOf(caption);
  if (own) return own;
  const ranked = [...destinations].sort((a, b) => rank(a.platform) - rank(b.platform));
  for (const d of ranked) {
    const s = (d.settings && typeof d.settings === "object" ? d.settings : {}) as { title?: unknown; caption?: unknown };
    const t = (typeof s.title === "string" ? s.title.trim() : "") || firstLineOf(typeof s.caption === "string" ? s.caption : "");
    if (t) return t;
  }
  return null;
}

const rank = (p: string) => {
  const i = ORDER.indexOf(p);
  return i < 0 ? ORDER.length : i;
};
