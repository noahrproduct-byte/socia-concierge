// Server-side reads and writes for Build from Clips: rows ↔ the shapes the UI
// uses, clip registration under the plan's limits, and building one
// opportunity's EDL + guide. Everything is scoped to the workspace owner and
// the active Brand Workspace, like the rest of SOCIA.
import { CAPCUT_STYLE, type EdlStyle } from "./style";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLimit, type Entitlements } from "@/lib/entitlements";
import { getProfile } from "@/lib/profile";
import type { Workspace } from "@/lib/workspaces";
import { scopeToWorkspace } from "@/lib/workspaces";
import { signUrls, clipFolder, clipFolderOf, clipOwnsPath, removeFolder, storageClient } from "./storage";
import { checkClipFits, projectTotals, ownerStorageBytes, type FitResult } from "./limits";
import { copyPaths, dedupeByFootage, MAX_COPY, nextPosition, type LibraryClip } from "./library";
import { opportunityEdl, type AccountContext, type ClipInput } from "./analysis";
import { validateEdl, revalidateEdl, guideFromEdl, edlDurationSec, type ClipForEdl, type RawEdl } from "./edl";
import { sanitizeFinish } from "./finish";
import { applyPacing } from "./pacing";
import { studioLearnedLine } from "./learnLoad";
import { MAX_REGENERATIONS, STUDIO_BUCKET, clipLabel } from "./types";
import { musicPath, sanitizeSoundtrack } from "@/lib/music/taste";
import { briefFloorSec, briefText, fillCut, isBriefIdx, nextBriefIdx, opportunityFromBrief, referenceStyle, titleFor, withBrief, type ReferenceBreakdown } from "./reference";
import { audioLine } from "@/lib/audio/server";
import { videoKind, videoTitle, type VideoSummary } from "./videos";
import type { BuildPlayerData, BuildSource, ClipCard, ClipFacts, ClipStatus, Edl, GuideStep, Opportunity, ProjectStatus, RegenerateDirective, StudioBuild, StudioClip, StudioProject, Transcript, UnderstandProgress, YieldResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type ProjectRow = {
  id: string; user_id: string; workspace_id: string | null; created_by: string | null; title: string | null;
  status: ProjectStatus; progress: UnderstandProgress | null; batch: unknown; yield: YieldResult | null; error: string | null;
  created_at: string; updated_at: string;
};

export type ClipRow = {
  id: string; project_id: string; user_id: string; workspace_id: string | null; position: number; fingerprint: string;
  name: string; mime: string | null; bytes: number; duration_s: number | null; width: number | null; height: number | null;
  recorded_at: string | null; source_path: string | null; frames: { t: number; path: string }[] | null; audio_path: string | null;
  facts: ClipFacts | null; transcript: Transcript | null; card: ClipCard | null; status: ClipStatus; error: string | null;
  expires_at: string | null; purged_at: string | null; created_at: string; updated_at: string;
};

type BuildRow = {
  id: string; project_id: string; opportunity_idx: number; edl: Edl; edl_history?: Edl[] | null; guide: GuideStep[]; caption: string | null; created_at: string;
  // Phase B columns (supabase/studio-phase-b.sql); absent before that migration.
  regenerations?: number | null; render_path?: string | null; rendered_at?: string | null; post_id?: string | null; render_status?: string | null;
};
const BUILD_COLS = "id, project_id, opportunity_idx, edl, edl_history, guide, caption, created_at, render_path, post_id, render_status";
const BUILD_COLS_B = `${BUILD_COLS}, regenerations, rendered_at`;
const HISTORY_MAX = 20;

const PROJECT_COLS = "id, user_id, workspace_id, created_by, title, status, progress, batch, yield, error, created_at, updated_at";
const now = () => new Date().toISOString();

// ------------------------------------------------------------ projects ----

export type ProjectSummary = { id: string; title: string | null; status: ProjectStatus; clips: number; posts: number | null; updatedAt: string };

export async function listProjects(client: Supa, ownerId: string, wsId: string | null, limit = 12): Promise<ProjectSummary[]> {
  const { data, error } = await scopeToWorkspace(
    client.from("studio_projects").select("id, title, status, updated_at, yield, studio_clips(count)").eq("user_id", ownerId),
    wsId,
  ).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as (ProjectRow & { studio_clips: { count: number }[] })[]).map((r) => ({
    id: r.id, title: r.title, status: r.status, updatedAt: r.updated_at,
    clips: r.studio_clips?.[0]?.count ?? 0,
    posts: r.yield ? r.yield.opportunities.length : null,
  }));
}

