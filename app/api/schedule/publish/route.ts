import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createContainer, containerStatus, publishContainer, mediaPermalink, canPublish,
} from "@/lib/igPublish";
import { isDue, nextAction, MAX_ATTEMPTS, DAILY_PUBLISH_CAP, GRACE_HOURS, type ScheduledPost } from "@/lib/scheduling";
import { runDailySnapshots, type SnapshotRun } from "@/lib/snapshotJob";
import { runFacebookDailySnapshots, type PlatformSnapshotRun } from "@/lib/platformSnapshots";
import { runYouTubeDailySnapshots } from "@/lib/youtubeSnapshots";
import { runAlertDetection, type AlertRun } from "@/lib/alertRun";
import { recordCompetitorSnapshots, type CompetitorRun } from "@/lib/competitorHistory";
import { getEntitlements, checkFeature, type Entitlements } from "@/lib/entitlements";
import { requireFeature } from "@/lib/planGuard";
import { parentsWithDestinations } from "@/lib/publishing/db";
import { runDueDestinations, type RunReport } from "@/lib/publishing/runner";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 60;

// The publisher.
//
// Two callers:
//   • the cron (Vercel Cron, or any pinger) with `Authorization: Bearer
//     <CRON_SECRET>` — runs every user's due posts via the service role
//   • a signed-in user with ?id=<post> — "Publish now" for a post of the
//     active Brand Workspace (the owner's, read as the owner through
//     ctx.client); owner and admins only, a Member is answered 403
//
// A post is only ever marked published when Instagram returns a media id.
// Failures record Instagram's own message. A Reel that is still processing
// when this invocation runs out of time stays `publishing` with its container
// id and is finished on the next run — nothing is created twice.
//
// Plans: publishing is a Starter-and-up feature. User mode answers a 403 with
// a PlanError; cron mode never publishes for a plan without it and instead
// returns such rows to `draft` once, with the reason recorded, so a downgrade
// keeps the calendar intact and nothing is mislabelled as missed.

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

/** Per-user entitlement memo for one cron tick, so N due posts cost one read. */
function entitlementCache(supabase: Supa) {
  const cache = new Map<string, Promise<Entitlements>>();
  return (userId: string): Promise<Entitlements> => {
    let p = cache.get(userId);
    if (!p) { p = getEntitlements(supabase, userId); cache.set(userId, p); }
    return p;
  };
}

/** The plan sentence when this user may not schedule, or null when they may. */
function schedulingBlock(ent: Entitlements): string | null {
  const c = checkFeature(ent, "scheduling");
  return c.ok ? null : c.error.error;
}

/** Return one scheduled row to draft for plan reasons. Never deletes; the
 *  sentence lands in `error` so the row explains itself once it can move again. */
async function demoteForPlan(supabase: Supa, id: string, reason: string, now: Date) {
  await supabase
    .from("scheduled_posts")
    .update({ status: "draft", error: reason, updated_at: now.toISOString() })
    .eq("id", id)
    .eq("status", "scheduled");
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }

async function run(req: Request) {
  const url = new URL(req.url);
  // Tolerate the ways a pasted secret gets mangled (surrounding quotes, stray
  // whitespace, "bearer" casing); the comparison itself stays exact.
  const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/^["']|["']$/g, "");
  const auth = clean(req.headers.get("authorization"));
  const cronSecret = clean(process.env.CRON_SECRET);
  const bearer = auth.match(/^bearer\s+(.+)$/i)?.[1];
  const isCron = cronSecret.length > 0 && bearer !== undefined && clean(bearer) === cronSecret;

  // ---- user mode: publish one of my posts now -----------------------------
  if (!isCron) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const ctx = await resolveContext(supabase, user.id);
    if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    const { data: post } = await ctx.client.from("scheduled_posts").select("*").eq("id", id).eq("user_id", ctx.ownerId).maybeSingle();
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    if (post.status === "published") return NextResponse.json({ error: "Already published." }, { status: 409 });
    // A composer post publishes through its destinations, never through this
    // Instagram-only path. A missing post_destinations table reads as none;
    // any other read failure is unknown, and unknown never publishes.
    const multi = await parentsWithDestinations(ctx.client, [id]);
    if (multi == null) {
      return NextResponse.json({ error: "SOCIA could not check this post's destinations. Try again in a moment." }, { status: 503 });
    }
    if (multi.has(id)) {
      return NextResponse.json({ error: "This post publishes through its destinations. Use Publish on the post itself." }, { status: 409 });
    }
    if (!post.media_url) return NextResponse.json({ error: "Attach media before publishing." }, { status: 400 });
    const g = await requireFeature(ctx.client, ctx.ownerId, "scheduling");
    if (g.denied) return g.denied;
    if ((await publishedLast24h(ctx.client, ctx.ownerId)) >= DAILY_PUBLISH_CAP) {
      return NextResponse.json({ error: `Daily publishing cap reached (${DAILY_PUBLISH_CAP} in 24h).` }, { status: 429 });
    }
    const r = await publishOne(ctx.client, post as ScheduledPost, 45_000);
    const { data: after } = await ctx.client.from("scheduled_posts").select("*").eq("id", id).maybeSingle();
    return NextResponse.json({ result: r.result, post: after });
  }

  // ---- cron mode: everyone's due posts ------------------------------------
  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set; the publisher can't run for all users." }, { status: 503 });
  }
  const now = new Date();
  const entFor = entitlementCache(svc);
  const results: { id: string; result: string }[] = [];

  // A scheduled post the publisher never reached inside the grace window is a
  // missed post, and says so, rather than sitting "scheduled" forever. Rows
  // whose owner may not schedule any more are not missed, they are drafts
  // again: those are demoted first, and the sweep only touches ids it examined.
  const cutoff = new Date(now.getTime() - GRACE_HOURS * 3600_000).toISOString();
  const { data: stale } = await svc
    .from("scheduled_posts")
    .select("id, user_id")
    .eq("status", "scheduled")
    .lt("scheduled_at", cutoff)
    .order("scheduled_at", { ascending: true })
    .limit(500);
  const staleRows = (stale ?? []) as { id: string; user_id: string }[];
  const { data: candidates, error } = await svc
    .from("scheduled_posts")
    .select("*")
    .in("status", ["scheduled", "publishing"])
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const candidateRows = (candidates ?? []) as ScheduledPost[];

  // Parents with destination rows belong to the destination runner below;
  // the legacy sweep and loop never touch them. Read once for both lists.
  // When that read fails for a reason other than a missing table the answer
  // is unknown, and the legacy sweep and loop sit this tick out rather than
  // publish a composer post a second time through the Instagram-only path.
  const multi = await parentsWithDestinations(svc, [...new Set([...staleRows.map((r) => r.id), ...candidateRows.map((p) => p.id)])]);
  const deadline = Date.now() + 50_000;
  let due: ScheduledPost[] = [];

  if (multi == null) {
    results.push({ id: "legacy", result: "deferred: destinations unreadable" });
  } else {
    const missed: string[] = [];
    for (const row of staleRows) {
      if (multi.has(row.id)) continue;
      const block = schedulingBlock(await entFor(row.user_id));
      if (block) {
        await demoteForPlan(svc, row.id, block, now);
        results.push({ id: row.id, result: "deferred: plan" });
      } else {
        missed.push(row.id);
      }
    }
    if (missed.length) {
      await svc
        .from("scheduled_posts")
        .update({
          status: "failed",
          error: `Missed its window: the publisher didn't run within ${GRACE_HOURS} hours of the scheduled time.`,
          updated_at: now.toISOString(),
        })
        .eq("status", "scheduled")
        .in("id", missed);
    }
    due = candidateRows.filter((p) => !multi.has(p.id) && (p.status === "publishing" || isDue(p, now)));
  }
  const perUserCount = new Map<string, number>();

  for (const post of due) {
    if (Date.now() > deadline - 8_000) break;
    // Plan gate. A row already `publishing` has a container at Instagram and
    // is finished rather than abandoned; a `scheduled` one goes back to draft.
    if (post.status === "scheduled") {
      const block = schedulingBlock(await entFor(post.user_id));
      if (block) {
        await demoteForPlan(svc, post.id, block, now);
        results.push({ id: post.id, result: "deferred: plan" });
        continue;
      }
    }
    const used = perUserCount.get(post.user_id) ?? (await publishedLast24h(svc, post.user_id));
    if (used >= DAILY_PUBLISH_CAP) { results.push({ id: post.id, result: "deferred: daily cap" }); continue; }
    const r = await publishOne(svc, post, Math.min(40_000, deadline - Date.now() - 5_000));
    if (r.result === "published") perUserCount.set(post.user_id, used + 1);
    results.push(r);
  }
  // Multi-destination posts: one step per due destination, oldest first, with
  // whatever time the legacy loop left. Its own sweeps (plan demotion, missed
  // window, stale upload) live in the runner.
  let destinations: RunReport | null = null;
  try {
    destinations = await runDueDestinations(svc, { now, budgetMs: deadline - Date.now() - 3_000 });
  } catch (e) {
    destinations = { considered: 0, results: [], unavailable: e instanceof Error ? e.message : String(e) };
  }
  const published =
    results.filter((r) => r.result === "published").length +
    (destinations?.results.filter((r) => r.result === "published").length ?? 0);
  const considered = due.length + (destinations?.considered ?? 0);
  // Heartbeat: the calendar states when the publisher last actually ran.
  await svc
    .from("publisher_heartbeat")
    .upsert({ id: 1, ran_at: now.toISOString(), considered, published });
  // Daily account snapshots ride on the same tick: the first run after
  // midnight UTC records each account's totals; later runs find them present.
  let snapshots: SnapshotRun | null = null;
  if (Date.now() < deadline - 5_000) {
    try { snapshots = await runDailySnapshots(svc, now, Math.max(3_000, deadline - Date.now() - 2_000)); } catch { snapshots = null; }
  }
  // Facebook (and, later, other non-Instagram) daily follower snapshots ride
  // the same tick, right after Instagram's: first run of the UTC day records
  // each Page's follower count, later runs find it present.
  let fbSnapshots: PlatformSnapshotRun | null = null;
  if (Date.now() < deadline - 5_000) {
    try { fbSnapshots = await runFacebookDailySnapshots(svc, now, Math.max(3_000, deadline - Date.now() - 2_000)); } catch { fbSnapshots = null; }
  }
  let ytSnapshots: PlatformSnapshotRun | null = null;
  if (Date.now() < deadline - 6_000) {
    try { ytSnapshots = await runYouTubeDailySnapshots(svc, now, Math.max(3_000, deadline - Date.now() - 3_000)); } catch { ytSnapshots = null; }
  }
  // Alert detection rides the same tick, after snapshots so it sees today's
  // numbers. Deterministic and cheap (no external calls); a fingerprint keeps
  // re-runs from duplicating events.
  let alerts: AlertRun | null = null;
  if (Date.now() < deadline - 3_000) {
    try { alerts = await runAlertDetection(svc, now, Math.max(2_000, deadline - Date.now() - 1_500)); } catch { alerts = null; }
  }
  // Competitor history accrues on the same tick, last (it makes external calls,
  // so it takes whatever time is left). first-of-day wins; cheap on re-runs.
  let competitors: CompetitorRun | null = null;
  if (Date.now() < deadline - 4_000) {
    try { competitors = await recordCompetitorSnapshots(svc, now, Math.max(2_000, deadline - Date.now() - 2_000)); } catch { competitors = null; }
  }
  return NextResponse.json({ ran_at: now.toISOString(), considered, published, results, destinations, snapshots, fbSnapshots, ytSnapshots, alerts, competitors });
}
