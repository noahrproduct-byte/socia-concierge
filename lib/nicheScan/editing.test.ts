import { describe, it, expect } from "vitest";
import { editingFrom, readSceneLog } from "./editing";

// What ffmpeg's showinfo printed for a test video cut at 2.0 s and 4.0 s (checked 2026-11-17 on a real file).
const LOG = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'cuts.mp4':
  Duration: 00:00:06.00, start: 0.000000, bitrate: 2140 kb/s
[Parsed_showinfo_2 @ 0x1] n:   0 pts:  61440 pts_time:2       duration:   512 duration_time:0.0333333
[Parsed_showinfo_2 @ 0x1] n:   1 pts: 122880 pts_time:4       duration:   512 duration_time:0.0333333`;

describe("a Reel's editing, measured from its video", () => {
  it("reads the cut times and the length from ffmpeg's log", () => {
    expect(readSceneLog(LOG, 30)).toEqual({ cuts: [2, 4], durationSec: 6 });
  });
  it("turns cuts into shot length, cut rate and the first cut", () => {
    expect(editingFrom([2, 4], 6)).toEqual({ durationSec: 6, measuredSec: 6, cuts: [2, 4], cutsPer10s: 3.33, medianShotSec: 2, firstCutSec: 2 });
  });
  it("reads one continuous take as no cuts, and merges changes closer than a quarter second", () => {
    expect(editingFrom([], 33.6)).toMatchObject({ measuredSec: 30, cutsPer10s: 0, medianShotSec: 30, firstCutSec: null });
    expect(readSceneLog("Duration: 00:00:10.00\n pts_time:3.0\n pts_time:3.1\n pts_time:7", 30).cuts).toEqual([3, 7]);
  });
  it("leaves out the very start and the end of the window, where a change isn't a cut", () => {
    expect(readSceneLog("Duration: 00:00:40.00\n pts_time:0.05\n pts_time:12\n pts_time:29.99", 30).cuts).toEqual([12]);
  });
});