export async function getProjectRow(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<ProjectRow | null> {
  const { data, error } = await scopeToWorkspace(client.from("studio_projects").select(PROJECT_COLS).eq("user_id", ownerId).eq("id", id), wsId).limit(1);
  if (error) throw error;
  return ((data ?? []) as ProjectRow[])[0] ?? null;
}

export async function createProject(client: Supa, ownerId: string, wsId: string | null, createdBy: string, title: string | null): Promise<ProjectRow> {
  const row: Record<string, unknown> = { user_id: ownerId, created_by: createdBy, title, status: "collecting" };
  if (wsId) row.workspace_id = wsId;
  const { data, error } = await client.from("studio_projects").insert(row).select(PROJECT_COLS).single();
  if (error) throw error;
  return data as ProjectRow;
}

export async function updateProject(client: Supa, id: string, patch: Partial<Pick<ProjectRow, "title" | "status" | "progress" | "batch" | "yield" | "error">>): Promise<void> {
  const { error } = await client.from("studio_projects").update({ ...patch, updated_at: now() }).eq("id", id);
  if (error) throw error;
}

export async function clipRows(client: Supa, projectId: string): Promise<ClipRow[]> {
  const { data, error } = await client.from("studio_clips").select("*").eq("project_id", projectId).order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClipRow[];
}

/** Signed URLs for every keyframe of these clips (footage that expired has none). */
export async function frameUrls(client: Supa, rows: ClipRow[]): Promise<Record<string, string>> {
  const paths = rows.flatMap((r) => (r.purged_at ? [] : (r.frames ?? []).map((f) => f.path).filter((p) => clipOwnsPath(r, p))));
  return signUrls(client, paths);
}

export function rowToClip(r: ClipRow, urls: Record<string, string>): StudioClip {
  return {
    id: r.id, projectId: r.project_id, position: r.position, name: r.name, mime: r.mime, bytes: r.bytes,
    durationSec: r.duration_s, width: r.width, height: r.height, recordedAt: r.recorded_at,
    status: r.status, error: r.error, facts: r.facts, transcript: r.transcript, card: r.card,
    frames: r.purged_at ? [] : (r.frames ?? []).map((f) => ({ t: f.t, url: urls[f.path] })).filter((f) => f.url),
    expiresAt: r.expires_at,
    // A card older than the row itself was copied from an identical clip analysed earlier.
    reused: Boolean(r.card && new Date(r.card.createdAt).getTime() < new Date(r.created_at).getTime() - 1000),
  };
}

export async function loadProject(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<StudioProject | null> {
  const row = await getProjectRow(client, ownerId, wsId, id);
  if (!row) return null;
  const [rows, builds] = await Promise.all([
    clipRows(client, id),
    client.from("studio_builds").select("opportunity_idx").eq("project_id", id).eq("user_id", ownerId),
  ]);
  const urls = await frameUrls(client, rows);
  return {
    id: row.id, title: row.title, status: row.status, progress: row.progress, yield: row.yield, error: row.error,
    createdAt: row.created_at, updatedAt: row.updated_at,
    clips: rows.map((r) => rowToClip(r, urls)),
    builds: ((builds.data ?? []) as { opportunity_idx: number }[]).map((b) => b.opportunity_idx),
  };
}

export async function deleteProject(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<boolean> {
  const row = await getProjectRow(client, ownerId, wsId, id);
  if (!row) return false;
  const rows = await clipRows(client, id);
  for (const c of rows) {
    const folder = !c.purged_at ? clipFolderOf(c) : null;
    if (folder) await removeFolder(client, folder);
  }
  // The project's music tracks (lib/music/taste.ts musicPath) go with it.
  await removeFolder(client, `${ownerId}/${id}/music`);
  const { error } = await client.from("studio_projects").delete().eq("id", id).eq("user_id", ownerId);
  if (error) throw error;
  return true;
}

// --------------------------------------------------------------- clips ----

export type RegisterInput = {
  fingerprint: string; name: string; mime: string | null; bytes: number; durationSec: number;
  width: number | null; height: number | null; recordedAt: string | null;
};

export type RegisterResult =
  | { ok: true; clip: StudioClip; folder: string; reused: boolean; expiresAt: string }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Reserve a slot for a clip before its bytes are uploaded: the plan's limits
 * are checked here, on the server, and an identical clip the owner analysed
 * before lends its transcript, measurements and card (no second transcription
 * or model call). The bytes are still uploaded: each project owns its footage.
 */
export async function registerClip(client: Supa, args: { ownerId: string; viewerId: string; wsId: string | null; ent: Entitlements; project: ProjectRow; input: RegisterInput }): Promise<RegisterResult> {
  const { ownerId, viewerId, wsId, ent, project, input } = args;
  if (!(input.durationSec > 0)) return { ok: false, status: 400, body: { error: "SOCIA couldn't read this file's length." } };

  const existing = await clipRows(client, project.id);
  if (existing.some((c) => c.fingerprint === input.fingerprint && !c.purged_at)) {
    return { ok: false, status: 409, body: { error: "This clip is already in the project.", duplicate: true } };
  }
  const [totals, ownerBytes] = await Promise.all([projectTotals(client, project.id), ownerStorageBytes(client, ownerId)]);
  const fit: FitResult = checkClipFits(ent, totals, ownerBytes, { bytes: input.bytes, durationSec: input.durationSec });
  if (!fit.ok) return "plan" in fit ? { ok: false, status: 403, body: fit.plan as unknown as Record<string, unknown> } : { ok: false, status: 400, body: { error: fit.message } };

  // Reuse: the same footage analysed earlier (any project of this owner).
  let reuse: Pick<ClipRow, "facts" | "transcript" | "card"> | null = null;
  try {
    const { data } = await client.from("studio_clips").select("facts, transcript, card").eq("user_id", ownerId).eq("fingerprint", input.fingerprint).not("card", "is", null).order("created_at", { ascending: false }).limit(1);
    reuse = ((data ?? []) as ClipRow[])[0] ?? null;
  } catch { reuse = null; }

  const row: Record<string, unknown> = {
    project_id: project.id, user_id: ownerId, position: nextPosition(existing), fingerprint: input.fingerprint,
    name: input.name.slice(0, 160), mime: input.mime, bytes: input.bytes, duration_s: input.durationSec,
    width: input.width, height: input.height, recorded_at: input.recordedAt, status: "registered",
    // Footage is kept until the person deletes it (or its project), within the plan's storage.
    expires_at: null,
    facts: reuse?.facts ?? null, transcript: reuse?.transcript ?? null, card: reuse?.card ?? null,
  };
  if (wsId) row.workspace_id = wsId;
  const { data, error } = await client.from("studio_clips").insert(row).select("*").single();
  if (error) throw error;
  const clip = data as ClipRow;
  // New footage makes an existing Content Yield stale: back to collecting
  // (the old results stay readable until the next Understand replaces them).
  await updateProject(client, project.id, project.status === "ready" ? { status: "collecting" } : {}).catch(() => null);
  return { ok: true, clip: rowToClip(clip, {}), folder: clipFolder(viewerId, project.id, clip.id), reused: Boolean(reuse), expiresAt: clip.expires_at ?? "" };
}

export type CompleteInput = { sourcePath: string; frames: { t: number; path: string }[]; audioPath: string | null; facts: ClipFacts | null };

/** The browser finished uploading the bytes, frames and audio and measured the facts. */
export async function completeClip(client: Supa, ownerId: string, wsId: string | null, clipId: string, input: CompleteInput): Promise<StudioClip | null> {
  const { data: cur } = await scopeToWorkspace(client.from("studio_clips").select("*").eq("id", clipId).eq("user_id", ownerId), wsId).limit(1);
  const row = ((cur ?? []) as ClipRow[])[0];
  if (!row) return null;
  const patch: Record<string, unknown> = {
    source_path: input.sourcePath, frames: input.frames, audio_path: input.audioPath,
    // Measurements from this upload win over reused ones (same bytes, same numbers; this one is fresh).
    facts: input.facts ?? row.facts,
    status: row.card ? "ready" : "uploaded", error: null, updated_at: now(),
  };
  const { data, error } = await scopeToWorkspace(client.from("studio_clips").update(patch).eq("id", clipId).eq("user_id", ownerId), wsId).select("*").single();
  if (error) throw error;
  await updateProject(client, row.project_id, {}).catch(() => null);
  const r = data as ClipRow;
  return rowToClip(r, await frameUrls(client, [r]));
}

export async function deleteClip(client: Supa, ownerId: string, wsId: string | null, clipId: string): Promise<boolean> {
  const { data } = await scopeToWorkspace(client.from("studio_clips").select("*").eq("id", clipId).eq("user_id", ownerId), wsId).limit(1);
  const row = ((data ?? []) as ClipRow[])[0];
  if (!row) return false;
  const folder = !row.purged_at ? clipFolderOf(row) : null;
  if (folder) await removeFolder(client, folder);
  const { error } = await scopeToWorkspace(client.from("studio_clips").delete().eq("id", clipId).eq("user_id", ownerId), wsId);
  if (error) throw error;
  // Positions stay stable (labels in existing guides refer to them); a project
  // whose footage changed needs a new Understand to get a trustworthy yield.
  await updateProject(client, row.project_id, { status: "collecting", yield: null, error: null }).catch(() => null);
  return true;
}

// ----------------------------------------------------------- analysis ----

/**
 * The account as the Studio prompts see it. With `wsId` (the routes that
 * plan posts and cuts) it also carries what this workspace's earlier Studio
 * posts did once published (Learn); undefined skips that read.
 */
export async function accountContext(client: Supa, ownerId: string, brandWs: Workspace | null, wsId?: string | null): Promise<AccountContext> {
  const [p, learned] = await Promise.all([
    getProfile(client, ownerId, brandWs).catch(() => null) as Promise<{ niche?: string | null; goals?: string | null; brand_detail?: AccountContext["brand"] } | null>,
    wsId === undefined ? Promise.resolve(null) : studioLearnedLine(client, ownerId, wsId),
  ]);
  return { niche: p?.niche ?? null, location: p?.brand_detail?.location ?? null, goals: p?.goals ?? null, brand: p?.brand_detail ?? null, learned, ownerId };
}

export function toClipInputs(rows: ClipRow[], urls: Record<string, string>): ClipInput[] {
  return rows.map((r) => ({
    id: r.id, position: r.position, name: r.name, durationSec: r.duration_s ?? 0, recordedAt: r.recorded_at,
    facts: r.facts, transcript: r.transcript, card: r.card,
    frames: r.purged_at ? [] : (r.frames ?? []).map((f) => ({ t: f.t, url: urls[f.path] })).filter((f) => f.url),
  }));
}

export function toClipForEdl(r: ClipRow): ClipForEdl {
  const a = r.facts?.audio ?? null, v = r.facts?.visual ?? null;
  return {
    id: r.id, position: r.position, durationSec: r.duration_s ?? 0,
    words: r.transcript?.words?.length ? r.transcript.words : null,
    silences: a?.silences ?? null,
    medianLuma: v?.medianLuma ?? null, warmth: v ? (v.sampled.length ? v.sampled.map((s) => s.warmth).sort((x, y) => x - y)[v.sampled.length >> 1] : null) : null,
    brightness: v?.brightness ?? null, contrastLevel: v?.contrast ?? null,
    rmsDb: a?.rmsDb ?? null, audioLevel: a?.level ?? null,
    hasSpeech: Boolean(r.card?.speech.present && r.transcript?.words?.length),
  };
}

function rowToBuild(b: BuildRow, rows: ClipRow[]): StudioBuild {
  const used = new Set(b.edl.segments.map((s) => s.clipId));
  return {
    id: b.id, projectId: b.project_id, opportunityIdx: b.opportunity_idx, edl: b.edl, guide: b.guide, caption: b.caption,
    createdAt: b.created_at, durationSec: edlDurationSec(b.edl),
    footageExpired: rows.some((r) => used.has(r.id) && (r.purged_at || r.status === "expired")),
    regenerations: b.regenerations ?? 0,
    historyLength: Array.isArray(b.edl_history) ? b.edl_history.length : 0,
    renderPath: b.render_path ?? null,
    renderedAt: b.rendered_at ?? null,
    postId: b.post_id ?? null,
  };
}

/** Select build rows, tolerating a database without the Phase B columns. */
async function selectBuilds(client: Supa, ownerId: string, apply: (q: ReturnType<Supa["from"]>["select"] extends (...a: never[]) => infer R ? R : never) => unknown): Promise<BuildRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = async (cols: string) => apply(client.from("studio_builds").select(cols).eq("user_id", ownerId) as any) as Promise<{ data: unknown; error: { message?: string } | null }>;
  let res = await run(BUILD_COLS_B);
  if (res.error && /column|does not exist/i.test(res.error.message ?? "")) res = await run(BUILD_COLS);
  if (res.error) throw res.error;
  return ((res.data ?? []) as BuildRow[]);
}

export async function loadBuild(client: Supa, ownerId: string, projectId: string, idx: number, rows: ClipRow[]): Promise<StudioBuild | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [b] = await selectBuilds(client, ownerId, (q: any) => q.eq("project_id", projectId).eq("opportunity_idx", idx).limit(1));
  return b ? rowToBuild(b, rows) : null;
}

/** A build of this owner, in this Brand Workspace only (a guest of one brand never reaches another's). */
export async function loadBuildRow(client: Supa, ownerId: string, wsId: string | null, buildId: string): Promise<BuildRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [b] = await selectBuilds(client, ownerId, (q: any) => scopeToWorkspace(q.eq("id", buildId), wsId).limit(1));
  return b ?? null;
}

