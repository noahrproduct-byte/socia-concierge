import { describe, expect, it } from "vitest";
import { briefIntent } from "./briefIntent";

describe("briefIntent", () => {
  it("keeps the whole video when the prompt only asks to finish it", () => {
    for (const p of ["add captions", "Add captions please", "put subtitles on this video", "add captions and music", "make it vertical with captions", "remove the background noise", "add some music", "captions", "add captions to what he says", "make it 9:16"]) {
      expect(briefIntent(p).keepWhole, p).toBe(true);
    }
  });
  it("makes a cut when the prompt asks for anything more", () => {
    for (const p of ["make a 30 second reel with captions", "cut the best parts and add captions", "show the double crust being made", "add captions and make it funny", "remove the ums", "shorten it and add music", "add captions, start with the hook", "", "make it look good"]) {
      expect(briefIntent(p).keepWhole, p).toBe(false);
    }
  });
  it("always cuts when there's a reference to copy", () => {
    expect(briefIntent("add captions", true).keepWhole).toBe(false);
  });
  it("knows whether music or captions were asked for", () => {
    expect(briefIntent("add captions")).toMatchObject({ music: false, captions: true });
    expect(briefIntent("add captions and music")).toMatchObject({ music: true, captions: true });
  });
});
