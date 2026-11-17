// From a chat spike to a finished clip, for the watcher (worker/stream-watcher).
// Kept apart from the network so it can be tested: Twitch, the database and the
// clock come in as functions.
//
//   spike seen -> Create Clip (Twitch captures ~85 s before, 5 s after, and
//   publishes the last `duration` seconds) -> a "making" row with what chat did
//   -> after the sustain window, the score -> Get Clips until Twitch has it
//   (up to 60 s, Twitch's own limit) -> "ready" with its link and picture ->
//   on the person's own or edited channel, the video saved for the editor.
import { scoreSpike, SPIKES, type Spike } from "./spikes";
import { TwitchError, type TwitchClip } from "./twitch";

export type ClipDeps = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  createClip: (broadcasterId: string, durationSec: number) => Promise<{ id: string; editUrl: string }>;
  clipsById: (ids: string[]) => Promise<TwitchClip[]>;
  /** Download links, or a TwitchError 403 when the person may not download this channel's clips. */
  clipDownloads: (broadcasterId: string, clipIds: string[]) => Promise<{ clipId: string; landscape: string | null; portrait: string | null }[]>;
  /** Fetch a URL's bytes and store them; returns the storage path. */
  saveVideo: (url: string, clipRowId: string) => Promise<string>;
  insertClip: (row: Record<string, unknown>) => Promise<string>;
  updateClip: (id: string, patch: Record<string, unknown>) => Promise<void>;
  updateWatch: (patch: Record<string, unknown>) => Promise<void>;
  /** chat's sustain after the spike, read once the sustain window has passed */
  sustainAfter: (spike: Spike) => number;
};

export type ClipWatch = { id: string; userId: string; workspaceId: string | null; channelId: string; login: string; duration: number; canDownload: boolean | null };

const iso = (ms: number) => new Date(ms).toISOString();
/** How long to wait for Twitch to finish a clip, and how often to ask. */
export const CLIP_READY_WAIT_MS = 60_000;
export const CLIP_READY_POLL_MS = 5_000;

/**
 * One spike, all the way to a clip. Never throws: what went wrong is written
 * on the clip or the watch, in words the person can act on. Returns the clip
 * row id (null when Twitch refused to clip).
 */
export async function clipSpike(watch: ClipWatch, spike: Spike, d: ClipDeps): Promise<string | null> {
  let made: { id: string; editUrl: string };
  try {
    made = await d.createClip(watch.channelId, watch.duration);
  } catch (e) {
    // Clips off, follower-only or not live: say so on the channel, once; nothing to list.
    if (e instanceof TwitchError && (e.kind === "clips_off" || e.kind === "not_live" || e.kind === "auth")) {
      await d.updateWatch({ last_error: e.message }).catch(() => null);
      return null;
    }
    await d.updateWatch({ last_error: "Twitch didn't make a clip just now. SOCIA keeps watching." }).catch(() => null);
    return null;
  }
  const rowId = await d.insertClip({
    watch_id: watch.id, user_id: watch.userId, workspace_id: watch.workspaceId, channel_id: watch.channelId, channel_login: watch.login,
    twitch_clip_id: made.id, edit_url: made.editUrl, spike_at: iso(spike.at), rate: spike.rate, baseline: spike.baseline, people: spike.people, hype: spike.hype,
    status: "making",
  });
  await d.updateWatch({ last_error: null }).catch(() => null);

  // The score needs chat's next twenty seconds.
  const sustainAt = spike.at + SPIKES.sustainWindowSec * 1000;
  if (d.now() < sustainAt) await d.sleep(sustainAt - d.now());
  const scored = scoreSpike(spike, d.sustainAfter(spike));
  await d.updateClip(rowId, { score: scored.score, sustain_sec: scored.sustainSec, why: scored.why, updated_at: iso(d.now()) });

  // Twitch makes the clip in the background.
  const deadline = spike.at + CLIP_READY_WAIT_MS + SPIKES.sustainWindowSec * 1000;
  let clip: TwitchClip | undefined;
  while (!clip) {
    clip = (await d.clipsById([made.id]).catch(() => [] as TwitchClip[]))[0];
    if (clip || d.now() >= deadline) break;
    await d.sleep(CLIP_READY_POLL_MS);
  }
  if (!clip) {
    await d.updateClip(rowId, { status: "failed", error: "Twitch didn't finish this clip.", updated_at: iso(d.now()) });
    return rowId;
  }
  await d.updateClip(rowId, { status: "ready", url: clip.url, embed_url: clip.embed_url, thumbnail_url: clip.thumbnail_url, title: clip.title, duration: clip.duration, updated_at: iso(d.now()) });

  // The video, only where Twitch allows it (the person's own channel or one they edit).
  if (watch.canDownload === false) return rowId;
  try {
    const [links] = await d.clipDownloads(watch.channelId, [made.id]);
    const url = links?.portrait ?? links?.landscape;
    if (!url) return rowId;
    const path = await d.saveVideo(url, rowId);
    await d.updateClip(rowId, { video_path: path, updated_at: iso(d.now()) });
    if (watch.canDownload !== true) { watch.canDownload = true; await d.updateWatch({ can_download: true }).catch(() => null); }
  } catch (e) {
    if (e instanceof TwitchError && (e.status === 403 || e.kind === "clips_off")) {
      watch.canDownload = false;
      await d.updateWatch({ can_download: false }).catch(() => null);
    }
  }
  return rowId;
}