// ------------------------------------------------------ Make This Video ----

/** Everything the Player and renderer need: the build plus signed clip sources. */
export async function buildPlayerData(client: Supa, ownerId: string, wsId: string | null, buildId: string, canEdit: boolean): Promise<BuildPlayerData | null> {
  const row = await loadBuildRow(client, ownerId, wsId, buildId);
  if (!row) return null;
  const rows = (await clipRows(client, row.project_id)).filter((r) => r.source_path && !r.purged_at && r.status !== "expired" && clipOwnsPath(r, r.source_path));
  const paths = rows.flatMap((r) => [r.source_path!, ...(r.frames?.[0] && clipOwnsPath(r, r.frames[0].path) ? [r.frames[0].path] : [])]);
  const urls = await signUrls(client, paths);
  const sources: BuildSource[] = rows
    .filter((r) => urls[r.source_path!])
    .map((r) => ({
      clipId: r.id, position: r.position, name: r.name, url: urls[r.source_path!],
      thumb: r.frames?.[0] ? urls[r.frames[0].path] ?? null : null,
      durationSec: r.duration_s ?? 0, width: r.width, height: r.height,
      words: r.transcript?.words?.length ? r.transcript.words : null,
      moments: r.card?.moments ?? [],
    }));
  return { build: rowToBuild(row, await clipRows(client, row.project_id)), sources, canEdit, manual: isOwnCutIdx(row.opportunity_idx), music: await madeTracks(client, ownerId, row.project_id, buildId) };
}

