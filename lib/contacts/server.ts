// Contacts, server side: who commented on the brand's own Instagram posts
// (read with the comment permission SOCIA already has), who signed up on the
// brand's page, and the brand's own tags, notes and keyword rules. Every read
// and write is scoped to the workspace owner and the Brand Workspace being
// viewed. The public sign-up page goes through the service role and only ever
// adds a contact. Server only. Tables: supabase/contacts.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { scopeToWorkspace } from "@/lib/workspaces";
import { canUseFeature, getEntitlements } from "@/lib/entitlements";
import { getIgSnapshot } from "@/lib/instagramSync";
import { fetchInstagramComments, type SocialComment } from "@/lib/comments";
import {
  cleanKeyword, cleanSlug, cleanTag, cleanTags, excerpt, MAX_NOTES, MAX_RULES, normalizeEmail, normalizeHandle, tagsFromText,
  type Contact, type ContactEvent, type ContactRule, type SignupPage,
} from "./contacts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

/** Posts read per sync, newest first, and comments per post. */
const POSTS = 12;
const PER_POST = 25;

type Row = {
  id: string; platform: string | null; handle: string | null; name: string | null; email: string | null; consent_at: string | null;
  tags: string[] | null; notes: string | null; comment_count: number | null; first_seen: string; last_seen: string;
};
const COLS = "id, platform, handle, name, email, consent_at, tags, notes, comment_count, first_seen, last_seen";

const toContact = (r: Row, sources: Set<string> | undefined): Contact => ({
  id: r.id, platform: r.platform === "instagram" ? "instagram" : null, handle: r.handle, name: r.name, email: r.email, consentAt: r.consent_at,
  tags: r.tags ?? [], notes: r.notes, commentCount: r.comment_count ?? 0, firstSeen: r.first_seen, lastSeen: r.last_seen,
  sources: (["comment", "signup"] as const).filter((k) => sources?.has(k)),
});

/** The table isn't there yet (supabase/contacts.sql not run). */
export const isMissingTable = (e: unknown): boolean => {
  const err = e as { code?: string; message?: string } | null;
  return Boolean(err && (err.code === "42P01" || err.code === "PGRST205" || /relation .* does not exist|could not find the table/i.test(err.message ?? "")));
};
export const MIGRATION_HINT = "Contacts need a one-time database update (supabase/contacts.sql).";

// ------------------------------------------------------------------ rules ----

