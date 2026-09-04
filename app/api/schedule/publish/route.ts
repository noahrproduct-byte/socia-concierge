import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createContainer, containerStatus, publishContainer, mediaPermalink, canPublish,
} from "@/lib/igPublish";
import { isDue, nextAction, MAX_ATTEMPTS, DAILY_PUBLISH_CAP, GRACE_HOURS, type ScheduledPost } from "@/lib/scheduling";

export const runtime = "nodejs";
export const maxDuration = 60;

// The publisher.
//
// Two callers:
//   • the cron (Vercel Cron, or any pinger) with `Authorization: Bearer
//     <CRON_SECRET>` — runs every user's due posts via the service role
//   • a signed-in user with ?id=<post> — "Publish now" for one of their own
//
// A post is only ever marked published when Instagram returns a media id.
// Failures record Instagram's own message. A Reel that is still processing
// when this invocation runs out of time stays `publishing` with its container
// id and is finished on the next run — nothing is created twice.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

type Conn = { access_token: string; scopes: string[] | null; ig_user_id: string | null };

async function connectionFor(supabase: Supa, post: ScheduledPost): Promise<Conn | null> {
  let q = supabase.from("instagram_connections").select("access_token, scopes, ig_user_id").eq("user_id", post.user_id);
  if (post.ig_user_id) q = q.eq("ig_user_id", post.ig_user_id);
  const { data } = await q.limit(1);
  const row = data?.[0];
  return row?.access_token ? { access_token: row.access_token, scopes: row.scopes ?? null, ig_user_id: row.ig_user_id ?? null } : null;
}