/** The tracks already made for a cut, as signed URLs by track id (files are named <buildId>-<trackId>.mp3). */
export async function madeTracks(client: Supa, ownerId: string, projectId: string, buildId: string): Promise<Record<string, string>> {
  try {
    const folder = `${ownerId}/${projectId}/music`;
    const { data } = await storageClient(client).storage.from(STUDIO_BUCKET).list(folder, { limit: 100, search: buildId });
    const files = (data ?? []).filter((o) => o.id && o.name.startsWith(`${buildId}-`) && o.name.endsWith(".mp3"));
    const urls = await signUrls(client, files.map((f) => `${folder}/${f.name}`));
    return Object.fromEntries(files.map((f) => [f.name.slice(buildId.length + 1, -4), urls[`${folder}/${f.name}`]]).filter(([, u]) => Boolean(u)));
  } catch {
    return {};
  }
}

/** The plan feature a build needs: the person's own edit is on every plan; SOCIA's first cut is Starter and up. */
export const buildFeature = (manual: boolean): "build_from_clips" | "auto_build" => (manual ? "build_from_clips" : "auto_build");

/** The opportunity index of a project's own edit (Editor V1): one per project, made by the person, never by AI. */
export const MANUAL_IDX = -1;

/**
 * One clip posted on its own (Make and schedule: "each clip on its own").
 * Its index is CLIP_IDX_BASE minus the clip's position, so each clip has at
 * most one such build. No AI writes it, so it counts like the person's own edit.
 */
export const CLIP_IDX_BASE = -1000;
export const clipIdx = (position: number) => CLIP_IDX_BASE - position;
/** The person's own edit or a single-clip post: no AI made the cut, nothing is counted. */
export const isOwnCutIdx = (idx: number) => idx === MANUAL_IDX || idx <= CLIP_IDX_BASE;

/**
 * SOCIA's cut as plans without Make This Video (auto_build) see it: the edit
 * guide, caption and notes, without the cut itself. The guide tells the person
 * how to edit it; the cut stays out of reach, so it can't be pasted into their
 * own edit and exported for free.
 */
export function guideOnly(b: StudioBuild): StudioBuild {
  return { ...b, edl: { ...b.edl, segments: [], text: [], enhance: [], audio: [], captions: null }, historyLength: 0 };
}

/** Is this build the person's own edit? Decides which plan feature and allowance apply. */
export async function isManualBuild(client: Supa, ownerId: string, wsId: string | null, buildId: string): Promise<boolean | null> {
  const row = await loadBuildRow(client, ownerId, wsId, buildId);
  return row ? isOwnCutIdx(row.opportunity_idx) : null;
}

/**
 * The project's own edit: opened as it was, or started with every ready clip
 * in upload order, full length, no text, no corrections. No model call.
 */
export async function manualBuild(client: Supa, args: { ownerId: string; wsId: string | null; project: ProjectRow; preset?: { style: EdlStyle; width: number; height: number } | null }): Promise<StudioBuild> {
  const { ownerId, wsId, project, preset } = args;
  const rows = await clipRows(client, project.id);
  const existing = await loadBuild(client, ownerId, project.id, MANUAL_IDX, rows);
  if (existing) return existing;
  const ready = rows.filter((r) => r.source_path && !r.purged_at && r.status !== "expired" && (r.duration_s ?? 0) > 0).sort((a, b) => a.position - b.position);
  if (!ready.length) throw new Error("Add at least one clip that finished uploading.");
  const forEdl = ready.map(toClipForEdl);
  const { edl } = validateEdl({
    targetSec: { min: 1, max: Math.ceil(ready.reduce((a, r) => a + (r.duration_s ?? 0), 0)) + 1 },
    segments: ready.map((r) => ({ clipId: r.id, in: 0, out: r.duration_s ?? 0 })),
    text: [], enhance: [], cta: null, music: null, caption: "", notes: [],
    ...(preset ? { width: preset.width, height: preset.height } : {}), style: preset?.style ?? CAPCUT_STYLE,
  }, forEdl);
  // Captions only when the person turns them on.
  edl.captions = null;
  edl.cleanSound = true;
  if (!edl.segments.length) throw new Error("These clips are too short to edit.");
  const guide = guideFromEdl(edl, forEdl);
  const row: Record<string, unknown> = { project_id: project.id, user_id: ownerId, opportunity_idx: MANUAL_IDX, edl, guide, caption: null, model: "manual", updated_at: now() };
  if (wsId) row.workspace_id = wsId;
  const { data, error } = await client.from("studio_builds").upsert(row, { onConflict: "project_id,opportunity_idx" }).select(BUILD_COLS).single();
  if (error) throw error;
  return rowToBuild(data as BuildRow, rows);
}

/**
 * One clip as its own post: opened as it was, or started from the whole clip
 * with no text. Captions are on when the clip has transcribed speech (they
 * come from its real words); the brand preset sets size and style. No model call.
 */