export async function readRules(client: Supa, ownerId: string, wsId: string | null): Promise<ContactRule[]> {
  const { data, error } = await scopeToWorkspace(client.from("contact_rules").select("id, keyword, tag").eq("user_id", ownerId), wsId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ContactRule[];
}

/** Replace the brand's keyword rules with these (cleaned, without repeats, at most MAX_RULES). */
export async function saveRules(client: Supa, ownerId: string, wsId: string | null, raw: unknown): Promise<ContactRule[]> {
  const seen = new Set<string>();
  const rules = (Array.isArray(raw) ? raw : []).flatMap((x) => {
    const o = (x ?? {}) as { keyword?: unknown; tag?: unknown };
    const keyword = cleanKeyword(o.keyword), tag = cleanTag(o.tag);
    if (!keyword || !tag || seen.has(keyword)) return [];
    seen.add(keyword);
    return [{ keyword, tag }];
  }).slice(0, MAX_RULES);
  const { error: delErr } = await scopeToWorkspace(client.from("contact_rules").delete().eq("user_id", ownerId), wsId);
  if (delErr) throw delErr;
  if (rules.length) {
    const { error } = await client.from("contact_rules").insert(rules.map((r) => ({ ...r, user_id: ownerId, workspace_id: wsId })));
    if (error) throw error;
  }
  return readRules(client, ownerId, wsId);
}

// --------------------------------------------------------------- comments ----

/** problem: why some posts couldn't be read; postsFailed of postsChecked. */
export type SyncResult = { added: number; updated: number; comments: number; problem: string | null; postsChecked?: number; postsFailed?: number };

/** Record the authors of these Instagram comments as contacts, with their comments as events. */
export async function recordCommenters(client: Supa, ownerId: string, wsId: string | null, comments: SocialComment[], rules: ContactRule[]): Promise<Omit<SyncResult, "problem">> {
  type Seen = { handle: string; sourceAccount: string; first: string; last: string; tags: string[]; items: SocialComment[] };
  const byHandle = new Map<string, Seen>();
  for (const c of comments) {
    if (c.platform !== "instagram") continue;
    const handle = normalizeHandle(c.author);
    if (!handle) continue;
    const at = c.createdAt ?? new Date().toISOString();
    const s = byHandle.get(handle) ?? { handle, sourceAccount: c.accountId, first: at, last: at, tags: [], items: [] };
    if (at < s.first) s.first = at;
    if (at > s.last) s.last = at;
    for (const t of tagsFromText(c.text, rules)) if (!s.tags.includes(t)) s.tags.push(t);
    s.items.push(c);
    byHandle.set(handle, s);
  }
  if (!byHandle.size) return { added: 0, updated: 0, comments: 0 };

  const handles = [...byHandle.keys()];
  const { data: existing, error } = await scopeToWorkspace(client.from("contacts").select("id, handle, tags, first_seen, last_seen").eq("user_id", ownerId).eq("platform", "instagram").in("handle", handles), wsId);
  if (error) throw error;
  const have = new Map(((existing ?? []) as { id: string; handle: string; tags: string[] | null; first_seen: string; last_seen: string }[]).map((r) => [r.handle, r]));

  let added = 0, updated = 0, newComments = 0;
  const now = new Date().toISOString();
  for (const s of byHandle.values()) {
    let id = have.get(s.handle)?.id ?? null;
    if (!id) {
      const { data, error: insErr } = await client.from("contacts").insert({
        user_id: ownerId, workspace_id: wsId, platform: "instagram", handle: s.handle, source_account: s.sourceAccount,
        tags: s.tags, first_seen: s.first, last_seen: s.last,
      }).select("id").single();
      if (insErr) {
        // Another sync added them a moment ago: use that row.
        const { data: again } = await scopeToWorkspace(client.from("contacts").select("id").eq("user_id", ownerId).eq("platform", "instagram").eq("handle", s.handle), wsId).limit(1);
        id = (again?.[0] as { id?: string } | undefined)?.id ?? null;
        if (!id) throw insErr;
      } else {
        id = (data as { id: string }).id;
        added++;
      }
    }
    const { data: fresh, error: evErr } = await client.from("contact_events").upsert(
      s.items.map((c) => ({ contact_id: id, user_id: ownerId, workspace_id: wsId, kind: "comment", ref: c.commentId, post_id: c.postId, excerpt: excerpt(c.text), at: c.createdAt ?? now })),
      { onConflict: "contact_id,kind,ref", ignoreDuplicates: true },
    ).select("id");
    if (evErr) throw evErr;
    const gained = (fresh ?? []).length;
    newComments += gained;
    const prev = have.get(s.handle);
    if (prev || gained) {
      const { count } = await client.from("contact_events").select("id", { count: "exact", head: true }).eq("contact_id", id).eq("kind", "comment");
      const tags = cleanTags([...(prev?.tags ?? []), ...s.tags]);
      await client.from("contacts").update({
        comment_count: count ?? 0, tags,
        first_seen: prev && prev.first_seen < s.first ? prev.first_seen : s.first,
        last_seen: prev && prev.last_seen > s.last ? prev.last_seen : s.last,
        updated_at: now,
      }).eq("id", id).eq("user_id", ownerId);
      if (prev && gained) updated++;
    }
  }
  return { added, updated, comments: newComments };
}

/** Read the comments on the brand's latest Instagram posts and record who wrote them. */
export async function syncContacts(client: Supa, ownerId: string, wsId: string | null): Promise<SyncResult> {
  const ig = await getIgSnapshot(client, ownerId, wsId).catch(() => null);
  if (!ig || ig.followers_count == null) return { added: 0, updated: 0, comments: 0, problem: "Connect Instagram in Settings to find the people who comment on your posts." };
  // Only the brand's own posts: a collab another account posted isn't ours.
  const media = (ig.media ?? []).filter((m) => m.id && m.timestamp && !m.collab_owner)
    .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime()).slice(0, POSTS);
  if (!media.length) return { added: 0, updated: 0, comments: 0, problem: null };
  const read = await fetchInstagramComments(client, ownerId, media, PER_POST, wsId);
  const rules = await readRules(client, ownerId, wsId);
  const r = await recordCommenters(client, ownerId, wsId, read.comments, rules);
  return { ...r, problem: read.postsFailed > 0 ? read.problem : null, postsChecked: read.postsChecked, postsFailed: read.postsFailed };
}

