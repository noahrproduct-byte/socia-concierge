import { describe, it, expect } from "vitest";
import { clipSpike, type ClipDeps, type ClipWatch } from "./clipFlow";
import { TwitchError, type TwitchClip } from "./twitch";
import type { Spike } from "./spikes";

const spike: Spike = { at: 1_000_000, rate: 4, baseline: 0.5, people: 30, hype: 0.6 };
const twitchClip = (id: string): TwitchClip => ({ id, url: `https://clips.twitch.tv/${id}`, embed_url: `https://clips.twitch.tv/embed?clip=${id}`, broadcaster_id: "b1", broadcaster_name: "Chan", title: "Chan clip", thumbnail_url: "https://thumb", duration: 30, created_at: "", view_count: 0, vod_offset: null, video_id: "" });

function deps(over: Partial<ClipDeps> = {}) {
  let clock = spike.at;
  const clips: Record<string, Record<string, unknown>> = {};
  const watchPatches: Record<string, unknown>[] = [];
  let polls = 0;
  const d: ClipDeps = {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    createClip: async () => ({ id: "c1", editUrl: "https://edit" }),
    clipsById: async (ids) => (++polls >= 2 ? ids.map(twitchClip) : []),
    clipDownloads: async (_b, ids) => ids.map((id) => ({ clipId: id, landscape: "https://land.mp4", portrait: null })),
    saveVideo: async (_url, rowId) => `u1/streams/${rowId}.mp4`,
    insertClip: async (row) => { clips.r1 = { ...row }; return "r1"; },
    updateClip: async (id, patch) => { Object.assign(clips[id], patch); },
    updateWatch: async (patch) => { watchPatches.push(patch); },
    sustainAfter: () => 12,
    ...over,
  };
  return { d, clips, watchPatches };
}
const watch = (canDownload: boolean | null = null): ClipWatch => ({ id: "w1", userId: "u1", workspaceId: null, channelId: "b1", login: "chan", duration: 30, canDownload });

describe("a chat spike becomes a clip", () => {
  it("clips, scores, waits for Twitch, and saves the video on an own or edited channel", async () => {
    const { d, clips, watchPatches } = deps();
    const w = watch();
    expect(await clipSpike(w, spike, d)).toBe("r1");
    expect(clips.r1).toMatchObject({ status: "ready", twitch_clip_id: "c1", url: "https://clips.twitch.tv/c1", sustain_sec: 12, video_path: "u1/streams/r1.mp4" });
    expect(clips.r1.score).toBeGreaterThan(50);
    expect(String(clips.r1.why)).toMatch(/Chat ran 8\.0× its usual pace with 30 people, 60% reacting, for 12 s\./);
    expect(w.canDownload).toBe(true);
    expect(watchPatches).toContainEqual({ can_download: true });
  });
  it("keeps the clip on Twitch when the person can't download this channel's clips, and stops asking", async () => {
    const { d, clips } = deps({ clipDownloads: async () => { throw new TwitchError(403, "clips_off", "not an editor"); } });
    const w = watch();
    await clipSpike(w, spike, d);
    expect(clips.r1).toMatchObject({ status: "ready" });
    expect(clips.r1.video_path).toBeUndefined();
    expect(w.canDownload).toBe(false);
    let asked = 0;
    const again = deps({ clipDownloads: async () => { asked++; return []; } });
    await clipSpike(w, spike, again.d);
    expect(asked).toBe(0);
  });
  it("says why when Twitch won't clip the channel, and lists nothing", async () => {
    const { d, clips, watchPatches } = deps({ createClip: async () => { throw new TwitchError(403, "clips_off", "This channel doesn't allow clips (clips are off, or only for followers or subscribers)."); } });
    expect(await clipSpike(watch(), spike, d)).toBeNull();
    expect(clips.r1).toBeUndefined();
    expect(watchPatches[0]).toEqual({ last_error: "This channel doesn't allow clips (clips are off, or only for followers or subscribers)." });
  });
  it("marks the clip failed when Twitch never finishes it", async () => {
    const { d, clips } = deps({ clipsById: async () => [] });
    await clipSpike(watch(), spike, d);
    expect(clips.r1).toMatchObject({ status: "failed", error: "Twitch didn't finish this clip." });
  });
});