export async function clipBuild(client: Supa, args: { ownerId: string; wsId: string | null; project: ProjectRow; clipId: string; preset?: { style: EdlStyle; width: number; height: number } | null }): Promise<StudioBuild> {
  const { ownerId, wsId, project, clipId, preset } = args;
  const rows = await clipRows(client, project.id);
  const clip = rows.find((r) => r.id === clipId);
  if (!clip || !clip.source_path || clip.purged_at || clip.status === "expired" || !((clip.duration_s ?? 0) > 0)) throw new Error("That clip isn't ready to post.");
  const idx = clipIdx(clip.position);
  const existing = await loadBuild(client, ownerId, project.id, idx, rows);
  if (existing) return existing;
  const dur = clip.duration_s ?? 0;
  const { edl } = validateEdl({
    targetSec: { min: 1, max: Math.ceil(dur) + 1 },
    segments: [{ clipId: clip.id, in: 0, out: dur }],
    text: [], enhance: [], cta: null, music: null, caption: "", notes: [],
    ...(preset ? { width: preset.width, height: preset.height } : {}), style: preset?.style ?? CAPCUT_STYLE,
  }, [toClipForEdl(clip)]);
  edl.captions = clip.transcript?.words?.length ? { source: "transcript" } : null;
  edl.cleanSound = true;
  if (!edl.segments.length) throw new Error("That clip is too short to post.");
  const guide = guideFromEdl(edl, [toClipForEdl(clip)]);
  const row: Record<string, unknown> = { project_id: project.id, user_id: ownerId, opportunity_idx: idx, edl, guide, caption: null, model: "manual", updated_at: now() };
  if (wsId) row.workspace_id = wsId;
  const { data, error } = await client.from("studio_builds").upsert(row, { onConflict: "project_id,opportunity_idx" }).select(BUILD_COLS).single();
  if (error) throw error;
  return rowToBuild(data as BuildRow, rows);
}

/** A person's edit, re-validated and saved; the guide is re-rendered from the same EDL. */
export async function saveBuildEdl(client: Supa, ownerId: string, wsId: string | null, buildId: string, edited: Edl): Promise<StudioBuild> {
  const row = await loadBuildRow(client, ownerId, wsId, buildId);
  if (!row) throw new Error("That build does not exist.");
  const rows = await clipRows(client, row.project_id);
  const forEdl = rows.map(toClipForEdl);
  // A cut made from a brief keeps its brief through every save, so Regenerate still follows it.
  const edl = withBrief(revalidateEdl(edited, forEdl).edl, row.edl?.brief);
  // The playlist is the server's; the person chooses which of its tracks plays, and the levels.
  if (row.edl?.playlist) edl.playlist = row.edl.playlist;
  if (row.edl?.musicAuto) edl.musicAuto = row.edl.musicAuto;
  const soundtrack = sanitizeSoundtrack(edited.soundtrack, row.edl?.playlist, (trackId) => musicPath(ownerId, row.project_id, buildId, trackId));
  if (soundtrack) edl.soundtrack = soundtrack;
  if (!edl.segments.length) throw new Error("A cut needs at least one clip.");
  const history = [...(row.edl_history ?? []), row.edl].slice(-HISTORY_MAX);
  const guide = guideFromEdl(edl, forEdl);
  const { error } = await scopeToWorkspace(client.from("studio_builds").update({ edl, edl_history: history, guide, caption: edl.caption || null, updated_at: now() }).eq("id", buildId).eq("user_id", ownerId), wsId);
  if (error) throw error;
  return rowToBuild({ ...row, edl, edl_history: history, guide, caption: edl.caption || null }, rows);
}

/** Pass 3 again with a directive ("faster", "different hook", …); the previous cut goes to history. */
export async function regenerateBuild(client: Supa, args: { ownerId: string; wsId: string | null; buildId: string; directive: RegenerateDirective; acct: AccountContext }): Promise<StudioBuild> {
  const { ownerId, wsId, buildId, directive, acct } = args;
  const row = await loadBuildRow(client, ownerId, wsId, buildId);
  if (!row) throw new Error("That build does not exist.");
  if ((row.regenerations ?? 0) >= MAX_REGENERATIONS) throw new Error(`This post has been regenerated ${MAX_REGENERATIONS} times, the limit for one build. Edit the cut directly, or open another post.`);
  const project = await getProjectRow(client, ownerId, wsId, row.project_id);
  if (!project) throw new Error("That post is not in this project's results.");
  const rows = await clipRows(client, project.id);
  // A cut made from a brief has no Content Yield post behind it: the brief is the post.
  const brief = isBriefIdx(row.opportunity_idx) ? row.edl?.brief ?? null : null;
  const opp = brief
    ? opportunityFromBrief(titleFor(brief.prompt, null), brief.prompt ?? "Recreate the reference's structure and style.", rows.filter((r) => r.card && !r.purged_at).map((r) => ({ id: r.id, position: r.position, durationSec: r.duration_s ?? 0, card: r.card })), row.opportunity_idx)
    : project.yield?.opportunities.find((o) => o.idx === row.opportunity_idx);
  if (!opp) throw new Error("That post is not in this project's results.");
  // "Use different clips" may draw on the whole project; the others stay on the post's clips.
  const pool = directive === "different_clips" ? rows.filter((r) => r.card && !r.purged_at) : rows.filter((r) => opp.clipIds.includes(r.id));
  const ordered = [...pool.filter((r) => opp.clipIds.includes(r.id)), ...pool.filter((r) => !opp.clipIds.includes(r.id))];
  const urls = await frameUrls(client, ordered);
  const { raw, model } = await opportunityEdl(opp, toClipInputs(ordered, urls), { ...acct, audio: acct.audio ?? (await audioLine(client, ownerId, wsId)) }, { directive, previous: row.edl }, brief ? briefText(brief) : null);
  const forEdl = rows.map(toClipForEdl);
  const edl = paced(validateEdl(raw, forEdl).edl, forEdl);
  if (!edl.segments.length) throw new Error("SOCIA couldn't build a usable cut with that change. Try another option.");
  // A new version keeps the look the cut had.
  edl.style = row.edl.style ?? CAPCUT_STYLE;
  edl.cleanSound = row.edl.cleanSound ?? true;
  // A brief's cut keeps its size, its look and the brief itself.
  if (brief) { edl.brief = brief; edl.width = row.edl.width; edl.height = row.edl.height; if (row.edl.style) edl.style = row.edl.style; if (row.edl.captions) edl.captions = row.edl.captions; }
  // The music made for the cut, and the track chosen, stay with it.
  if (row.edl.playlist) edl.playlist = row.edl.playlist;
  if (row.edl.soundtrack) edl.soundtrack = row.edl.soundtrack;
  if (row.edl.musicAuto) edl.musicAuto = row.edl.musicAuto;
  if (row.edl.lookAuto) edl.lookAuto = row.edl.lookAuto;
  // Picture and sound corrections are per clip, so they still hold for the clips the new cut keeps;
  // cut pauses belonged to the old cut.
  const kept = sanitizeFinish(row.edl.finish, new Set(edl.segments.map((s) => s.clipId)));
  if (kept && (kept.look !== "off" || kept.sound)) edl.finish = { ...kept, pausesCut: null };
  const guide = guideFromEdl(edl, forEdl);
  const history = [...(row.edl_history ?? []), row.edl].slice(-HISTORY_MAX);
  const patch: Record<string, unknown> = { edl, edl_history: history, guide, caption: edl.caption || null, model, updated_at: now() };
  let { error } = await client.from("studio_builds").update({ ...patch, regenerations: (row.regenerations ?? 0) + 1 }).eq("id", buildId).eq("user_id", ownerId);
  if (error && /column|does not exist/i.test(error.message ?? "")) ({ error } = await client.from("studio_builds").update(patch).eq("id", buildId).eq("user_id", ownerId));
  if (error) throw error;
  return rowToBuild({ ...row, edl, edl_history: history, guide, caption: edl.caption || null, regenerations: (row.regenerations ?? 0) + 1 }, rows);
}

