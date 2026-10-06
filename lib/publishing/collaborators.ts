// Collab posts: checking collaborators with Instagram BEFORE a post is
// scheduled, so it never fails at its publish time because of them.
//
// Meta documents `collaborators` on media containers (up to 3 usernames;
// feed image, Reels, carousels), but its Instagram-Login publishing guide —
// how SOCIA connects accounts — does not list it, and the edge that reads
// invites back is Facebook-Login only. So SOCIA asks Instagram directly:
//   1. create an UNPUBLISHED image container on the account with the real
//      usernames (nothing is posted; containers expire after 24 h);
//   2. if that is accepted, create one with an invented username. If
//      Instagram refuses the invented one, it validates collaborators on this
//      connection and the real ones passed ("accepted"); if it takes it too,
//      it isn't validating, and the invites can't be confirmed in advance
//      ("unconfirmed").
// Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createContainer, igRetryable, IG_USERNAME_RE, MAX_COLLABORATORS, normalizeUsername, type IgResult } from "@/lib/igPublish";
import type { CollaboratorsCheck } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export const sortedUsernames = (list: string[]): string[] => Array.from(new Set(list.map(normalizeUsername).filter(Boolean))).sort();

/** True when a stored check covers exactly this list. */
export const checkCovers = (check: CollaboratorsCheck | null | undefined, list: string[]): boolean =>
  Boolean(check) && check!.usernames.join(",") === sortedUsernames(list).join(",");

/**
 * The verdict from the test containers. Pure, unit-tested.
 * `control` is the same test WITHOUT collaborators, made only when the real
 * one failed with Instagram's generic error: it separates "Instagram fails
 * whenever collaborators are included" from "Instagram is failing, period".
 */
export function decideCheck(usernames: string[], real: IgResult<{ id: string }>, probe: IgResult<{ id: string }> | null, at = new Date().toISOString(), control: IgResult<{ id: string }> | null = null): CollaboratorsCheck {
  const base = { usernames: sortedUsernames(usernames), at };
  const who = base.usernames.map((u) => `@${u}`).join(", ");
  if (!real.ok) {
    if (igRetryable(real.code)) {
      if (control?.ok) {
        return {
          ...base, status: "rejected",
          message: `Instagram fails every time collaborators are added (the same test without them works), so it won't take ${who} through this connection. If ${base.usernames.length === 1 ? "that account is" : "any of them is"} private or a personal profile, Instagram can't invite it; otherwise Collab posts may need the Facebook-linked connection.`,
        };
      }
      return { ...base, status: "error", message: `Couldn't check with Instagram right now (${real.error}). Try again in a moment.` };
    }
    return { ...base, status: "rejected", message: `Instagram refused ${base.usernames.length === 1 ? "this collaborator" : "these collaborators"}: ${real.error}` };
  }
  if (probe && !probe.ok && !igRetryable(probe.code)) {
    return { ...base, status: "accepted", message: `Instagram checked ${who} on a test (nothing was posted). The invite${base.usernames.length === 1 ? "" : "s"} go${base.usernames.length === 1 ? "es" : ""} out when this post publishes; each account accepts it in the Instagram app.` };
  }
  return {
    ...base, status: "unconfirmed",
    message: `Instagram took ${who} without checking the username${base.usernames.length === 1 ? "" : "s"} for this account, so SOCIA can't confirm the invite${base.usernames.length === 1 ? "" : "s"} in advance. After the post goes live, check it in Instagram: a collaborator shows as pending until they accept.`,
  };
}

type ConnRow = { ig_user_id: string; username: string | null; access_token: string | null; token_expires_at: string | null; plan_suspended_at?: string | null };

export type CheckInput = { ownerId: string; igUserId: string; usernames: string[]; imageUrl: string };

export async function checkCollaborators(client: Supa, input: CheckInput): Promise<CollaboratorsCheck | { error: string; status: number }> {
  const list = sortedUsernames(input.usernames);
  if (!list.length) return { error: "Add a collaborator first.", status: 400 };
  if (list.length > MAX_COLLABORATORS) return { error: `Instagram allows up to ${MAX_COLLABORATORS} collaborators on a post.`, status: 400 };
  const bad = list.find((u) => !IG_USERNAME_RE.test(u));
  if (bad) return { error: `“${bad}” isn't a valid Instagram username.`, status: 400 };

  const { data, error } = await client
    .from("instagram_connections")
    .select("ig_user_id, username, access_token, token_expires_at, plan_suspended_at")
    .eq("user_id", input.ownerId)
    .eq("ig_user_id", input.igUserId)
    .limit(1);
  if (error) return { error: error.message, status: 500 };
  const conn = ((data ?? []) as ConnRow[])[0];
  if (!conn?.access_token) return { error: "This Instagram account isn't connected to SOCIA.", status: 404 };
  if (conn.plan_suspended_at) return { error: "This Instagram account is paused by your plan.", status: 409 };
  if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() <= Date.now()) return { error: "Instagram's access token for this account has expired. Reconnect Instagram.", status: 409 };
  if (conn.username && list.includes(conn.username.toLowerCase())) {
    return { usernames: list, status: "rejected", message: `@${conn.username} is the account posting — add other accounts as collaborators.`, at: new Date().toISOString() };
  }

  const real = await createContainer(conn.ig_user_id, conn.access_token, { mediaType: "IMAGE", mediaUrl: input.imageUrl, collaborators: list });
  let probe: IgResult<{ id: string }> | null = null;
  let control: IgResult<{ id: string }> | null = null;
  if (real.ok) {
    // An invented, practically unclaimable username; never shown to anyone.
    const invented = `socia_check_${Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
    probe = await createContainer(conn.ig_user_id, conn.access_token, { mediaType: "IMAGE", mediaUrl: input.imageUrl, collaborators: [invented] });
  } else if (igRetryable(real.code)) {
    // Instagram's generic failure: is it the collaborators, or Instagram in general?
    control = await createContainer(conn.ig_user_id, conn.access_token, { mediaType: "IMAGE", mediaUrl: input.imageUrl });
  }
  const verdict = decideCheck(list, real, probe, undefined, control);
  const fmt = (r: IgResult<{ id: string }> | null) => (r ? (r.ok ? "ok" : `${r.code ?? "?"}:${r.error.slice(0, 120)}`) : null);
  console.log("[collab-check]", JSON.stringify({ account: conn.ig_user_id, n: list.length, status: verdict.status, real: fmt(real), probe: fmt(probe), control: fmt(control) }));
  return verdict;
}
