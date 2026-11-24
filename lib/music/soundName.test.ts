import { describe, expect, it } from "vitest";
import { soundName } from "./soundName";

describe("soundName", () => {
  it("takes the downloader, the video id, the track number and the bitrate off", () => {
    expect(soundName("YTSave.to YouTube Media OnFlx2Lnr9Q Dean Martin That s Amore 008 128k")).toBe("Dean Martin That s Amore");
    expect(soundName("YTSave.to_YouTube_Media_m3xfP4M50wo_Ricchi-E-Poveri-Sara-Perche-Ti-Amo-Testo-Lyr.m4a")).toBe("Ricchi E Poveri Sara Perche Ti Amo Testo Lyr");
    expect(soundName("Song Title (Official Audio)")).toBe("Song Title");
  });
  it("leaves a name the person typed alone", () => {
    expect(soundName("Our lunch rush beat")).toBe("Our lunch rush beat");
    expect(soundName("Track 2")).toBe("Track 2");
    expect(soundName("128k")).toBe("128k");
  });
});
