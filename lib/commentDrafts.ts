// AI comment replies — the draft-and-approve pipeline (Growth and up).
//
//   sync   : read new comments on the workspace's Facebook + Instagram posts,
//            draft a reply for each one SOCIA hasn't seen, store as `drafted`
//   send   : a person approved (and maybe edited) a draft → post it → `sent`
//   skip   : a person chose not to reply → `skipped`
//
// Nothing is ever sent without a person approving it. Drafting is capped per
// sync so AI cost stays bounded; comments beyond the cap simply wait for the
// next sync. Server only (uses the Anthropic SDK).

import { anthropic, MODEL } from "./anthropic";
import { fetchFacebookComments, fetchInstagramComments, replyToComment, type CommentPlatform, type SocialComment } from "./comments";
import { getFbSnapshot } from "./facebookSync";
import { getIgSnapshot } from "./instagramSync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type DraftStatus = "drafted" | "approved" | "sent" | "skipped" | "failed";

export type CommentDraft = {
  id: string;
  platform: CommentPlatform;
  account_id: string;
  post_id: string;
  comment_id: string;
  author: string | null;
  comment_text: string | null;
  comment_created_at: string | null;
  post_caption: string | null;
  draft: string | null;
  status: DraftStatus;
  sent_reply_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type BrandVoice = {
  name: string | null;
  niche: string | null;
  location: string | null;
  /** Free-text tone/notes from the brand profile, when the person set any. */
  notes: string | null;
};

const DRAFT_CAP_PER_SYNC = 20;
const POSTS_PER_PLATFORM = 10;

/** One reply suggestion, in the brand's voice. Short, human, specific to the
 *  comment; never promotional spam, never a promise the brand can't keep. */
export async function draftReply(input: { comment: SocialComment; brand: BrandVoice }): Promise<string | null> {
  const { comment, brand } = input;
  const who = brand.name ? `the brand "${brand.name}"` : "a small business";
  const niche = brand.niche ? ` in the ${brand.niche} space` : "";
  const place = brand.location ? ` based in ${brand.location}` : "";
  const notes = brand.notes ? `\nBrand voice notes: ${brand.notes}` : "";
  const system = `You write replies to social-media comments on behalf of ${who}${niche}${place}.${notes}

Rules:
- One short reply (1–2 sentences, under 220 characters). Sound like a real person from the team, warm and specific to what the commenter said.
- If they asked a question you can't answer from the post, acknowledge it and invite them to DM or say the team will follow up — never invent facts, prices, hours or promises.
- No hashtags, no links, no emoji spam (at most one emoji, only if it fits), no "Thanks for your comment!" boilerplate, nothing that reads as automated.
- Match the commenter's language. If the comment is hostile or sensitive, keep it calm, brief and de-escalating.
- Output only the reply text.`;
  const user = `Platform: ${comment.platform}
Post caption: ${comment.postCaption ? comment.postCaption.slice(0, 500) : "(none)"}
Commenter: ${comment.author ?? "someone"}
Comment: ${comment.text.slice(0, 600)}`;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 160,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .map((b) => ("text" in b ? b.text : ""))
      .join("")
      .trim()
      .replace(/^["“]|["”]$/g, "");
    return text || null;
  } catch {
    return null;
  }
}

export type SyncResult = { scanned: number; newComments: number; drafted: number; capped: boolean; facebook: boolean; instagram: boolean };

/** Read new comments across the workspace's connected platforms and draft
 *  replies for the ones SOCIA hasn't stored yet. */