// ------------------------------------------------------------ the list ----

export async function listContacts(client: Supa, ownerId: string, wsId: string | null, opts: { tag?: string | null; limit?: number } = {}): Promise<Contact[]> {
  let q = scopeToWorkspace(client.from("contacts").select(COLS).eq("user_id", ownerId), wsId);
  if (opts.tag) q = q.contains("tags", [opts.tag]);
  const { data, error } = await q.order("last_seen", { ascending: false }).limit(opts.limit ?? 2000);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const sources = new Map<string, Set<string>>();
  for (let i = 0; i < rows.length; i += 300) {
    const ids = rows.slice(i, i + 300).map((r) => r.id);
    const { data: ev } = await client.from("contact_events").select("contact_id, kind").eq("user_id", ownerId).in("contact_id", ids);
    for (const e of (ev ?? []) as { contact_id: string; kind: string }[]) {
      const s = sources.get(e.contact_id) ?? new Set<string>();
      s.add(e.kind);
      sources.set(e.contact_id, s);
    }
  }
  return rows.map((r) => toContact(r, sources.get(r.id)));
}

export async function contactEvents(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<ContactEvent[]> {
  const { data, error } = await scopeToWorkspace(client.from("contact_events").select("kind, ref, post_id, excerpt, at").eq("user_id", ownerId).eq("contact_id", id), wsId).order("at", { ascending: false }).limit(50);
  if (error) throw error;
  return ((data ?? []) as { kind: string; ref: string; post_id: string | null; excerpt: string | null; at: string }[]).map((e) => ({
    kind: e.kind === "signup" ? "signup" : "comment", ref: e.ref, postId: e.post_id, excerpt: e.excerpt, at: e.at,
  }));
}

/** Change a contact's tags or notes. Returns the contact, or null when it isn't this brand's. */
export async function updateContact(client: Supa, ownerId: string, wsId: string | null, id: string, patch: { tags?: unknown; notes?: unknown }): Promise<Contact | null> {
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.tags !== undefined) set.tags = cleanTags(patch.tags);
  if (patch.notes !== undefined) set.notes = typeof patch.notes === "string" ? patch.notes.trim().slice(0, MAX_NOTES) || null : null;
  const { data, error } = await scopeToWorkspace(client.from("contacts").update(set).eq("user_id", ownerId).eq("id", id), wsId).select(COLS);
  if (error) throw error;
  const row = (data ?? [])[0] as Row | undefined;
  return row ? toContact(row, undefined) : null;
}

