import { describe, expect, it } from "vitest";
import { toItem, usableAudioRow, AUDIO_SCOPE } from "./igAudio";

describe("toItem", () => {
  it("keeps music's artist, cover, length and links", () => {
    expect(toItem({ audio_id: "1", title: "Birthday Wish", display_artist: "Shuba", duration_in_ms: 153760, cover_artwork_thumbnail_uri: "https://c/x.jpg", download_url: "https://d/x.mp3", on_platform_audio_preview_link: "https://www.instagram.com/reels/audio/1" }, "music"))
      .toEqual({ id: "1", kind: "music", title: "Birthday Wish", by: "Shuba", cover: "https://c/x.jpg", durationSec: 154, link: "https://www.instagram.com/reels/audio/1", preview: "https://d/x.mp3" });
  });
  it("names an original sound by its creator and uses their picture", () => {
    expect(toItem({ audio_id: "2", title: "original audio", ig_username: "creator", profile_picture_url: "https://p/y.jpg" }, "original_sound"))
      .toMatchObject({ by: "@creator", cover: "https://p/y.jpg", durationSec: null, link: null, preview: null });
  });
  it("drops items without an id or a title", () => {
    expect(toItem({ title: "x" }, "music")).toBeNull();
    expect(toItem({ audio_id: "3" }, "music")).toBeNull();
  });
});

describe("usableAudioRow", () => {
  const ok = { connection_status: "connected", ig_business_id: "ig", user_access_token: "t", scopes: ["instagram_basic", AUDIO_SCOPE], user_token_expires_at: "2099-01-01T00:00:00Z" };
  it("needs the publish permission on a live, connected user token", () => {
    expect(usableAudioRow(ok)).toBe(true);
    expect(usableAudioRow({ ...ok, scopes: ["instagram_basic"] })).toBe(false);
    expect(usableAudioRow({ ...ok, user_access_token: null })).toBe(false);
    expect(usableAudioRow({ ...ok, connection_status: "expired" })).toBe(false);
    expect(usableAudioRow({ ...ok, user_token_expires_at: "2000-01-01T00:00:00Z" })).toBe(false);
  });
});