async function setPost(supabase: Supa, id: string, patch: Record<string, unknown>) {
  await supabase.from("scheduled_posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Push one post as far as it can go within `budgetMs`. */
async function publishOne(supabase: Supa, post: ScheduledPost, budgetMs: number): Promise<{ id: string; result: string }> {
  const started = Date.now();
  const conn = await connectionFor(supabase, post);
  if (!conn) {
    await setPost(supabase, post.id, { status: "failed", error: "No Instagram connection for this account." });
    return { id: post.id, result: "failed: no connection" };
  }
  // A recorded scope list that lacks publishing is a definite no; an absent
  // list (connection made before scopes were recorded) is tried and Instagram
  // gives the real answer.
  if (Array.isArray(conn.scopes) && !canPublish(conn.scopes)) {
    await setPost(supabase, post.id, {
      status: "failed",
      error: "Instagram hasn't granted publishing permission for this account. Reconnect Instagram to enable it.",
    });
    return { id: post.id, result: "failed: no publish scope" };
  }
  const igUserId = post.ig_user_id ?? conn.ig_user_id;
  if (!igUserId || !post.media_url) {
    await setPost(supabase, post.id, { status: "failed", error: !post.media_url ? "No media attached." : "Instagram account id missing." });
    return { id: post.id, result: "failed: missing media or account" };
  }

  // Step 1 — container (skipped if a previous run already made one).
  let containerId = post.container_id;
  if (!containerId) {
    await setPost(supabase, post.id, { status: "publishing", attempts: post.attempts + 1, error: null });
    const c = await createContainer(igUserId, conn.access_token, {
      mediaType: post.media_type, mediaUrl: post.media_url, caption: post.caption,
    });
    if (!c.ok) {
      const terminal = post.attempts + 1 >= MAX_ATTEMPTS;
      await setPost(supabase, post.id, { status: terminal ? "failed" : "scheduled", error: c.error });
      return { id: post.id, result: `container error: ${c.error}` };
    }
    containerId = c.value.id;
    await setPost(supabase, post.id, { container_id: containerId });
  }

  // Step 2 — wait for processing, within budget.
  while (Date.now() - started < budgetMs) {
    const s = await containerStatus(containerId, conn.access_token);
    if (!s.ok) {
      await setPost(supabase, post.id, { status: "failed", error: s.error });
      return { id: post.id, result: `status error: ${s.error}` };
    }
    const action = nextAction(s.value.status_code);
    if (action === "wait") { await sleep(4000); continue; }
    if (action === "fail") {
      await setPost(supabase, post.id, { status: "failed", error: s.value.status ?? `Instagram reported ${s.value.status_code}`, container_id: null });
      return { id: post.id, result: `processing ${s.value.status_code}` };
    }
    if (action === "done") {
      await setPost(supabase, post.id, { status: "published" });
      return { id: post.id, result: "already published" };
    }
    // Step 3 — publish.
    const p = await publishContainer(igUserId, conn.access_token, containerId);
    if (!p.ok) {
      const terminal = post.attempts >= MAX_ATTEMPTS;
      await setPost(supabase, post.id, { status: terminal ? "failed" : "publishing", error: p.error });
      return { id: post.id, result: `publish error: ${p.error}` };
    }
    const permalink = await mediaPermalink(p.value.id, conn.access_token);
    await setPost(supabase, post.id, { status: "published", published_media_id: p.value.id, permalink, error: null });
    return { id: post.id, result: "published" };
  }
  // Out of time while Instagram is still processing — resume next run.
  return { id: post.id, result: "still processing" };
}

async function publishedLast24h(supabase: Supa, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from("scheduled_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", "published").gte("updated_at", since);
  return count ?? 0;
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }

async function run(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(cronSecret) && auth === `Bearer ${cronSecret}`;

  // ---- user mode: publish one of my posts now -----------------------------
  if (!isCron) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    const { data: post } = await supabase.from("scheduled_posts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    if (post.status === "published") return NextResponse.json({ error: "Already published." }, { status: 409 });
    if (!post.media_url) return NextResponse.json({ error: "Attach media before publishing." }, { status: 400 });
    if ((await publishedLast24h(supabase, user.id)) >= DAILY_PUBLISH_CAP) {
      return NextResponse.json({ error: `Daily publishing cap reached (${DAILY_PUBLISH_CAP} in 24h).` }, { status: 429 });
    }
    const r = await publishOne(supabase, post as ScheduledPost, 45_000);
    const { data: after } = await supabase.from("scheduled_posts").select("*").eq("id", id).maybeSingle();
    return NextResponse.json({ result: r.result, post: after });
  }

  // ---- cron mode: everyone's due posts ------------------------------------
  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set; the publisher can't run for all users." }, { status: 503 });
  }
  const now = new Date();
  // A scheduled post the publisher never reached inside the grace window is a
  // missed post, and says so, rather than sitting "scheduled" forever.
  const cutoff = new Date(now.getTime() - GRACE_HOURS * 3600_000).toISOString();
  await svc
    .from("scheduled_posts")
    .update({
      status: "failed",
      error: `Missed its window: the publisher didn't run within ${GRACE_HOURS} hours of the scheduled time.`,
      updated_at: now.toISOString(),
    })
    .eq("status", "scheduled")
    .lt("scheduled_at", cutoff);
  const { data: candidates, error } = await svc
    .from("scheduled_posts")
    .select("*")
    .in("status", ["scheduled", "publishing"])
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = ((candidates ?? []) as ScheduledPost[]).filter((p) => p.status === "publishing" || isDue(p, now));
  const results: { id: string; result: string }[] = [];
  const perUserCount = new Map<string, number>();
  const deadline = Date.now() + 50_000;

  for (const post of due) {
    if (Date.now() > deadline - 8_000) break;
    const used = perUserCount.get(post.user_id) ?? (await publishedLast24h(svc, post.user_id));
    if (used >= DAILY_PUBLISH_CAP) { results.push({ id: post.id, result: "deferred: daily cap" }); continue; }
    const r = await publishOne(svc, post, Math.min(40_000, deadline - Date.now() - 5_000));
    if (r.result === "published") perUserCount.set(post.user_id, used + 1);
    results.push(r);
  }
  const published = results.filter((r) => r.result === "published").length;
  // Heartbeat: the calendar states when the publisher last actually ran.
  await svc
    .from("publisher_heartbeat")
    .upsert({ id: 1, ran_at: now.toISOString(), considered: due.length, published });
  return NextResponse.json({ ran_at: now.toISOString(), considered: due.length, published, results });
}