/** Delete a contact and its history. */
export async function deleteContact(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<boolean> {
  const { data, error } = await scopeToWorkspace(client.from("contacts").delete().eq("user_id", ownerId).eq("id", id), wsId).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

// --------------------------------------------------------- sign-up page ----

type PageRow = { id: string; slug: string; title: string; intro: string | null; button: string; ask_handle: boolean; tag: string | null; active: boolean; user_id?: string; workspace_id?: string | null };
const PAGE_COLS = "id, slug, title, intro, button, ask_handle, tag, active";
const toPage = (r: PageRow): SignupPage => ({ id: r.id, slug: r.slug, title: r.title, intro: r.intro, button: r.button, askHandle: r.ask_handle, tag: r.tag, active: r.active });

export async function readSignupPage(client: Supa, ownerId: string, wsId: string | null): Promise<SignupPage | null> {
  const q = client.from("signup_pages").select(PAGE_COLS).eq("user_id", ownerId);
  const { data, error } = await (wsId ? q.eq("workspace_id", wsId) : q.is("workspace_id", null)).limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as PageRow | undefined;
  return row ? toPage(row) : null;
}

export class SignupPageError extends Error {}

/** Create or change the brand's sign-up page. A taken address is refused with a plain message. */
export async function saveSignupPage(client: Supa, ownerId: string, wsId: string | null, raw: Record<string, unknown>): Promise<SignupPage> {
  const slug = cleanSlug(raw.slug);
  if (!slug) throw new SignupPageError("Pick an address of at least 3 letters or numbers.");
  const title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!title) throw new SignupPageError("Give the page a title.");
  const row = {
    slug, title,
    intro: typeof raw.intro === "string" ? raw.intro.trim().slice(0, 400) || null : null,
    button: (typeof raw.button === "string" ? raw.button.replace(/\s+/g, " ").trim().slice(0, 30) : "") || "Sign up",
    ask_handle: raw.askHandle !== false,
    tag: cleanTag(raw.tag),
    active: raw.active !== false,
    updated_at: new Date().toISOString(),
  };
  const current = await readSignupPage(client, ownerId, wsId);
  const { data, error } = current
    ? await client.from("signup_pages").update(row).eq("id", current.id).eq("user_id", ownerId).select(PAGE_COLS)
    : await client.from("signup_pages").insert({ ...row, user_id: ownerId, workspace_id: wsId }).select(PAGE_COLS);
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new SignupPageError("That address is taken. Try another.");
    throw error;
  }
  return toPage((data ?? [])[0] as PageRow);
}

/** The most contacts one owner can hold: a sign-up page can't fill the table without end. */
export const CONTACTS_MAX = 20000;

/** A page only takes sign-ups while its owner's plan includes contacts. */
async function ownerHasContacts(svc: Supa, ownerId: string): Promise<boolean> {
  try {
    return canUseFeature(await getEntitlements(svc, ownerId), "contacts");
  } catch {
    return false;
  }
}

/** The public view of an active sign-up page, by address. */
export async function publicSignupPage(slug: string): Promise<(SignupPage & { brand: string | null }) | null> {
  const s = cleanSlug(slug);
  const svc = createServiceClient();
  if (!s || !svc) return null;
  const { data } = await svc.from("signup_pages").select(`${PAGE_COLS}, user_id, workspace_id`).eq("slug", s).eq("active", true).limit(1);
  const row = (data ?? [])[0] as PageRow | undefined;
  if (!row || !row.user_id || !(await ownerHasContacts(svc, row.user_id))) return null;
  let brand: string | null = null;
  if (row.workspace_id) {
    const { data: ws } = await svc.from("workspaces").select("name").eq("id", row.workspace_id).limit(1);
    brand = ((ws ?? [])[0] as { name?: string } | undefined)?.name ?? null;
  }
  return { ...toPage(row), brand };
}

export type SignupResult = { ok: true } | { ok: false; error: string };

/**
 * A sign-up from the public page: the email (required, with consent) and,
 * when the page asks, an Instagram handle. A handle the brand already knows
 * from comments joins that contact; otherwise the email is the key.
 */
