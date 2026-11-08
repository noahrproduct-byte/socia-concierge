import { describe, expect, it } from "vitest";
import type { TranscriptWord } from "@/lib/transcribe/types";
import { cropShare, shotScale } from "./reframe";
import { speakerPath, speakerTurns } from "./speakers";

const share = cropShare(1920, 1080);
/** `n` words from `speaker` starting at `from` seconds, 0.4 s each. */
const said = (speaker: string, from: number, n: number): TranscriptWord[] =>
  Array.from({ length: n }, (_, i) => ({ text: "word", startMs: (from + i * 0.4) * 1000, endMs: (from + i * 0.4 + 0.35) * 1000, confidence: null, speaker }));
const seats = { camera: "one_camera", framing: "band", people: [{ speaker: "A", center: 0.25, y: 0.4 }, { speaker: "B", center: 0.75, y: 0.4 }] };
const band = Math.round(shotScale("band", share) * 1000) / 1000;

describe("who holds the floor", () => {
  it("starts at 0 and cuts on the first word of a new voice", () => {
    expect(speakerTurns([...said("A", 0.5, 20), ...said("B", 9, 20)])).toEqual([{ t: 0, speaker: "A" }, { t: 9, speaker: "B" }]);
  });

  it("ignores a short interjection", () => {
    expect(speakerTurns([...said("A", 0, 10), ...said("B", 4, 2), ...said("A", 5, 10)])).toEqual([{ t: 0, speaker: "A" }]);
  });

  it("knows nothing without labels", () => {
    expect(speakerTurns(said("A", 0, 3).map(({ speaker: _s, ...w }) => w))).toEqual([]);
  });
});

describe("following the conversation", () => {
  const talk = [...said("A", 0, 25), ...said("B", 12, 25), ...said("A", 24, 25)];

  it("cuts to whoever is talking, in a band", () => {
    expect(speakerPath(seats, talk, 40, share)).toEqual([
      { t: 0, c: 0.25, y: 0.4, s: band }, { t: 12, c: 0.75, y: 0.4, s: band }, { t: 24, c: 0.25, y: 0.4, s: band },
    ]);
  });

  it("uses a full-height crop when the people fill the source", () => {
    expect(speakerPath({ ...seats, framing: "tall" }, talk, 40, share)![0].s).toBe(1);
  });

  it("shows them both when they trade quick lines", () => {
    const quick = [...said("A", 0, 20), ...said("B", 8, 6), ...said("A", 10.6, 6), ...said("B", 13.2, 6), ...said("A", 15.8, 25)];
    const path = speakerPath(seats, quick, 30, share)!;
    expect(path.some((k) => k.c === 0.5 && k.s < 0.4)).toBe(true);
  });

  it("stays out of the way when it isn't a one-camera conversation", () => {
    expect(speakerPath({ ...seats, camera: "changes" }, talk, 40, share)).toBeNull();
    expect(speakerPath(seats, said("A", 0, 40), 40, share)).toBeNull();
    expect(speakerPath({ ...seats, people: seats.people.slice(0, 1) }, talk, 40, share)).toBeNull();
    expect(speakerPath(seats, talk, 40, 1)).toBeNull();
    expect(speakerPath(null, talk, 40, share)).toBeNull();
  });

  it("never gives the picture to someone off camera", () => {
    const withHost = [...said("A", 0, 25), ...said("C", 12, 25), ...said("A", 24, 25), ...said("B", 34, 20)];
    expect(speakerPath(seats, withHost, 50, share)!.map((k) => k.c)).toEqual([0.25, 0.75]);
  });
});