export async function syncCommentDrafts(
  supabase: Supa,
  ownerId: string,
  workspaceId: string | null,
  brand: BrandVoice,
): Promise<SyncResult> {
  const [fb, ig] = await Promise.all([
    getFbSnapshot(supabase, ownerId).catch(() => null),
    getIgSnapshot(supabase, ownerId).catch(() => null),
  ]);
  const fbConnected = fb?.status === "connected";
  const igConnected = Boolean(ig && ig.followers_count != null);

  const fbPosts = fbConnected ? (fb!.posts ?? []).filter((p) => p.created_time).sort((a, b) => new Date(b.created_time!).getTime() - new Date(a.created_time!).getTime()).slice(0, POSTS_PER_PLATFORM) : [];
  const igMedia = igConnected ? (ig!.media ?? []).filter((m) => m.timestamp).sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime()).slice(0, POSTS_PER_PLATFORM) : [];

  const [fbComments, igComments] = await Promise.all([
    fbPosts.length ? fetchFacebookComments(supabase, ownerId, fbPosts) : Promise.resolve([] as SocialComment[]),
    igMedia.length ? fetchInstagramComments(supabase, ownerId, igMedia) : Promise.resolve([] as SocialComment[]),
  ]);
  const all = [...fbComments, ...igComments].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

  // Which of these have we already stored?
  const seen = new Set<string>();
  if (all.length) {
    const ids = all.map((c) => c.commentId);
    const { data } = await supabase.from("comment_drafts").select("platform, comment_id").eq("user_id", ownerId).in("comment_id", ids);
    for (const r of (data ?? []) as Array<{ platform: string; comment_id: string }>) seen.add(`${r.platform}:${r.comment_id}`);
  }
  const fresh = all.filter((c) => !seen.has(`${c.platform}:${c.commentId}`));
  const toDraft = fresh.slice(0, DRAFT_CAP_PER_SYNC);

  let drafted = 0;
  for (const c of toDraft) {
    const draft = await draftReply({ comment: c, brand });
    const row = {
      user_id: ownerId,
      workspace_id: workspaceId,
      platform: c.platform,
      account_id: c.accountId,
      post_id: c.postId,
      comment_id: c.commentId,
      author: c.author,
      comment_text: c.text,
      comment_created_at: c.createdAt,
      post_caption: c.postCaption,
      draft,
      status: "drafted",
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("comment_drafts").upsert(row, { onConflict: "user_id,platform,comment_id", ignoreDuplicates: true });
    if (!error) drafted++;
  }
  return { scanned: all.length, newComments: fresh.length, drafted, capped: fresh.length > toDraft.length, facebook: fbConnected, instagram: igConnected };
}

/** The inbox: drafted first (newest comment first), then recent history. */
export async function listCommentDrafts(supabase: Supa, ownerId: string, workspaceId: string | null, limit = 60): Promise<CommentDraft[]> {
  try {
    let q = supabase.from("comment_drafts").select("*").eq("user_id", ownerId);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    if (error) return [];
    const rows = (data ?? []) as CommentDraft[];
    const rank: Record<DraftStatus, number> = { drafted: 0, failed: 1, approved: 2, sent: 3, skipped: 4 };
    return rows.sort((a, b) => rank[a.status] - rank[b.status] || new Date(b.comment_created_at ?? b.created_at).getTime() - new Date(a.comment_created_at ?? a.created_at).getTime());
  } catch {
    return [];
  }
}

async function loadDraft(supabase: Supa, ownerId: string, id: string): Promise<CommentDraft | null> {
  const { data } = await supabase.from("comment_drafts").select("*").eq("user_id", ownerId).eq("id", id).maybeSingle();
  return (data as CommentDraft | null) ?? null;
}

/** Approve + send. `text` is the final reply (the draft, possibly edited). */
export async function sendCommentDraft(supabase: Supa, ownerId: string, id: string, text: string): Promise<{ ok: boolean; error?: string; draft?: CommentDraft }> {
  const d = await loadDraft(supabase, ownerId, id);
  if (!d) return { ok: false, error: "That comment is no longer in your inbox." };
  if (d.status === "sent") return { ok: false, error: "This reply was already sent." };
  const now = new Date().toISOString();
  await supabase.from("comment_drafts").update({ status: "approved", draft: text, updated_at: now }).eq("user_id", ownerId).eq("id", id);
  const r = await replyToComment(supabase, ownerId, d.platform, d.comment_id, text);
  if (r.ok) {
    await supabase.from("comment_drafts").update({ status: "sent", sent_reply_id: r.replyId, error: null, updated_at: new Date().toISOString() }).eq("user_id", ownerId).eq("id", id);
    return { ok: true, draft: { ...d, status: "sent", draft: text, sent_reply_id: r.replyId, error: null } };
  }
  await supabase.from("comment_drafts").update({ status: "failed", error: r.error, updated_at: new Date().toISOString() }).eq("user_id", ownerId).eq("id", id);
  return { ok: false, error: r.error, draft: { ...d, status: "failed", draft: text, error: r.error } };
}

export async function skipCommentDraft(supabase: Supa, ownerId: string, id: string): Promise<boolean> {
  const { error } = await supabase.from("comment_drafts").update({ status: "skipped", updated_at: new Date().toISOString() }).eq("user_id", ownerId).eq("id", id);
  return !error;
}

/** Re-draft one comment (e.g. the person wants another suggestion). */
export async function redraftComment(supabase: Supa, ownerId: string, id: string, brand: BrandVoice): Promise<string | null> {
  const d = await loadDraft(supabase, ownerId, id);
  if (!d || !d.comment_text) return null;
  const draft = await draftReply({
    comment: { platform: d.platform, accountId: d.account_id, postId: d.post_id, postCaption: d.post_caption, commentId: d.comment_id, author: d.author, text: d.comment_text, createdAt: d.comment_created_at, likeCount: null },
    brand,
  });
  if (draft) await supabase.from("comment_drafts").update({ draft, status: "drafted", updated_at: new Date().toISOString() }).eq("user_id", ownerId).eq("id", id);
  return draft;
}
