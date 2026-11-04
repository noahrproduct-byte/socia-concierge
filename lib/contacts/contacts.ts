// Contacts: the people who interact with a brand (commenters on its own
// Instagram posts, and sign-ups on the page SOCIA hosts for it), with the
// brand's own tags and notes. Everything here is pure: cleaning what comes in
// from Instagram, a sign-up form or the editor, tagging from keyword rules,
// and the CSV export.

export type Contact = {
  id: string;
  platform: "instagram" | null;
  handle: string | null;
  name: string | null;
  email: string | null;
  consentAt: string | null;
  tags: string[];
  notes: string | null;
  commentCount: number;
  firstSeen: string;
  lastSeen: string;
  /** "comment", "signup" or both, from the contact's events */
  sources: ("comment" | "signup")[];
};

export type ContactEvent = { kind: "comment" | "signup"; ref: string; postId: string | null; excerpt: string | null; at: string };
export type ContactRule = { id: string; keyword: string; tag: string };
export type SignupPage = { id: string; slug: string; title: string; intro: string | null; button: string; askHandle: boolean; tag: string | null; active: boolean };

export const MAX_TAGS = 12;
export const MAX_RULES = 30;
export const MAX_NOTES = 1000;

/** An Instagram username as stored: lowercase, no @, or null when it isn't one. */
export function normalizeHandle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const h = v.trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

/** An email as stored (trimmed, lowercase), or null when it doesn't look like one. */
export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

/** A tag as stored: plain words, lowercase, up to 30 characters, or null. */
export function cleanTag(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 30);
  return t || null;
}

/** Tags, cleaned, without repeats, at most MAX_TAGS. */
export function cleanTags(v: unknown): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const t = cleanTag(x);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, MAX_TAGS);
}

/** A keyword as stored: one word or short phrase, lowercase. */
export function cleanKeyword(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const k = v.replace(/\s+/g, " ").trim().toLowerCase().replace(/^#/, "").slice(0, 40);
  return k || null;
}

/** A sign-up page address: letters, numbers and dashes. */
export function cleanSlug(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return s.length >= 3 ? s : null;
}

/**
 * The tags a comment earns from the brand's rules: a rule matches when its
 * keyword appears in the comment as a whole word (or phrase), any case, with
 * or without a #.
 */
export function tagsFromText(text: string, rules: Pick<ContactRule, "keyword" | "tag">[]): string[] {
  const hay = ` ${text.toLowerCase().replace(/#/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const out: string[] = [];
  for (const r of rules) {
    const k = r.keyword.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (k && hay.includes(` ${k} `) && !out.includes(r.tag)) out.push(r.tag);
  }
  return out;
}

/** The first words of a comment, for the contact's history. */
export const excerpt = (text: string): string => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= 200 ? t : `${t.slice(0, 199).replace(/\s+\S*$/, "")}…`;
};

const csvCell = (v: string | number | null | undefined): string => {
  const s = v == null ? "" : String(v);
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Contacts as a CSV file a spreadsheet opens as it is. */
export function contactsCsv(rows: Contact[]): string {
  const head = ["Instagram", "Name", "Email", "Consent given", "Tags", "Comments", "First seen", "Last seen", "Notes"];
  const lines = rows.map((c) => [
    c.handle ? `@${c.handle}` : "", c.name, c.email, c.consentAt ? c.consentAt.slice(0, 10) : "",
    c.tags.join("; "), c.commentCount, c.firstSeen.slice(0, 10), c.lastSeen.slice(0, 10), c.notes,
  ].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