// ------------------------------------------------- from a brief or a reference ----

/** The project's cuts made from a brief, newest first: id, title and what they follow. */
export async function listBriefBuilds(client: Supa, ownerId: string, wsId: string | null, projectId: string): Promise<{ id: string; title: string; referenceName: string | null; createdAt: string }[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await selectBuilds(client, ownerId, (q: any) => scopeToWorkspace(q.eq("project_id", projectId).lte("opportunity_idx", -2).gte("opportunity_idx", -999), wsId).order("created_at", { ascending: false }).limit(20));
  return rows.map((b) => {
    const brief = b.edl?.brief ?? null;
    const title = brief?.prompt ? titleFor(brief.prompt, null) : brief?.referenceName ? `Like “${brief.referenceName}”` : "Your video";
    return { id: b.id, title, referenceName: brief?.referenceName ?? null, createdAt: b.created_at };
  });
}

/** Your clips: every clip of this Brand Workspace whose footage is still stored, one per piece of footage. */
export async function listLibrary(client: Supa, ownerId: string, wsId: string | null): Promise<LibraryClip[]> {
  const { data, error } = await scopeToWorkspace(
    client.from("studio_clips").select("id, project_id, fingerprint, name, duration_s, bytes, frames, source_path, status, created_at").eq("user_id", ownerId).is("purged_at", null).in("status", ["ready", "uploaded"]),
    wsId,
  ).order("created_at", { ascending: false }).limit(400);
  if (error) throw error;
  type Row = Pick<ClipRow, "id" | "project_id" | "fingerprint" | "name" | "duration_s" | "bytes" | "frames" | "source_path" | "status" | "created_at">;
  const rows = dedupeByFootage(((data ?? []) as Row[]).filter((r) => clipOwnsPath(r, r.source_path))).slice(0, 200);
  if (!rows.length) return [];
  const projectIds = Array.from(new Set(rows.map((r) => r.project_id)));
  const { data: projects } = await scopeToWorkspace(client.from("studio_projects").select("id, title").eq("user_id", ownerId).in("id", projectIds), wsId);
  const titles = new Map(((projects ?? []) as { id: string; title: string | null }[]).map((p) => [p.id, p.title]));
  const thumbPath = (r: Row) => { const f = r.frames?.[0]?.path; return f && clipOwnsPath(r, f) ? f : null; };
  const urls = await signUrls(client, rows.map(thumbPath).filter((x): x is string => Boolean(x)));
  return rows.filter((r) => titles.has(r.project_id)).map((r) => ({
    id: r.id, projectId: r.project_id, projectTitle: titles.get(r.project_id) ?? null, name: r.name,
    durationSec: r.duration_s, bytes: r.bytes, addedAt: r.created_at, thumb: urls[thumbPath(r) ?? ""] ?? null,
  }));
}

/**
 * A new video from clips you already have: each chosen clip is copied (row
 * and files) into the project, keeping what SOCIA already understood about
 * it, within the plan's limits. Returns how many were added and why any weren't.
 */
export async function copyClipsInto(client: Supa, args: { ownerId: string; viewerId: string; wsId: string | null; ent: Entitlements; project: ProjectRow; clipIds: string[] }): Promise<{ added: number; skipped: string[] }> {
  const { ownerId, viewerId, wsId, ent, project } = args;
  const ids = Array.from(new Set(args.clipIds)).slice(0, MAX_COPY);
  const { data, error } = await scopeToWorkspace(client.from("studio_clips").select("*").eq("user_id", ownerId).in("id", ids).is("purged_at", null), wsId);
  if (error) throw error;
  const byId = new Map(((data ?? []) as ClipRow[]).map((r) => [r.id, r]));
  const st = storageClient(client).storage.from(STUDIO_BUCKET);
  const skipped: string[] = [];
  let added = 0;
  for (const id of ids) {
    const src = byId.get(id);
    const folder = src ? clipFolderOf(src) : null;
    if (!src || !folder) { skipped.push("A clip whose footage is no longer stored was left out."); continue; }
    const existing = await clipRows(client, project.id);
    if (existing.some((c) => c.fingerprint === src.fingerprint && !c.purged_at)) continue;
    const [totals, ownerBytes] = await Promise.all([projectTotals(client, project.id), ownerStorageBytes(client, ownerId)]);
    const fit = checkClipFits(ent, totals, ownerBytes, { bytes: src.bytes, durationSec: src.duration_s ?? 0 });
    if (!fit.ok) { skipped.push(`${src.name}: ${"plan" in fit ? fit.plan.error : fit.message}`); continue; }
    const row: Record<string, unknown> = {
      project_id: project.id, user_id: ownerId, position: nextPosition(existing), fingerprint: src.fingerprint,
      name: src.name, mime: src.mime, bytes: src.bytes, duration_s: src.duration_s, width: src.width, height: src.height,
      recorded_at: src.recorded_at, status: "registered", expires_at: null, facts: src.facts, transcript: src.transcript, card: src.card,
    };
    if (wsId) row.workspace_id = wsId;
    const { data: ins, error: insErr } = await client.from("studio_clips").insert(row).select("*").single();
    if (insErr) throw insErr;
    const clip = ins as ClipRow;
    const plan = copyPaths({ folder, source: src.source_path, frames: src.frames ?? [], audio: src.audio_path }, { uploaderId: viewerId, projectId: project.id, clipId: clip.id });
    let ok = Boolean(plan.source);
    for (const [from, to] of plan.pairs) {
      if (!ok) break;
      const { error: cpErr } = await st.copy(from, to);
      if (cpErr) ok = false;
    }
    if (!ok) {
      await removeFolder(client, clipFolder(viewerId, project.id, clip.id));
      await client.from("studio_clips").delete().eq("id", clip.id).eq("user_id", ownerId);
      skipped.push(`${src.name}: its footage couldn't be copied.`);
      continue;
    }
    await client.from("studio_clips").update({ source_path: plan.source, frames: plan.frames, audio_path: plan.audio, status: clip.card ? "ready" : "uploaded", updated_at: now() }).eq("id", clip.id).eq("user_id", ownerId);
    added++;
  }
  if (added) await updateProject(client, project.id, project.status === "ready" ? { status: "collecting" } : {}).catch(() => null);
  return { added, skipped };
}