export async function submitSignup(slug: string, input: { email?: unknown; handle?: unknown; consent?: unknown }): Promise<SignupResult> {
  const s = cleanSlug(slug);
  const svc = createServiceClient();
  if (!s || !svc) return { ok: false, error: "This page isn't available." };
  const { data } = await svc.from("signup_pages").select("id, slug, ask_handle, tag, user_id, workspace_id").eq("slug", s).eq("active", true).limit(1);
  const page = (data ?? [])[0] as (PageRow & { user_id: string }) | undefined;
  if (!page || !(await ownerHasContacts(svc, page.user_id))) return { ok: false, error: "This page isn't available." };
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  if (input.consent !== true) return { ok: false, error: "Tick the box to agree before signing up." };
  const handle = page.ask_handle ? normalizeHandle(input.handle) : null;
  const now = new Date().toISOString();
  const owner = page.user_id, ws = page.workspace_id ?? null;
  const tags = page.tag ? [page.tag] : [];

  const scoped = <T,>(q: T): T => (ws ? (q as unknown as { eq: (c: string, v: string) => T }).eq("workspace_id", ws) : (q as unknown as { is: (c: string, v: null) => T }).is("workspace_id", null));
  const find = async (col: "handle" | "email", value: string) => {
    const base = svc.from("contacts").select("id, tags, email").eq("user_id", owner);
    const { data: rows } = await scoped(col === "handle" ? base.eq("platform", "instagram").eq("handle", value) : base.is("handle", null).eq("email", value)).limit(1);
    return ((rows ?? [])[0] as { id: string; tags: string[] | null; email: string | null } | undefined) ?? null;
  };
  // A typed handle is unverified, so it joins the commenter contact only when
  // that contact has no email yet, or the same one. An existing email is never
  // replaced from this public form: a different one becomes its own contact.
  const byHandle = handle ? await find("handle", handle) : null;
  const joinHandle = Boolean(byHandle && (!byHandle.email || byHandle.email === email));
  // A new handle starts its own contact, as before; a taken one falls back to the email.
  const found = joinHandle ? byHandle : handle && !byHandle ? null : await find("email", email);
  let id: string;
  if (found) {
    id = found.id;
    await svc.from("contacts").update({ email, consent_at: now, tags: cleanTags([...(found.tags ?? []), ...tags]), last_seen: now, updated_at: now }).eq("id", id);
  } else {
    const { count } = await svc.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", owner);
    if ((count ?? 0) >= CONTACTS_MAX) return { ok: false, error: "This page isn't taking sign-ups just now." };
    const newHandle = byHandle ? null : handle;
    const { data: ins, error } = await svc.from("contacts").insert({
      user_id: owner, workspace_id: ws, platform: newHandle ? "instagram" : null, handle: newHandle, email, consent_at: now, tags, first_seen: now, last_seen: now,
    }).select("id").single();
    if (error) {
      // Signed up twice at the same moment: the first row stands.
      const again = newHandle ? await find("handle", newHandle) : await find("email", email);
      if (!again) return { ok: false, error: "SOCIA couldn't save that. Try again." };
      id = again.id;
    } else id = (ins as { id: string }).id;
  }
  await svc.from("contact_events").upsert({ contact_id: id, user_id: owner, workspace_id: ws, kind: "signup", ref: page.slug, at: now }, { onConflict: "contact_id,kind,ref", ignoreDuplicates: true });
  return { ok: true };
}

/**
 * Remove the commenter contacts an Instagram account produced, because its
 * connection is gone: for one owner on a disconnect, for everyone on a Meta
 * deletion request (ownerId null).
 */
export async function dropCommenters(client: Supa, sourceAccount: string, ownerId: string | null): Promise<number> {
  const own = <T,>(q: T): T => (ownerId ? (q as unknown as { eq: (c: string, v: string) => T }).eq("user_id", ownerId) : q);
  const { count, error } = await own(client.from("contacts").delete({ count: "exact" }).eq("source_account", sourceAccount).is("email", null));
  if (error) return 0;
  // Contacts who also signed up keep their email and consent; only what came from Instagram goes.
  const { data: kept } = await own(client.from("contacts").select("id").eq("source_account", sourceAccount));
  const ids = ((kept ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length) {
    await client.from("contact_events").delete().eq("kind", "comment").in("contact_id", ids);
    await client.from("contacts").update({ source_account: null, comment_count: 0 }).in("id", ids);
  }
  return count ?? 0;
}