/** Every cut of this Brand Workspace, newest first, for the Edit tab (lib/studioClips/videos.ts names them). */
export async function listVideos(client: Supa, ownerId: string, wsId: string | null, limit = 30): Promise<VideoSummary[]> {
  type Row = { id: string; project_id: string; opportunity_idx: number; edl: Edl | null; created_at: string; updated_at?: string | null; render_path?: string | null; post_id?: string | null };
  const run = (cols: string) => scopeToWorkspace(client.from("studio_builds").select(cols).eq("user_id", ownerId), wsId).order("created_at", { ascending: false }).limit(limit);
  let res = await run("id, project_id, opportunity_idx, edl, created_at, updated_at, render_path, post_id");
  if (res.error && /column|does not exist/i.test(res.error.message ?? "")) res = await run("id, project_id, opportunity_idx, edl, created_at");
  if (res.error) throw res.error;
  const rows = (res.data ?? []) as unknown as Row[];
  if (!rows.length) return [];
  const projectIds = Array.from(new Set(rows.map((r) => r.project_id)));
  const [projects, clips] = await Promise.all([
    scopeToWorkspace(client.from("studio_projects").select("id, title, yield, created_at").eq("user_id", ownerId).in("id", projectIds), wsId),
    client.from("studio_clips").select("project_id, position, name").eq("user_id", ownerId).in("project_id", projectIds),
  ]);
  const proj = new Map(((projects.data ?? []) as { id: string; title: string | null; yield: YieldResult | null; created_at: string }[]).map((p) => [p.id, p]));
  const clipName = new Map(((clips.data ?? []) as { project_id: string; position: number; name: string | null }[]).map((c) => [`${c.project_id}:${c.position}`, c.name]));
  return rows
    // A cut whose project is gone (or belongs elsewhere) isn't listed.
    .filter((r) => proj.has(r.project_id))
    .map((r) => {
      const p = proj.get(r.project_id)!;
      const idx = r.opportunity_idx;
      return {
        id: r.id, projectId: r.project_id, kind: videoKind(idx),
        title: videoTitle({
          idx, brief: r.edl?.brief ?? null,
          ideaTitle: idx >= 0 ? p.yield?.opportunities.find((o) => o.idx === idx)?.title ?? null : null,
          clipName: idx <= CLIP_IDX_BASE ? clipName.get(`${r.project_id}:${CLIP_IDX_BASE - idx}`) ?? null : null,
          projectTitle: p.title, projectDate: p.created_at,
        }),
        updatedAt: r.updated_at ?? r.created_at,
        rendered: Boolean(r.render_path),
        postId: r.post_id ?? null,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Pass 3 from a written brief, a reference breakdown, or both, over every
 * understood clip in the project. The reference's text style is applied to
 * the cut; the brand preset gives the size. Saved as a new build.
 */
export async function buildFromBrief(client: Supa, args: {
  ownerId: string; wsId: string | null; project: ProjectRow; acct: AccountContext;
  prompt: string | null;
  reference: { name: string; breakdown: ReferenceBreakdown; brief: string } | null;
  preset?: { style: EdlStyle; width: number; height: number } | null;
}): Promise<StudioBuild> {
  const { ownerId, wsId, project, acct, prompt, reference, preset } = args;
  const rows = await clipRows(client, project.id);
  const usable = rows.filter((r) => r.card && !r.purged_at && r.status !== "expired");
  if (!usable.length) throw new Error("SOCIA hasn't understood these clips yet. Run Understand this footage first.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await selectBuilds(client, ownerId, (q: any) => q.eq("project_id", project.id).lte("opportunity_idx", -2));
  const idx = nextBriefIdx(existing.map((b) => b.opportunity_idx));
  const title = titleFor(prompt, reference?.breakdown ?? null);
  const opp = opportunityFromBrief(title, prompt ?? reference?.breakdown.summary ?? title, usable.map((r) => ({ id: r.id, position: r.position, durationSec: r.duration_s ?? 0, card: r.card })), idx);
  if (!opp.clipIds.length) throw new Error("None of the clips has a usable moment to cut from.");
  const brief = { prompt, reference: reference?.brief ?? null, referenceName: reference?.name ?? null };
  const urls = await frameUrls(client, usable);
  const audio = acct.audio ?? (await audioLine(client, ownerId, wsId));
  const forEdl = rows.map(toClipForEdl);
  const footageSec = usable.filter((r) => opp.clipIds.includes(r.id)).reduce((a, r) => a + (r.duration_s ?? 0), 0);
  const { edl, model } = await edlWithFloor((retry) => opportunityEdl(opp, toClipInputs(usable, urls), { ...acct, audio }, undefined, briefText(brief), retry), forEdl, footageSec);
  if (!edl.segments.length) throw new Error("SOCIA couldn't build a usable cut from that. Make the brief more specific, or add clips.");
  // Every clip the person gave is in the cut, and the cut is long enough to be a post.
  const filled = fillCut(edl.segments, usable.map((r) => ({ id: r.id, position: r.position, durationSec: r.duration_s ?? 0, moments: r.card?.moments ?? [] })), briefFloorSec(footageSec));
  if (filled.added.length) edl.notes.push(`SOCIA added ${filled.added.map((id) => clipLabel(rows.find((r) => r.id === id)?.position ?? 0)).join(", ")} so every clip you gave is in the cut.`);
  edl.segments = filled.segments;
  if (preset) { edl.width = preset.width; edl.height = preset.height; }
  edl.style = preset?.style ?? CAPCUT_STYLE;
  edl.cleanSound = true;
  if (reference) {
    edl.style = referenceStyle(reference.breakdown, edl.style);
    // Word-by-word captions only when the reference has them and the clips have real speech.
    if (reference.breakdown.captions && usable.some((r) => r.transcript?.words?.length)) edl.captions = { source: "transcript" };
  }
  edl.brief = brief;
  const guide = guideFromEdl(edl, forEdl);
  const row: Record<string, unknown> = { project_id: project.id, user_id: ownerId, opportunity_idx: idx, edl, guide, caption: edl.caption || null, model, updated_at: now() };
  if (wsId) row.workspace_id = wsId;
  const { data, error } = await client.from("studio_builds").insert(row).select(BUILD_COLS).single();
  if (error) throw error;
  return rowToBuild(data as BuildRow, rows);
}

/**
 * SOCIA's cut, paced (lib/studioClips/pacing.ts): cuts start on the action,
 * none drags, the ending lands, every line is readable. One note says how
 * many moved; the person's own edits are never paced this way.
 */
function paced(edl: Edl, forEdl: ClipForEdl[]): Edl {
  const { edl: out, changes } = applyPacing(edl, forEdl);
  if (changes.length) out.notes = [...out.notes, `SOCIA paced the cut: ${changes.length} change${changes.length === 1 ? "" : "s"} so cuts start on the action, nothing drags and every line can be read.`];
  return out;
}

/**
 * Pass 3 with a floor: a cut far shorter than its footage allows (the
 * 2-second Halloween video, 2026-11-02) is made once more, told how long it
 * should be. The longer of the two is kept.
 */
async function edlWithFloor(make: (retry: string | null) => Promise<{ raw: RawEdl; model: string }>, forEdl: ClipForEdl[], footageSec: number): Promise<{ edl: Edl; model: string }> {
  const first = await make(null);
  let edl = paced(validateEdl(first.raw, forEdl).edl, forEdl);
  let model = first.model;
  const len = edlDurationSec(edl);
  const floor = Math.min(10, footageSec * 0.5);
  if (footageSec >= 6 && len < floor) {
    const again = await make(`Your first cut was only ${len.toFixed(1)} seconds long, from ${Math.round(footageSec)} seconds of footage. That is far too short. Make a cut of at least ${Math.ceil(floor)} seconds that uses all the clips.`);
    const second = paced(validateEdl(again.raw, forEdl).edl, forEdl);
    if (edlDurationSec(second) > len) { edl = second; model = again.model; }
  }
  return { edl, model };
}

/** The browser finished rendering and uploading; the draft post exists. */
export async function markRendered(client: Supa, ownerId: string, wsId: string | null, buildId: string, info: { path: string; durationSec: number | null; postId: string | null }): Promise<void> {
  const base: Record<string, unknown> = { render_path: info.path, render_status: "done", post_id: info.postId, updated_at: now() };
  let { error } = await scopeToWorkspace(client.from("studio_builds").update({ ...base, rendered_at: now(), render_duration_s: info.durationSec }).eq("id", buildId).eq("user_id", ownerId), wsId);
  if (error && /column|does not exist/i.test(error.message ?? "")) ({ error } = await scopeToWorkspace(client.from("studio_builds").update(base).eq("id", buildId).eq("user_id", ownerId), wsId));
  if (error) throw error;
}

/** Pass 3 for one opportunity: EDL proposal → validated EDL → edit guide, saved. */
export async function buildOpportunity(client: Supa, args: { ownerId: string; wsId: string | null; project: ProjectRow; idx: number; acct: AccountContext }): Promise<StudioBuild> {
  const { ownerId, wsId, project, idx, acct } = args;
  const opp: Opportunity | undefined = project.yield?.opportunities.find((o) => o.idx === idx);
  if (!opp) throw new Error("That post is not in this project's results.");
  const rows = await clipRows(client, project.id);
  const used = rows.filter((r) => opp.clipIds.includes(r.id));
  const urls = await frameUrls(client, used);
  const audio = acct.audio ?? (await audioLine(client, ownerId, wsId));
  const forEdl = used.map(toClipForEdl);
  const footageSec = used.reduce((a, r) => a + (r.duration_s ?? 0), 0);
  const { edl, model } = await edlWithFloor((retry) => opportunityEdl(opp, toClipInputs(used, urls), { ...acct, audio }, undefined, null, retry), forEdl, footageSec);
  if (!edl.segments.length) throw new Error("SOCIA couldn't build a usable cut from these clips.");
  edl.style = edl.style ?? CAPCUT_STYLE;
  edl.cleanSound = true;
  const guide = guideFromEdl(edl, forEdl);
  const row: Record<string, unknown> = { project_id: project.id, user_id: ownerId, opportunity_idx: idx, edl, guide, caption: edl.caption || null, model, updated_at: now() };
  if (wsId) row.workspace_id = wsId;
  const { data, error } = await client.from("studio_builds").upsert(row, { onConflict: "project_id,opportunity_idx" }).select(BUILD_COLS).single();
  if (error) throw error;
  return rowToBuild(data as BuildRow, rows);
}

/** Plan numbers the UI shows next to the drop zone (never hard-coded there). */
export function studioLimits(ent: Entitlements) {
  return {
    clipsPerProject: getLimit(ent, "studio_clips_per_project"),
    footageMinutes: getLimit(ent, "studio_footage_minutes"),
    uploadMb: getLimit(ent, "studio_upload_mb"),
  };
}
